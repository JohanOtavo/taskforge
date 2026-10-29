import "server-only";

import type { Prisma } from "@prisma/client";

import { keyBetween } from "@/lib/ordering";
import { buildDiff, writeAudit } from "@/server/audit";
import { requireIssueAccess, requireProjectAccess } from "@/server/authz/resolve";
import type { DbClient, TxClient } from "@/server/db";
import { AppError, conflict, notFound } from "@/server/errors";
import { publishBoardEvent } from "@/server/realtime/publish";

import { buildIssueOrderBy, buildIssueWhere } from "./filter";
import type {
  CreateIssueInput,
  IssueFilter,
  MoveIssueInput,
  UpdateIssueInput,
} from "./schema";

export type Actor = { id: string; email: string };

/// Jerarquia permitida: un padre debe ser de un tipo estrictamente superior.
/// Sin esta regla se puede construir EPIC -> BUG -> EPIC, y el arbol deja de
/// tener sentido (y un ciclo cuelga el renderizador en produccion).
/// Limites de lo que se trae en el detalle de un issue. Un hilo largo o un
/// epic con muchos hijos no deben convertir una pagina en una descarga.
const MAX_COMMENTS = 200;
const MAX_CHILDREN = 100;

const TYPE_RANK = { TASK: 1, BUG: 1, STORY: 2, EPIC: 3 } as const;
const MAX_DEPTH = 2;

export async function createIssue(
  db: DbClient,
  actor: Actor,
  input: CreateIssueInput,
): Promise<{ id: string; number: number; key: string }> {
  const scope = await requireProjectAccess(db, actor.id, input.projectId, "issue.create");

  // Todo lo que viene del cliente se valida contra el proyecto resuelto, no
  // contra si mismo: un columnId o un labelId de otra organizacion se
  // rechaza aqui, no en la base de datos.
  const column = input.columnId
    ? await db.boardColumn.findFirst({
        where: { id: input.columnId, projectId: scope.projectId },
        select: { id: true, stateId: true },
      })
    : null;
  if (input.columnId && !column) notFound("La columna");

  const state = column
    ? { id: column.stateId }
    : await db.workflowState.findFirstOrThrow({
        where: { projectId: scope.projectId },
        orderBy: { position: "asc" },
        select: { id: true },
      });

  if (input.assigneeId) await assertOrgMember(db, scope.orgId, input.assigneeId);
  const labelIds = await filterOrgLabels(db, scope.orgId, input.labelIds);
  if (input.parentId) await assertValidParent(db, scope.projectId, input.parentId, input.type);

  return db.$transaction(async (tx) => {
    // Incremento ATOMICO. Un patron leer-sumar-escribir hace que dos
    // creaciones simultaneas lean 41 y escriban las dos 42.
    //
    // Ademas toma el bloqueo de la fila del proyecto, que es lo que serializa
    // tambien el calculo de la posicion de abajo.
    const { issueCounter: number } = await tx.project.update({
      where: { id: scope.projectId },
      data: { issueCounter: { increment: 1 } },
      select: { issueCounter: true },
    });

    // DENTRO de la transaccion, despues del bloqueo: asi dos creaciones
    // simultaneas no pueden leer la misma "ultima posicion".
    const position = await nextPositionInColumn(tx, scope.projectId, column?.id ?? null);

    const issue = await tx.issue.create({
      data: {
        orgId: scope.orgId,
        projectId: scope.projectId,
        number,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        priority: input.priority,
        stateId: state.id,
        columnId: column?.id ?? null,
        position,
        reporterId: actor.id,
        assigneeId: input.assigneeId ?? null,
        parentId: input.parentId ?? null,
        storyPoints: input.storyPoints ?? null,
        dueDate: input.dueDate ?? null,
        ...(labelIds.length
          ? {
              // orgId no se pasa aqui: anidado bajo la creacion del issue,
              // Prisma lo hereda de la relacion padre.
              labels: { createMany: { data: labelIds.map((labelId) => ({ labelId })) } },
            }
          : {}),
      },
      select: { id: true, number: true },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "issue.created",
      entityType: "ISSUE",
      entityId: issue.id,
      entityLabel: `${scope.projectKey}-${issue.number}`,
      diff: { title: input.title, type: input.type, priority: input.priority },
    });

    await publishBoardEvent(tx, {
      projectId: scope.projectId,
      type: "issue.created",
      entityId: issue.id,
      payload: { columnId: column?.id ?? null, number: issue.number },
      actorId: actor.id,
    });

    return { id: issue.id, number: issue.number, key: `${scope.projectKey}-${issue.number}` };
  });
}

export async function updateIssue(
  db: DbClient,
  actor: Actor,
  input: UpdateIssueInput,
): Promise<{ version: number }> {
  const scope = await requireIssueAccess(db, actor.id, input.issueId, "issue.update");

  const before = await db.issue.findUniqueOrThrow({
    where: { id: input.issueId },
    select: {
      title: true,
      description: true,
      type: true,
      priority: true,
      stateId: true,
      assigneeId: true,
      parentId: true,
      storyPoints: true,
      dueDate: true,
      version: true,
    },
  });

  if (input.stateId) {
    const state = await db.workflowState.findFirst({
      where: { id: input.stateId, projectId: scope.projectId },
      select: { id: true },
    });
    if (!state) notFound("El estado");
  }
  if (input.assigneeId) await assertOrgMember(db, scope.orgId, input.assigneeId);
  if (input.parentId) {
    await assertValidParent(
      db,
      scope.projectId,
      input.parentId,
      input.type ?? before.type,
      input.issueId,
    );
  }

  const patch: Prisma.IssueUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.stateId !== undefined ? { stateId: input.stateId } : {}),
    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.storyPoints !== undefined ? { storyPoints: input.storyPoints } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
  };

  const labelIds =
    input.labelIds === undefined
      ? null
      : await filterOrgLabels(db, scope.orgId, input.labelIds);

  if (Object.keys(patch).length === 0 && labelIds === null) {
    return { version: before.version };
  }

  return db.$transaction(async (tx) => {
    // El filtro por `version` es la concurrencia optimista: si otra persona
    // guardo mientras este formulario estaba abierto, count es 0 y el
    // usuario se entera en vez de perder el texto en silencio.
    const written = await tx.issue.updateMany({
      where: { id: input.issueId, version: input.version },
      data: { ...patch, version: { increment: 1 } },
    });

    if (written.count === 0) {
      conflict("Alguien ha modificado este issue mientras lo editabas. Recarga y vuelve a intentarlo.", {
        expectedVersion: input.version,
      });
    }

    if (labelIds !== null) {
      await tx.issueLabel.deleteMany({ where: { issueId: input.issueId } });
      if (labelIds.length) {
        await tx.issueLabel.createMany({
          data: labelIds.map((labelId) => ({
            issueId: input.issueId,
            labelId,
            orgId: scope.orgId,
          })),
        });
      }
    }

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "issue.updated",
      entityType: "ISSUE",
      entityId: input.issueId,
      entityLabel: `${scope.projectKey}-${scope.issueNumber}`,
      diff: buildDiff(before as Record<string, unknown>, patch as Record<string, unknown>),
    });

    await publishBoardEvent(tx, {
      projectId: scope.projectId,
      type: "issue.updated",
      entityId: input.issueId,
      payload: { fields: Object.keys(patch) },
      actorId: actor.id,
    });

    return { version: input.version + 1 };
  });
}

/// Mover por INTENCION. El cliente dice entre que dos tarjetas cae; el
/// servidor carga esos vecinos dentro de la transaccion y genera la clave.
export async function moveIssue(
  db: DbClient,
  actor: Actor,
  input: MoveIssueInput,
): Promise<{ position: string; columnId: string | null }> {
  const scope = await requireIssueAccess(db, actor.id, input.issueId, "issue.move");

  const column = input.toColumnId
    ? await db.boardColumn.findFirst({
        where: { id: input.toColumnId, projectId: scope.projectId },
        select: { id: true, stateId: true, wipLimit: true },
      })
    : null;
  if (input.toColumnId && !column) notFound("La columna");

  return db.$transaction(async (tx) => {
    const current = await tx.issue.findUniqueOrThrow({
      where: { id: input.issueId },
      select: { columnId: true, position: true, stateId: true },
    });

    const [after, before] = await Promise.all([
      neighbourPosition(tx, scope.projectId, column?.id ?? null, input.afterId),
      neighbourPosition(tx, scope.projectId, column?.id ?? null, input.beforeId),
    ]);

    // Sin vecinos a ninguno de los dos lados, `keyBetween(null, null)`
    // devuelve SIEMPRE la primera clave. En una columna que ya tiene
    // tarjetas eso produce una posicion repetida (solo el desempate por id
    // evita que el orden sea indeterminado). Cuando no hay intencion de
    // colocacion, lo correcto es anadir al final.
    const position =
      after === null && before === null
        ? await nextPositionInColumn(tx, scope.projectId, column?.id ?? null, input.issueId)
        : keyBetween(after, before);

    if (column?.wipLimit != null && column.id !== current.columnId) {
      // FOR UPDATE sobre la columna destino: sin el, dos arrastres simultaneos
      // cuentan la misma ocupacion y los dos entran.
      await tx.$queryRaw`SELECT 1 FROM "BoardColumn" WHERE id = ${column.id} FOR UPDATE`;

      const occupancy = await tx.issue.count({
        where: { columnId: column.id, archivedAt: null },
      });
      if (occupancy >= column.wipLimit) {
        conflict(`La columna ha alcanzado su limite de ${column.wipLimit} tarjetas.`);
      }
    }

    await tx.issue.update({
      where: { id: input.issueId },
      data: {
        columnId: column?.id ?? null,
        position,
        // Mover de columna cambia el ESTADO, que es el dato autoritativo. La
        // columna sola nunca responde "esta hecho?".
        ...(column ? { stateId: column.stateId } : {}),
        version: { increment: 1 },
      },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "issue.moved",
      entityType: "ISSUE",
      entityId: input.issueId,
      entityLabel: `${scope.projectKey}-${scope.issueNumber}`,
      diff: {
        from: { columnId: current.columnId, position: current.position },
        to: { columnId: column?.id ?? null, position },
      },
    });

    await publishBoardEvent(tx, {
      projectId: scope.projectId,
      type: "issue.moved",
      entityId: input.issueId,
      payload: { fromColumnId: current.columnId, toColumnId: column?.id ?? null, position },
      actorId: actor.id,
    });

    return { position, columnId: column?.id ?? null };
  });
}

export async function archiveIssue(
  db: DbClient,
  actor: Actor,
  issueId: string,
): Promise<void> {
  const scope = await requireIssueAccess(db, actor.id, issueId, "issue.delete");

  await db.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: issueId },
      data: { archivedAt: new Date(), columnId: null, version: { increment: 1 } },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "issue.archived",
      entityType: "ISSUE",
      entityId: issueId,
      entityLabel: `${scope.projectKey}-${scope.issueNumber}`,
    });

    await publishBoardEvent(tx, {
      projectId: scope.projectId,
      type: "issue.archived",
      entityId: issueId,
      payload: {},
      actorId: actor.id,
    });
  });
}

export async function listIssues(db: DbClient, actor: Actor, filter: IssueFilter) {
  const scope = await requireProjectAccess(db, actor.id, filter.projectId, "issue.read");

  const { cursor, limit } = filter;

  // Igual que en la auditoria: la fila del cursor tiene que ser de ESTE
  // proyecto, porque Prisma la resuelve sin aplicar el where.
  if (cursor) {
    const valid = await db.issue.findFirst({
      where: { id: cursor, projectId: scope.projectId },
      select: { id: true },
    });
    if (!valid) notFound("La pagina");
  }

  const rows = await db.issue.findMany({
    where: buildIssueWhere(scope.projectId, filter),
    orderBy: buildIssueOrderBy(filter),
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      priority: true,
      storyPoints: true,
      dueDate: true,
      updatedAt: true,
      archivedAt: true,
      state: { select: { id: true, name: true, category: true } },
      column: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, imageUrl: true } },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}

/// Igual que getBoard: el `key` necesita el orgId para ser inequivoco.
export async function getIssueDetail(
  db: DbClient,
  actor: Actor,
  orgId: string,
  projectKey: string,
  number: number,
) {
  const issue = await db.issue.findFirst({
    where: { number, orgId, project: { key: projectKey, archivedAt: null } },
    select: { id: true, projectId: true },
  });
  if (!issue) notFound("El issue");

  const scope = await requireProjectAccess(db, actor.id, issue.projectId, "issue.read");

  const detail = await db.issue.findUniqueOrThrow({
    where: { id: issue.id },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      storyPoints: true,
      dueDate: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
      state: { select: { id: true, name: true, category: true } },
      column: { select: { id: true, name: true } },
      reporter: { select: { id: true, name: true, imageUrl: true } },
      assignee: { select: { id: true, name: true, imageUrl: true } },
      parent: { select: { id: true, number: true, title: true, type: true } },
      children: {
        where: { archivedAt: null },
        select: { id: true, number: true, title: true, type: true },
        orderBy: { number: "asc" },
        // Con limite: sin el, un epic con cientos de hijos los traia todos y
        // los serializaba enteros al cliente en cada carga.
        take: MAX_CHILDREN,
      },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: MAX_COMMENTS,
        select: {
          id: true,
          body: true,
          createdAt: true,
          editedAt: true,
          author: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
  });

  return { issue: detail, scope };
}

// ------------------------------------------------------------- utilidades

async function nextPositionInColumn(
  db: TxClient,
  projectId: string,
  columnId: string | null,
  excludeIssueId?: string,
): Promise<string> {
  const last = await db.issue.findFirst({
    // Al recolocar, el propio issue no cuenta como vecino de si mismo.
    where: {
      projectId,
      columnId,
      archivedAt: null,
      ...(excludeIssueId ? { id: { not: excludeIssueId } } : {}),
    },
    orderBy: [{ position: "desc" }, { id: "desc" }],
    select: { position: true },
  });
  return keyBetween(last?.position ?? null, null);
}

/// Posicion de un vecino. Se exige que pertenezca al proyecto Y a la columna
/// destino: un id de otra columna como referencia produciria una clave fuera
/// de rango y una tarjeta que "salta" al recargar.
async function neighbourPosition(
  db: TxClient,
  projectId: string,
  columnId: string | null,
  neighbourId: string | null | undefined,
): Promise<string | null> {
  if (!neighbourId) return null;
  const neighbour = await db.issue.findFirst({
    where: { id: neighbourId, projectId, columnId, archivedAt: null },
    select: { position: true },
  });
  return neighbour?.position ?? null;
}

async function assertOrgMember(db: TxClient, orgId: string, userId: string): Promise<void> {
  const member = await db.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { userId: true },
  });
  // Asignar a alguien de otra organizacion filtraria su nombre en el tablero.
  if (!member) notFound("La persona asignada");
}

/// Devuelve solo las etiquetas que pertenecen a la organizacion. Un labelId
/// ajeno se descarta en silencio en vez de reventar: el cliente puede tener
/// una lista obsoleta.
async function filterOrgLabels(
  db: TxClient,
  orgId: string,
  labelIds: string[] | undefined,
): Promise<string[]> {
  if (!labelIds?.length) return [];
  const rows = await db.label.findMany({
    where: { orgId, id: { in: labelIds } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function assertValidParent(
  db: TxClient,
  projectId: string,
  parentId: string,
  childType: keyof typeof TYPE_RANK,
  childId?: string,
): Promise<void> {
  if (childId && parentId === childId) {
    throw new AppError("VALIDATION", "Un issue no puede ser su propio padre.");
  }

  const parent = await db.issue.findFirst({
    where: { id: parentId, projectId, archivedAt: null },
    select: { id: true, type: true, parentId: true },
  });
  if (!parent) notFound("El issue padre");

  if (TYPE_RANK[parent.type] <= TYPE_RANK[childType]) {
    throw new AppError(
      "VALIDATION",
      "El padre debe ser de un tipo superior (EPIC > STORY > TASK/BUG).",
    );
  }

  // Profundidad maxima 2 (EPIC > STORY > TASK). Un arbol mas profundo no
  // aporta nada y abre la puerta a ciclos.
  let depth = 0;
  let cursor = parent.parentId;
  const seen = new Set<string>([parent.id, ...(childId ? [childId] : [])]);

  while (cursor) {
    if (seen.has(cursor)) {
      throw new AppError("VALIDATION", "Esa relacion crearia un ciclo.");
    }
    seen.add(cursor);
    depth += 1;
    if (depth >= MAX_DEPTH) {
      throw new AppError("VALIDATION", "La jerarquia no admite mas de tres niveles.");
    }
    const ancestor = await db.issue.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = ancestor?.parentId ?? null;
  }
}
