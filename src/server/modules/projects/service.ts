import "server-only";

import { writeAudit, buildDiff } from "@/server/audit";
import { requireOrgAccess, requireProjectAccess } from "@/server/authz/resolve";
import type { DbClient } from "@/server/db";
import { conflict, notFound } from "@/server/errors";

import { DEFAULT_WORKFLOW, type CreateProjectInput, type UpdateProjectInput } from "./schema";

export type Actor = { id: string; email: string };

/// Posicion de columnas en pasos de 1000: son pocas y se reordenan poco, asi
/// que un entero con huecos basta. El fractional indexing solo hace falta
/// para los issues, donde el arrastre es constante.
const COLUMN_STEP = 1000;

export async function createProject(
  db: DbClient,
  actor: Actor,
  input: CreateProjectInput,
): Promise<{ id: string; key: string }> {
  await requireOrgAccess(db, actor.id, input.orgId, "project.create");

  const taken = await db.project.findUnique({
    where: { orgId_key: { orgId: input.orgId, key: input.key } },
    select: { id: true },
  });
  if (taken) conflict(`La clave ${input.key} ya esta en uso en esta organizacion.`);

  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        orgId: input.orgId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility,
        // Quien lo crea es administrador del proyecto, aunque en la
        // organizacion sea solo MEMBER.
        members: { create: { userId: actor.id, role: "ADMIN" } },
      },
      select: { id: true, key: true },
    });

    // Estado y columna nacen emparejados. Un proyecto sin estados no puede
    // recibir issues, asi que esto no puede quedar fuera de la transaccion.
    for (const [index, step] of DEFAULT_WORKFLOW.entries()) {
      const state = await tx.workflowState.create({
        data: {
          projectId: project.id,
          name: step.name,
          category: step.category,
          position: (index + 1) * COLUMN_STEP,
        },
        select: { id: true },
      });

      await tx.boardColumn.create({
        data: {
          projectId: project.id,
          stateId: state.id,
          name: step.name,
          position: (index + 1) * COLUMN_STEP,
        },
      });
    }

    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.created",
      entityType: "PROJECT",
      entityId: project.id,
      entityLabel: `${project.key} ${input.name}`,
      diff: { key: project.key, visibility: input.visibility },
    });

    return project;
  });
}

export async function updateProject(
  db: DbClient,
  actor: Actor,
  input: UpdateProjectInput,
): Promise<void> {
  const scope = await requireProjectAccess(db, actor.id, input.projectId, "project.update");

  const before = await db.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: { name: true, description: true, visibility: true },
  });

  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
  };
  if (Object.keys(patch).length === 0) return;

  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: input.projectId }, data: patch });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "project.updated",
      entityType: "PROJECT",
      entityId: input.projectId,
      entityLabel: scope.projectKey,
      diff: buildDiff(before, patch),
    });
  });
}

export async function listProjects(db: DbClient, actor: Actor, orgId: string) {
  const scope = await requireOrgAccess(db, actor.id, orgId, "org.read");

  // Un OWNER/ADMIN ve todo; el resto ve los proyectos ORG mas los PRIVATE a
  // los que pertenece. Replica la regla de effectiveProjectRole en una sola
  // consulta en vez de filtrar en memoria.
  const seesEverything = scope.role === "ADMIN" || scope.role === "OWNER";

  const rows = await db.project.findMany({
    where: {
      orgId,
      archivedAt: null,
      ...(seesEverything
        ? {}
        : {
            OR: [
              { visibility: "ORG" },
              { visibility: "PRIVATE", members: { some: { userId: actor.id } } },
            ],
          }),
    },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      visibility: true,
    },
    orderBy: { key: "asc" },
  });

  // Igual que en getBoard: un `_count` filtrado agrega la tabla Issue
  // entera. Aqui el agregado se acota a los proyectos que se van a pintar.
  const counts = rows.length
    ? await db.issue.groupBy({
        by: ["projectId"],
        where: { projectId: { in: rows.map((row) => row.id) }, archivedAt: null },
        _count: { _all: true },
      })
    : [];

  const byProject = new Map(counts.map((row) => [row.projectId, row._count._all]));

  return rows.map((row) => ({ ...row, _count: { issues: byProject.get(row.id) ?? 0 } }));
}

/// Lectura del tablero.
///
/// El `key` solo es unico DENTRO de una organizacion (@@unique([orgId, key])).
/// Buscarlo sin acotar devolvia una fila arbitraria de cualquier inquilino: con
/// dos organizaciones que tengan un proyecto "TF", /p/TF resolvia al que
/// alcanzase antes el planificador.
export async function getBoard(
  db: DbClient,
  actor: Actor,
  orgId: string,
  projectKey: string,
) {
  const project = await db.project.findFirst({
    where: { orgId, key: projectKey, archivedAt: null },
    select: { id: true },
  });
  if (!project) notFound("El proyecto");

  const scope = await requireProjectAccess(db, actor.id, project.id, "project.read");

  const [detail, columns] = await Promise.all([
    db.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { id: true, key: true, name: true, description: true, visibility: true },
    }),
    db.boardColumn.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        wipLimit: true,
        state: { select: { id: true, name: true, category: true } },
        issues: {
          where: { archivedAt: null },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: {
            id: true,
            number: true,
            title: true,
            type: true,
            priority: true,
            position: true,
            version: true,
            storyPoints: true,
            dueDate: true,
            assignee: { select: { id: true, name: true, imageUrl: true } },
            labels: { select: { label: { select: { id: true, name: true, color: true } } } },
          },
        },
      },
    }),
  ]);

  // El conteo de comentarios va aparte, acotado a los issues del tablero.
  //
  // Un `_count` filtrado dentro del select NO se compila a una subconsulta
  // correlacionada: Prisma emite una tabla derivada sin ningun predicado que
  // la ate al proyecto ni al inquilino, asi que agrega la tabla Comment
  // entera en cada carga del tablero.
  const issueIds = columns.flatMap((column) => column.issues.map((issue) => issue.id));
  const commentCounts = issueIds.length
    ? await db.comment.groupBy({
        by: ["issueId"],
        where: { issueId: { in: issueIds }, deletedAt: null },
        _count: { _all: true },
      })
    : [];

  const countByIssue = new Map(commentCounts.map((row) => [row.issueId, row._count._all]));

  const withCounts = columns.map((column) => ({
    ...column,
    issues: column.issues.map((issue) => ({
      ...issue,
      _count: { comments: countByIssue.get(issue.id) ?? 0 },
    })),
  }));

  return { project: detail, columns: withCounts, role: scope.role, orgId: scope.orgId };
}

export async function getProjectMembers(db: DbClient, actor: Actor, projectId: string) {
  const scope = await requireProjectAccess(db, actor.id, projectId, "project.read");

  // Asignables = miembros de la organizacion con rol suficiente. Se consulta
  // por organizacion, no por proyecto, porque en un proyecto ORG la mayoria
  // no tiene fila ProjectMember.
  return db.membership.findMany({
    where: { orgId: scope.orgId, role: { in: ["OWNER", "ADMIN", "MEMBER"] } },
    select: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
}
