import "server-only";

import { writeAudit } from "@/server/audit";
import { can } from "@/server/authz/permissions";
import { requireOrgAccess, requireProjectAccess } from "@/server/authz/resolve";
import type { DbClient, TxClient } from "@/server/db";
import { AppError, conflict, forbidden, notFound } from "@/server/errors";
import { hashToken, newToken } from "@/server/tokens";
import { normalizeEmail } from "@/lib/identifiers";

import type { ProjectRole } from "@prisma/client";

import { uniqueOrgSlug } from "./slug";

import type {
  AcceptInviteInput,
  CreateOrganizationInput,
  InviteMemberInput,
  ProjectMemberInput,
  RemoveMemberInput,
  RemoveProjectMemberInput,
  UpdateMemberRoleInput,
} from "./schema";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type Actor = { id: string; email: string };

export async function listMembers(db: DbClient, actor: Actor, orgId: string) {
  await requireOrgAccess(db, actor.id, orgId, "org.read");

  return db.membership.findMany({
    where: { orgId },
    select: {
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

export async function listMyOrganizations(db: DbClient, actor: Actor) {
  return db.membership.findMany({
    where: { userId: actor.id, org: { archivedAt: null } },
    select: {
      role: true,
      org: {
        select: { id: true, name: true, slug: true, _count: { select: { projects: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/// Resultado de invitar, al estilo Trello.
///
/// Si la persona YA tiene cuenta entra en el acto; si no, se genera un enlace
/// de invitacion. Quien invita ve una cosa u otra, asi que esto revela si una
/// direccion tiene cuenta — igual que en Trello. Solo pueden invitar ADMIN y
/// OWNER de la organizacion, asi que no es enumeracion anonima.
export type InviteOutcome =
  | { kind: "added"; userId: string; name: string; email: string }
  | { kind: "invited"; invitationId: string; token: string; expiresAt: Date };

export async function inviteMember(
  db: DbClient,
  actor: Actor,
  input: InviteMemberInput,
): Promise<InviteOutcome> {
  await requireOrgAccess(db, actor.id, input.orgId, "org.member.invite");

  // Invitacion directa a un tablero: hace falta mandar en ESE tablero, no
  // solo en la organizacion.
  const project = input.projectId
    ? await db.project.findFirst({
        where: { id: input.projectId, orgId: input.orgId, archivedAt: null },
        select: { id: true, key: true },
      })
    : null;
  if (input.projectId) {
    if (!project) notFound("El proyecto");
    await requireProjectAccess(db, actor.id, project.id, "project.member.manage");
  }

  const projectRole = project ? (input.projectRole ?? "MEMBER") : null;

  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true },
  });

  if (user) {
    return addExistingUser(db, actor, { ...input, user, project, projectRole });
  }

  return createPendingInvite(db, actor, { ...input, project, projectRole });
}

async function addExistingUser(
  db: DbClient,
  actor: Actor,
  args: Omit<InviteMemberInput, "projectId" | "projectRole"> & {
    user: { id: string; name: string; email: string };
    project: { id: string; key: string } | null;
    projectRole: ProjectRole | null;
  },
): Promise<InviteOutcome> {
  const { user, project, projectRole } = args;

  const membership = await db.membership.findUnique({
    where: { userId_orgId: { userId: user.id, orgId: args.orgId } },
    select: { role: true },
  });

  const alreadyOnBoard =
    project !== null &&
    (await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      select: { userId: true },
    })) !== null;

  if (membership && (project === null || alreadyOnBoard)) {
    conflict(
      project
        ? "Esa persona ya esta en este tablero."
        : "Esa persona ya pertenece a la organizacion.",
    );
  }

  await db.$transaction(async (tx) => {
    // Si ya pertenece a la organizacion no se le toca el rol: anadirla a un
    // tablero no debe cambiar lo que puede hacer en el resto.
    if (!membership) {
      await tx.membership.create({
        data: { orgId: args.orgId, userId: user.id, role: args.role },
      });
    }

    if (project && projectRole) {
      await tx.projectMember.create({
        data: { projectId: project.id, userId: user.id, role: projectRole },
      });
    }

    await writeAudit(tx, {
      orgId: args.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: project ? "project.member_added" : "membership.added",
      entityType: project ? "PROJECT" : "MEMBERSHIP",
      entityId: project ? project.id : user.id,
      entityLabel: user.email,
      diff: {
        orgRole: membership ? null : args.role,
        projectRole,
        project: project?.key ?? null,
      },
    });
  });

  return { kind: "added", userId: user.id, name: user.name, email: user.email };
}

async function createPendingInvite(
  db: DbClient,
  actor: Actor,
  args: Omit<InviteMemberInput, "projectId" | "projectRole"> & {
    project: { id: string; key: string } | null;
    projectRole: ProjectRole | null;
  },
): Promise<InviteOutcome> {
  const token = newToken();

  const invitation = await db.$transaction(async (tx) => {
    // Una invitacion pendiente previa se revoca: dos tokens vivos para el
    // mismo correo son dos caminos de entrada que auditar por separado.
    await tx.invitation.updateMany({
      where: { orgId: args.orgId, email: args.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const created = await tx.invitation.create({
      data: {
        orgId: args.orgId,
        email: args.email,
        role: args.role,
        tokenHash: hashToken(token),
        invitedById: actor.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        projectId: args.project?.id ?? null,
        projectRole: args.projectRole,
      },
      select: { id: true, expiresAt: true },
    });

    await writeAudit(tx, {
      orgId: args.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "invitation.created",
      entityType: "INVITATION",
      entityId: created.id,
      entityLabel: args.email,
      diff: { role: args.role, project: args.project?.key ?? null, projectRole: args.projectRole },
    });

    return created;
  });

  return {
    kind: "invited",
    invitationId: invitation.id,
    token,
    expiresAt: invitation.expiresAt,
  };
}

export async function acceptInvite(
  db: DbClient,
  actor: Actor,
  input: AcceptInviteInput,
): Promise<{ orgId: string; orgSlug: string; projectKey: string | null }> {
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: {
      id: true,
      orgId: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      projectId: true,
      projectRole: true,
      org: { select: { slug: true, archivedAt: true } },
      project: { select: { id: true, key: true, archivedAt: true } },
      invitedById: true,
    },
  });

  if (!invitation || invitation.revokedAt || invitation.org.archivedAt) notFound("La invitacion");

  // Una invitacion solo vale mientras quien la emitio siga pudiendo invitar.
  // Sin esto, un administrador expulsado vuelve a entrar durante 7 dias por
  // un enlace que dejo abierto a una direccion suya.
  const inviter = await db.membership.findUnique({
    where: { userId_orgId: { userId: invitation.invitedById, orgId: invitation.orgId } },
    select: { role: true },
  });
  if (!inviter || !can(inviter.role, "org.member.invite")) notFound("La invitacion");
  if (invitation.acceptedAt) conflict("Esa invitacion ya se ha usado.");
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError("NOT_FOUND", "La invitacion ha caducado.");
  }

  // Defensa en profundidad: el esquema de Zod ya excluye OWNER de los roles
  // invitables, pero la columna admite el enum completo.
  if (invitation.role === "OWNER") notFound("La invitacion");

  // Decision explicita: la invitacion es para un correo concreto. Aceptarla
  // con otra cuenta seria una via de escalada, porque quien tenga el enlace
  // entraria con la identidad que quisiera.
  if (invitation.email !== normalizeEmail(actor.email)) {
    forbidden("Esta invitacion es para otra direccion de correo.");
  }

  const joinsProject =
    invitation.project !== null &&
    invitation.project.archivedAt === null &&
    invitation.projectRole !== null;

  await db.$transaction(async (tx) => {
    const marked = await tx.invitation.updateMany({
      // Filtrar por acceptedAt/revokedAt hace el canje idempotente: dos
      // peticiones simultaneas no crean dos pertenencias.
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (marked.count === 0) conflict("Esa invitacion ya se ha usado.");

    await tx.membership.upsert({
      where: { userId_orgId: { userId: actor.id, orgId: invitation.orgId } },
      // Si ya pertenecia, no se le cambia el rol por aceptar un enlace.
      update: {},
      create: { orgId: invitation.orgId, userId: actor.id, role: invitation.role },
    });

    if (joinsProject && invitation.project && invitation.projectRole) {
      await tx.projectMember.upsert({
        where: {
          projectId_userId: { projectId: invitation.project.id, userId: actor.id },
        },
        update: {},
        create: {
          projectId: invitation.project.id,
          userId: actor.id,
          role: invitation.projectRole,
        },
      });
    }

    await writeAudit(tx, {
      orgId: invitation.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "invitation.accepted",
      entityType: "MEMBERSHIP",
      entityId: actor.id,
      entityLabel: actor.email,
      diff: {
        role: invitation.role,
        invitedEmail: invitation.email,
        project: invitation.project?.key ?? null,
      },
    });
  });

  return {
    orgId: invitation.orgId,
    orgSlug: invitation.org.slug,
    projectKey: joinsProject ? (invitation.project?.key ?? null) : null,
  };
}

export async function updateMemberRole(
  db: DbClient,
  actor: Actor,
  input: UpdateMemberRoleInput,
): Promise<void> {
  const scope = await requireOrgAccess(db, actor.id, input.orgId, "org.member.update");

  // Solo un OWNER crea o degrada a otro OWNER. Un ADMIN capaz de nombrar
  // OWNERs se promociona a si mismo en dos pasos.
  if (input.role === "OWNER" && scope.role !== "OWNER") {
    forbidden("Solo un propietario puede transferir la propiedad.");
  }

  const target = await db.membership.findUnique({
    where: { userId_orgId: { userId: input.userId, orgId: input.orgId } },
    select: { role: true, user: { select: { email: true } } },
  });
  if (!target) notFound("El miembro");
  if (target.role === input.role) return;

  if (target.role === "OWNER" && scope.role !== "OWNER") {
    forbidden("Solo un propietario puede degradar a otro.");
  }

  await db.$transaction(async (tx) => {
    // Dentro de la transaccion y con bloqueo: comprobarlo fuera era una
    // carrera que podia dejar la organizacion sin ningun propietario.
    if (target.role === "OWNER") {
      await assertNotLastOwner(tx, input.orgId, input.userId);
    }

    await tx.membership.update({
      where: { userId_orgId: { userId: input.userId, orgId: input.orgId } },
      data: { role: input.role },
    });

    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "membership.role_changed",
      entityType: "MEMBERSHIP",
      entityId: input.userId,
      entityLabel: target.user.email,
      diff: { role: { from: target.role, to: input.role } },
    });
  });
}

export async function removeMember(
  db: DbClient,
  actor: Actor,
  input: RemoveMemberInput,
): Promise<void> {
  const scope = await requireOrgAccess(db, actor.id, input.orgId, "org.member.remove");

  const target = await db.membership.findUnique({
    where: { userId_orgId: { userId: input.userId, orgId: input.orgId } },
    select: { role: true, user: { select: { email: true } } },
  });
  if (!target) notFound("El miembro");

  if (target.role === "OWNER" && scope.role !== "OWNER") {
    forbidden("Solo un propietario puede expulsar a otro.");
  }

  await db.$transaction(async (tx) => {
    if (target.role === "OWNER") {
      await assertNotLastOwner(tx, input.orgId, input.userId);
    }

    await tx.membership.delete({
      where: { userId_orgId: { userId: input.userId, orgId: input.orgId } },
    });
    // La pertenencia a proyectos de esa organizacion deja de tener sentido.
    await tx.projectMember.deleteMany({
      where: { userId: input.userId, project: { orgId: input.orgId } },
    });

    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "membership.removed",
      entityType: "MEMBERSHIP",
      entityId: input.userId,
      entityLabel: target.user.email,
      diff: { role: target.role },
    });
  });
}

/// Invariante: toda organizacion conserva al menos un OWNER.
///
/// Se comprueba DENTRO de la transaccion y tomando el bloqueo de las filas
/// de propietario. Contar fuera era una carrera: dos propietarios que se
/// degradasen a la vez leian ambos "quedan 2", pasaban los dos, y la
/// organizacion se quedaba sin ninguno. Sin OWNER nadie puede volver a
/// nombrar uno ni borrar la organizacion: es irrecuperable desde la interfaz.
async function assertNotLastOwner(
  tx: TxClient,
  orgId: string,
  userId: string,
): Promise<void> {
  const owners = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT "userId" FROM "Membership"
    WHERE "orgId" = ${orgId} AND "role" = 'OWNER'
    FOR UPDATE
  `;

  if (owners.length <= 1) {
    conflict("La organizacion debe conservar al menos un propietario.", { userId });
  }
}

/// Crea un espacio de trabajo para quien ya tiene cuenta pero ninguno.
/// Separado del registro a proposito: en Trello primero existe la cuenta.
export async function createOrganization(
  db: DbClient,
  actor: Actor,
  input: CreateOrganizationInput,
): Promise<{ orgId: string; slug: string }> {
  const slug = await uniqueOrgSlug(db, input.name);

  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.name,
        slug,
        memberships: { create: { userId: actor.id, role: "OWNER" } },
      },
      select: { id: true, slug: true },
    });

    await writeAudit(tx, {
      orgId: org.id,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "organization.created",
      entityType: "ORGANIZATION",
      entityId: org.id,
      entityLabel: input.name,
    });

    return { orgId: org.id, slug: org.slug };
  });
}


// ------------------------------------------------- miembros de un tablero

export async function listProjectMembers(db: DbClient, actor: Actor, projectId: string) {
  const scope = await requireProjectAccess(db, actor.id, projectId, "project.read");

  const [explicit, orgMembers] = await Promise.all([
    db.projectMember.findMany({
      where: { projectId },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.membership.findMany({
      where: { orgId: scope.orgId },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const onBoard = new Set(explicit.map((member) => member.user.id));

  return {
    members: explicit,
    // Gente de la organizacion que todavia no esta en el tablero: en un
    // proyecto ORG ya puede verlo, pero anadirla explicitamente es lo que
    // permite asignarle un rol propio y lo que espera quien viene de Trello.
    candidates: orgMembers.filter((member) => !onBoard.has(member.user.id)),
    role: scope.role,
    orgId: scope.orgId,
  };
}

export async function addProjectMember(
  db: DbClient,
  actor: Actor,
  input: ProjectMemberInput,
): Promise<void> {
  const scope = await requireProjectAccess(
    db,
    actor.id,
    input.projectId,
    "project.member.manage",
  );

  // Solo gente de la MISMA organizacion. Sin esta comprobacion, un userId de
  // otro tenant entraria en el tablero con un identificador del cuerpo de la
  // peticion.
  const member = await db.membership.findUnique({
    where: { userId_orgId: { userId: input.userId, orgId: scope.orgId } },
    select: { user: { select: { email: true } } },
  });
  if (!member) notFound("La persona");

  await db.$transaction(async (tx) => {
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
      update: { role: input.role },
      create: { projectId: input.projectId, userId: input.userId, role: input.role },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.member_added",
      entityType: "PROJECT",
      entityId: input.projectId,
      entityLabel: scope.projectKey,
      diff: { userEmail: member.user.email, projectRole: input.role },
    });
  });
}

export async function removeProjectMember(
  db: DbClient,
  actor: Actor,
  input: RemoveProjectMemberInput,
): Promise<void> {
  const scope = await requireProjectAccess(
    db,
    actor.id,
    input.projectId,
    "project.member.manage",
  );

  const existing = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    select: { role: true, user: { select: { email: true } } },
  });
  if (!existing) notFound("La persona");

  await db.$transaction(async (tx) => {
    await tx.projectMember.delete({
      where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.member_removed",
      entityType: "PROJECT",
      entityId: input.projectId,
      entityLabel: scope.projectKey,
      diff: { userEmail: existing.user.email, projectRole: existing.role },
    });
  });
}
