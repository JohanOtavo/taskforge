import "server-only";

import { z } from "zod";

import { writeAudit } from "@/server/audit";
import { requireOrgAccess, requireProjectAccess } from "@/server/authz/resolve";
import { effectiveProjectRole } from "@/server/authz/roles";
import type { DbClient } from "@/server/db";
import { AppError, forbidden, notFound } from "@/server/errors";

import type { OrgRole } from "@prisma/client";

/// Archivar, restaurar y eliminar proyectos.
///
/// Archivar es reversible y no toca nada: el tablero desaparece de la portada
/// y deja de abrirse. Eliminar es definitivo y por eso pide dos pasos: el
/// proyecto tiene que estar archivado antes, y hay que escribir su clave.
///
/// Solo pueden hacerlo el dueno del espacio y quien creo el proyecto. Ni los
/// administradores ni los miembros: un tablero con el trabajo de varios no lo
/// hace desaparecer cualquiera que pueda gestionarlo.

export type Actor = { id: string; email: string };

const DENIED = "Solo el dueño del espacio o quien creó el proyecto puede archivarlo o eliminarlo.";

function canManageLifecycle(
  orgRole: OrgRole | null,
  createdById: string | null,
  actorId: string,
): boolean {
  return orgRole === "OWNER" || (createdById !== null && createdById === actorId);
}

export const projectIdSchema = z.object({ projectId: z.string().cuid() }).strict();
export const deleteProjectSchema = z
  .object({ projectId: z.string().cuid(), confirmKey: z.string().trim().max(20) })
  .strict();

export async function archiveProject(db: DbClient, actor: Actor, projectId: string): Promise<void> {
  const scope = await requireProjectAccess(db, actor.id, projectId, "project.read");
  const [project, membership] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { createdById: true } }),
    db.membership.findUnique({
      where: { userId_orgId: { userId: actor.id, orgId: scope.orgId } },
      select: { role: true },
    }),
  ]);
  if (!canManageLifecycle(membership?.role ?? null, project.createdById, actor.id)) {
    forbidden(DENIED);
  }

  await db.$transaction(async (tx) => {
    const archived = await tx.project.updateMany({
      where: { id: projectId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (archived.count === 0) notFound("El proyecto");

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.archived",
      entityType: "PROJECT",
      entityId: projectId,
      entityLabel: scope.projectKey,
    });
  });
}

/// requireProjectAccess solo encuentra proyectos SIN archivar, asi que para
/// los archivados se repite aqui la misma regla de acceso.
async function requireArchivedProject(db: DbClient, actor: Actor, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, archivedAt: { not: null } },
    select: {
      id: true,
      key: true,
      orgId: true,
      visibility: true,
      createdById: true,
      org: {
        select: {
          archivedAt: true,
          memberships: { where: { userId: actor.id }, select: { role: true } },
        },
      },
      members: { where: { userId: actor.id }, select: { role: true } },
    },
  });
  if (!project || project.org.archivedAt) notFound("El proyecto");

  const role = effectiveProjectRole({
    orgRole: project.org.memberships[0]?.role ?? null,
    visibility: project.visibility,
    projectRole: project.members[0]?.role ?? null,
  });
  // Igual que en requireProjectAccess: sin acceso es indistinguible de "no existe".
  if (role === "NONE") notFound("El proyecto");
  if (!canManageLifecycle(project.org.memberships[0]?.role ?? null, project.createdById, actor.id)) {
    forbidden(DENIED);
  }
  return project;
}

export async function restoreProject(db: DbClient, actor: Actor, projectId: string): Promise<void> {
  const project = await requireArchivedProject(db, actor, projectId);

  await db.$transaction(async (tx) => {
    const restored = await tx.project.updateMany({
      where: { id: projectId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    if (restored.count === 0) notFound("El proyecto");

    await writeAudit(tx, {
      orgId: project.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.restored",
      entityType: "PROJECT",
      entityId: projectId,
      entityLabel: project.key,
    });
  });
}

/// Borra el proyecto con todo lo que cuelga de el (tarjetas, comentarios,
/// columnas, fases, miembros), por las cascadas de la base de datos. La
/// auditoria se escribe antes y sobrevive: no tiene FK al proyecto.
export async function deleteProject(
  db: DbClient,
  actor: Actor,
  input: z.infer<typeof deleteProjectSchema>,
): Promise<void> {
  const project = await requireArchivedProject(db, actor, input.projectId);

  // Tambien en el servidor: el aviso del navegador se puede saltar.
  if (input.confirmKey.toUpperCase() !== project.key) {
    throw new AppError(
      "VALIDATION",
      `Escribe la clave del proyecto (${project.key}) para confirmar que quieres eliminarlo.`,
    );
  }

  await db.$transaction(async (tx) => {
    await writeAudit(tx, {
      orgId: project.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.deleted",
      entityType: "PROJECT",
      entityId: project.id,
      entityLabel: project.key,
    });
    // Los avisos no tienen FK al proyecto: sin esto quedarian enlaces a un 404.
    await tx.notification.deleteMany({
      where: {
        orgId: project.orgId,
        OR: [{ path: `/p/${project.key}` }, { path: { startsWith: `/p/${project.key}/` } }],
      },
    });
    await tx.project.delete({ where: { id: project.id } });
  });
}

/// Proyectos archivados del espacio, con la misma regla de visibilidad que la
/// portada, y si esta persona puede restaurarlos o eliminarlos.
export async function listArchivedProjects(db: DbClient, actor: Actor, orgId: string) {
  const scope = await requireOrgAccess(db, actor.id, orgId, "org.read");
  const seesEverything = scope.role === "ADMIN" || scope.role === "OWNER";

  const rows = await db.project.findMany({
    where: {
      orgId,
      archivedAt: { not: null },
      ...(seesEverything
        ? {}
        : {
            OR: [
              { visibility: "ORG" },
              { visibility: "PRIVATE", members: { some: { userId: actor.id } } },
            ],
          }),
    },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      key: true,
      name: true,
      archivedAt: true,
      createdById: true,
    },
  });

  return rows.map(({ createdById, ...row }) => {
    const allowed = scope.role === "OWNER" || createdById === actor.id;
    return { ...row, canRestore: allowed, canDelete: allowed };
  });
}
