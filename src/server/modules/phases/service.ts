import "server-only";

import { z } from "zod";

import { writeAudit } from "@/server/audit";
import { requireProjectAccess } from "@/server/authz/resolve";
import type { DbClient } from "@/server/db";
import { conflict, notFound } from "@/server/errors";
import { publishBoardEvent } from "@/server/realtime/publish";

export type Actor = { id: string; email: string };

const name = z.string().trim().min(1, "Indica un nombre.").max(60, "Máximo 60 caracteres.");

export const createPhaseSchema = z.object({ projectId: z.string().cuid(), name }).strict();
export const renamePhaseSchema = z.object({ phaseId: z.string().cuid(), name }).strict();
export const movePhaseSchema = z
  .object({ phaseId: z.string().cuid(), direction: z.enum(["up", "down"]) })
  .strict();
export const deletePhaseSchema = z.object({ phaseId: z.string().cuid() }).strict();

/// Fases del tablero con cuantas tarjetas activas tiene cada una, y cuantas
/// no tienen fase. Un solo groupBy en vez de un _count por fase.
export async function listPhases(db: DbClient, actor: Actor, projectId: string) {
  await requireProjectAccess(db, actor.id, projectId, "project.read");

  const [phases, counts] = await Promise.all([
    db.phase.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
    db.issue.groupBy({
      by: ["phaseId"],
      where: { projectId, archivedAt: null },
      _count: { _all: true },
    }),
  ]);

  const countOf = new Map(counts.map((row) => [row.phaseId, row._count._all]));
  return {
    phases: phases.map((phase) => ({ ...phase, issueCount: countOf.get(phase.id) ?? 0 })),
    unphasedCount: countOf.get(null) ?? 0,
    totalCount: counts.reduce((sum, row) => sum + row._count._all, 0),
  };
}

async function assertFreeName(db: DbClient, projectId: string, value: string, exceptId?: string) {
  const taken = await db.phase.findFirst({
    where: {
      projectId,
      name: { equals: value, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (taken) conflict("Ya hay una fase con ese nombre en este tablero.");
}

/// La fase y su tablero, con el permiso comprobado. Gestionar fases es
/// gestionar la estructura del tablero: el mismo permiso que las columnas.
async function requirePhase(db: DbClient, actor: Actor, phaseId: string) {
  const phase = await db.phase.findUnique({
    where: { id: phaseId },
    select: { id: true, name: true, position: true, projectId: true },
  });
  if (!phase) notFound("La fase");
  const scope = await requireProjectAccess(db, actor.id, phase.projectId, "project.column.manage");
  return { phase, scope };
}

export async function createPhase(
  db: DbClient,
  actor: Actor,
  input: z.infer<typeof createPhaseSchema>,
): Promise<{ id: string }> {
  const scope = await requireProjectAccess(db, actor.id, input.projectId, "project.column.manage");
  await assertFreeName(db, input.projectId, input.name);

  return db.$transaction(async (tx) => {
    const last = await tx.phase.findFirst({
      where: { projectId: input.projectId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const phase = await tx.phase.create({
      data: { projectId: input.projectId, name: input.name, position: (last?.position ?? -1) + 1 },
      select: { id: true },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "phase.created",
      entityType: "PROJECT",
      entityId: input.projectId,
      entityLabel: `${scope.projectKey}: ${input.name}`,
    });
    await publishBoardEvent(tx, {
      projectId: input.projectId,
      type: "phase.updated",
      entityId: phase.id,
      payload: {},
      actorId: actor.id,
    });
    return phase;
  });
}

export async function renamePhase(
  db: DbClient,
  actor: Actor,
  input: z.infer<typeof renamePhaseSchema>,
): Promise<void> {
  const { phase, scope } = await requirePhase(db, actor, input.phaseId);
  await assertFreeName(db, phase.projectId, input.name, phase.id);

  await db.$transaction(async (tx) => {
    await tx.phase.update({ where: { id: phase.id }, data: { name: input.name } });
    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "phase.renamed",
      entityType: "PROJECT",
      entityId: phase.projectId,
      entityLabel: `${scope.projectKey}: ${phase.name} → ${input.name}`,
    });
    await publishBoardEvent(tx, {
      projectId: phase.projectId,
      type: "phase.updated",
      entityId: phase.id,
      payload: {},
      actorId: actor.id,
    });
  });
}

/// Intercambia la posicion con la fase vecina. Sin vecina en esa direccion no
/// hace nada: subir la primera no es un error.
export async function movePhase(
  db: DbClient,
  actor: Actor,
  input: z.infer<typeof movePhaseSchema>,
): Promise<void> {
  const { phase } = await requirePhase(db, actor, input.phaseId);

  await db.$transaction(async (tx) => {
    const neighbour = await tx.phase.findFirst({
      where: {
        projectId: phase.projectId,
        position: input.direction === "up" ? { lt: phase.position } : { gt: phase.position },
      },
      orderBy: { position: input.direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true },
    });
    if (!neighbour) return;

    await tx.phase.update({ where: { id: phase.id }, data: { position: neighbour.position } });
    await tx.phase.update({ where: { id: neighbour.id }, data: { position: phase.position } });
    await publishBoardEvent(tx, {
      projectId: phase.projectId,
      type: "phase.updated",
      entityId: phase.id,
      payload: {},
      actorId: actor.id,
    });
  });
}

/// Borra la fase y deja SIN fase sus tarjetas: una fase es una forma de
/// agrupar, y quitar el grupo no puede llevarse el trabajo por delante.
export async function deletePhase(
  db: DbClient,
  actor: Actor,
  input: z.infer<typeof deletePhaseSchema>,
): Promise<void> {
  const { phase, scope } = await requirePhase(db, actor, input.phaseId);

  await db.$transaction(async (tx) => {
    // Incluye las archivadas: la FK no deja borrar una fase con tarjetas.
    await tx.issue.updateMany({ where: { phaseId: phase.id }, data: { phaseId: null } });
    await tx.phase.delete({ where: { id: phase.id } });
    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "phase.deleted",
      entityType: "PROJECT",
      entityId: phase.projectId,
      entityLabel: `${scope.projectKey}: ${phase.name}`,
    });
    await publishBoardEvent(tx, {
      projectId: phase.projectId,
      type: "phase.updated",
      entityId: phase.id,
      payload: {},
      actorId: actor.id,
    });
  });
}
