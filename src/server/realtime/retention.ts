import "server-only";

import { db } from "@/server/db";

/// `ProjectEvent` crece sin parar y casi todo lo que guarda es ilegible por
/// diseno: el stream solo reproduce hasta MAX_REPLAY_EVENTS hacia atras, y un
/// hueco mayor se resuelve con un `resync`. Todo lo anterior a la ventana de
/// reconexion razonable es peso muerto en la tabla de escritura mas caliente.
///
/// Siete dias cubre con holgura cualquier reconexion real: un portatil
/// suspendido un fin de semana largo sigue dentro.
export const EVENT_RETENTION_DAYS = 7;

/// Borra en lotes en vez de un DELETE unico: un borrado de millones de filas
/// mantiene un bloqueo largo y hace crecer el WAL de golpe.
const BATCH_SIZE = 10_000;

export async function pruneProjectEvents(
  options: { retentionDays?: number; maxBatches?: number } = {},
): Promise<{ deleted: number; batches: number }> {
  const retentionDays = options.retentionDays ?? EVENT_RETENTION_DAYS;
  const maxBatches = options.maxBatches ?? 100;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  let deleted = 0;
  let batches = 0;

  for (; batches < maxBatches; batches += 1) {
    const stale = await db.projectEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { seq: "asc" },
      take: BATCH_SIZE,
      select: { seq: true },
    });
    if (stale.length === 0) break;

    const { count } = await db.projectEvent.deleteMany({
      where: { seq: { in: stale.map((row) => row.seq) } },
    });
    deleted += count;

    if (stale.length < BATCH_SIZE) {
      batches += 1;
      break;
    }
  }

  return { deleted, batches };
}

/// Barrido de sesiones caducadas. Mismo motivo: `readSession` solo borra la
/// que acaba de mirar, asi que las de quien no vuelve se quedan para siempre.
export async function pruneExpiredSessions(): Promise<number> {
  const { count } = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
