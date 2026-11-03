import "server-only";

import { writeAudit } from "@/server/audit";
import { effectiveProjectRole } from "@/server/authz/roles";
import type { DbClient } from "@/server/db";
import { AppError, conflict } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/password";
import { passwordHashingSlot, rateLimit } from "@/server/rate-limit";

import type {
  ChangePasswordInput,
  NotificationPrefsInput,
  UpdateProfileInput,
} from "./schema";

/// Todo lo de este modulo actua sobre la propia cuenta: el id sale del actor,
/// nunca de la peticion, asi que no hay ninguna cuenta ajena que autorizar.
export type Actor = { id: string; email: string };

const PASSWORD_LIMIT = 8;
const PASSWORD_WINDOW_MS = 10 * 60 * 1000;
const ACTIVITY_LIMIT = 50;
const CARDS_LIMIT = 100;

export async function getAccount(db: DbClient, actor: Actor) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      name: true,
      email: true,
      imageUrl: true,
      passwordHash: true,
      googleSub: true,
      createdAt: true,
      notifyAssigned: true,
      notifyComments: true,
      notifyMembership: true,
      _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } },
    },
  });

  // El hash no sale de aqui: la interfaz solo necesita saber si existe.
  const { passwordHash, googleSub, _count, ...rest } = user;
  return {
    ...rest,
    hasPassword: passwordHash !== null,
    hasGoogle: googleSub !== null,
    sessionCount: _count.sessions,
  };
}

export async function updateProfile(
  db: DbClient,
  actor: Actor,
  input: UpdateProfileInput,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { name: input.name } });
    await writeAudit(tx, {
      orgId: null,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.profile_updated",
      entityType: "USER",
      entityId: actor.id,
      entityLabel: actor.email,
    });
  });
}

/// Cambia la contrasena o, en una cuenta de Google que no tiene, la crea.
/// Cierra TODAS las sesiones: una contrasena rotada con sesiones vivas no esta
/// rotada. La accion abre despues una nueva para quien acaba de cambiarla.
export async function changePassword(
  db: DbClient,
  actor: Actor,
  input: ChangePasswordInput,
): Promise<void> {
  if (!rateLimit(`password:user:${actor.id}`, PASSWORD_LIMIT, PASSWORD_WINDOW_MS).allowed) {
    throw new AppError("RATE_LIMITED", "Demasiados intentos. Prueba de nuevo en unos minutos.");
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { passwordHash: true },
  });

  if (user.passwordHash) {
    const valid = await passwordHashingSlot(() =>
      verifyPassword(input.currentPassword ?? "", user.passwordHash),
    );
    if (!valid) throw new AppError("UNAUTHENTICATED", "La contraseña actual no es correcta.");
  }

  const passwordHash = await passwordHashingSlot(() => hashPassword(input.newPassword));

  await db.$transaction(async (tx) => {
    // Condicionado al hash leido: entrar con Google a la vez borra la contrasena
    // (ver loginWithGoogle), y un cambio ya validado no debe poder resucitarla.
    const written = await tx.user.updateMany({
      where: { id: actor.id, passwordHash: user.passwordHash },
      data: { passwordHash },
    });
    if (written.count === 0) conflict("Tu cuenta ha cambiado. Recarga e inténtalo de nuevo.");

    await tx.session.deleteMany({ where: { userId: actor.id } });
    await writeAudit(tx, {
      orgId: null,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.password_changed",
      entityType: "USER",
      entityId: actor.id,
      entityLabel: actor.email,
    });
  });
}

export async function updateNotificationPrefs(
  db: DbClient,
  actor: Actor,
  input: NotificationPrefsInput,
): Promise<void> {
  await db.user.update({ where: { id: actor.id }, data: input });
}

/// Lo que ha hecho esta persona. Sin IP ni navegador: aqui no aportan nada y
/// la pantalla se puede quedar abierta a la vista de otros.
export async function listMyActivity(db: DbClient, actor: Actor) {
  return db.auditLog.findMany({
    // Tras una expulsion no quedan a la vista nombres ni correos de ese espacio.
    where: {
      actorId: actor.id,
      OR: [
        { orgId: null },
        { org: { archivedAt: null, memberships: { some: { userId: actor.id } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_LIMIT,
    select: {
      id: true,
      action: true,
      entityLabel: true,
      createdAt: true,
      org: { select: { name: true } },
    },
  });
}

/// Tarjetas pendientes en TODOS los espacios. Asignada no implica que pueda
/// verla: se pudo perder el acceso despues, asi que el permiso se vuelve a
/// resolver aqui, igual que en requireProjectAccess.
export async function listMyCards(db: DbClient, actor: Actor) {
  const rows = await db.issue.findMany({
    where: {
      assigneeId: actor.id,
      archivedAt: null,
      // Lo terminado, ordenado por vencimiento, taparia el trabajo pendiente.
      state: { category: { not: "DONE" } },
      project: {
        archivedAt: null,
        org: { archivedAt: null, memberships: { some: { userId: actor.id } } },
      },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: CARDS_LIMIT,
    select: {
      id: true,
      orgId: true,
      number: true,
      title: true,
      type: true,
      priority: true,
      dueDate: true,
      state: { select: { name: true } },
      project: {
        select: {
          key: true,
          name: true,
          visibility: true,
          org: {
            select: {
              name: true,
              memberships: { where: { userId: actor.id }, select: { role: true } },
            },
          },
          members: { where: { userId: actor.id }, select: { role: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const { key, name, visibility, org, members } = row.project;
    const role = effectiveProjectRole({
      orgRole: org.memberships[0]?.role ?? null,
      visibility,
      projectRole: members[0]?.role ?? null,
    });
    if (role === "NONE") return [];
    return [
      {
        id: row.id,
        orgId: row.orgId,
        orgName: org.name,
        projectKey: key,
        projectName: name,
        number: row.number,
        title: row.title,
        type: row.type,
        priority: row.priority,
        dueDate: row.dueDate,
        stateName: row.state.name,
      },
    ];
  });
}
