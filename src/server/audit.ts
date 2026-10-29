import "server-only";

import type { AuditEntity, Prisma } from "@prisma/client";

import type { TxClient } from "./db";

/// Se escribe en la MISMA transaccion que la mutacion que registra.
///
/// Dos reglas que no son negociables:
///  1. Se audita la INTENCION, nunca fila por fila. Un movimiento masivo que
///     escribiese 200 filas de auditoria dentro de la transaccion convertiria
///     un write de 20 ms en un bloqueo largo.
///  2. Los campos de texto son instantaneas. La entidad referenciada suele no
///     existir cuando alguien lee el registro meses despues.
export type AuditInput = {
  orgId: string | null;
  actorId: string | null;
  actorEmail: string;
  action: string;
  entityType: AuditEntity;
  entityId: string;
  entityLabel?: string | null;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export async function writeAudit(db: TxClient, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel ?? null,
      diff: input.diff,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      requestId: input.requestId ?? null,
    },
  });
}

/// Diff minimo entre dos objetos planos. TOTAL a proposito: no lanza nunca.
/// Un fallo construyendo el diff haria rollback de la mutacion de negocio.
export function buildDiff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Prisma.InputJsonObject {
  const changes: Record<string, { from: JsonPrimitive; to: JsonPrimitive }> = {};

  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (serialize(from) === serialize(to)) continue;
    changes[key] = { from: serialize(from), to: serialize(to) };
  }

  return changes;
}

type JsonPrimitive = string | number | boolean | null;

function serialize(value: unknown): JsonPrimitive {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[no serializable]";
  }
}
