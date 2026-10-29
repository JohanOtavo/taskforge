import "server-only";

import { requireOrgAccess } from "@/server/authz/resolve";
import type { DbClient } from "@/server/db";
import { notFound } from "@/server/errors";

export type Actor = { id: string; email: string };

/// La lectura de la auditoria necesita el MISMO control que la mutacion que
/// registra. Es el sitio que todo el mundo olvida proteger.
export async function listAuditLog(
  db: DbClient,
  actor: Actor,
  orgId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  await requireOrgAccess(db, actor.id, orgId, "org.audit.read");

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  // El cursor se comprueba contra la MISMA organizacion antes de usarlo.
  // Prisma resuelve la fila del cursor sin aplicar el where, asi que un id
  // de otro inquilino paginaria este registro desde la fecha de una fila
  // ajena: un oraculo debil sobre cuando ocurrio algo en otro tenant.
  if (options.cursor) {
    const valid = await db.auditLog.findFirst({
      where: { id: options.cursor, orgId },
      select: { id: true },
    });
    if (!valid) notFound("La pagina");
  }

  const rows = await db.auditLog.findMany({
    where: { orgId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      actorEmail: true,
      entityType: true,
      entityId: true,
      entityLabel: true,
      diff: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}
