import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { HTTP_STATUS, AppError } from "@/server/errors";
import { requireProjectAccess } from "@/server/authz/resolve";
import { MAX_REPLAY_EVENTS } from "@/server/realtime/events";
import { boardListener } from "@/server/realtime/listener";

/// Stream de eventos del tablero.
///
/// Dos detalles que hacen la diferencia entre "parece que va" y que vaya:
///
/// 1. Se emite `id: <seq>`. El navegador reenvia ese valor en `Last-Event-ID`
///    al reconectar, asi que una reconexion REPRODUCE lo perdido en vez de
///    dejar el tablero desincronizado en silencio. Sin esto, cualquier hueco
///    (despliegue, portatil suspendido, tunel movil) deja un tablero
///    permanentemente incorrecto sin un solo error visible.
///
/// 2. Un latido cada 20 s. Nginx y Cloudflare cortan un stream inactivo
///    alrededor de los 100 s.
///
/// Un VIEWER sin acceso al proyecto no puede suscribirse: la suscripcion
/// necesita el MISMO permiso que la lectura, y es el sitio que se suele
/// olvidar.

const HEARTBEAT_MS = 20_000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const actor = await getActor();
  if (!actor) return new Response("No autenticado", { status: 401 });

  try {
    await requireProjectAccess(db, actor.id, projectId, "project.read");
  } catch (error) {
    const status = error instanceof AppError ? HTTP_STATUS[error.code] : 500;
    return new Response(null, { status });
  }

  const lastEventId = request.headers.get("last-event-id");
  const encoder = new TextEncoder();

  let cursor = await resolveCursor(projectId, lastEventId);
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let draining = false;
  // Se recuerda el despertar perdido en vez de descartarlo.
  let wakeAgain = false;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // ANTES de cualquier await: un AbortSignal despacha "abort" una sola
      // vez, al abortar. Suscribirse despues es no enterarse nunca.
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Ya estaba cerrado.
        }
      });
      if (request.signal.aborted) return cleanup();

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // `retry` fija el reintento del navegador; por defecto son 3 s.
      send(`retry: 3000\n\n`);

      /// Lee de la base de datos todo lo que haya despues del cursor. Es la
      /// base de datos, no el canal NOTIFY, quien garantiza orden e
      /// integridad: la notificacion solo sirve de despertador.
      const drain = async () => {
        if (closed) return;
        if (draining) {
          // Un NOTIFY llegado mientras la consulta anterior estaba en vuelo
          // apunta a filas que su snapshot no ve. Descartarlo perdia el
          // evento hasta el siguiente, sin limite de tiempo.
          wakeAgain = true;
          return;
        }
        draining = true;
        try {
          for (;;) {
            const events = await db.projectEvent.findMany({
              where: { projectId, seq: { gt: cursor } },
              orderBy: { seq: "asc" },
              take: 200,
              select: { seq: true, type: true, entityId: true, payload: true, actorId: true },
            });
            if (events.length === 0) break;

            for (const event of events) {
              const data = JSON.stringify({
                type: event.type,
                entityId: event.entityId,
                payload: event.payload,
                actorId: event.actorId,
              });
              send(`id: ${event.seq}\nevent: board\ndata: ${data}\n\n`);
              cursor = event.seq;
            }
          }
        } catch (error) {
          console.error("[sse] fallo al leer eventos", error);
        } finally {
          draining = false;
        }

        if (wakeAgain && !closed) {
          wakeAgain = false;
          await drain();
        }
      };

      if (lastEventId) {
        const pending = await db.projectEvent.count({
          where: { projectId, seq: { gt: cursor } },
        });
        if (pending > MAX_REPLAY_EVENTS) {
          // Hueco demasiado grande: recargar es mas barato y mas fiable que
          // reproducir miles de parches.
          send(`event: resync\ndata: {}\n\n`);
          cursor = await latestSeq(projectId);
        } else {
          await drain();
        }
      }

      // Tras la reproduccion el cliente puede haberse ido ya.
      if (request.signal.aborted) return cleanup();

      unsubscribe = boardListener.subscribe({
        projectId,
        onWake: () => void drain(),
        // El oyente se reconecto: pudo perder notificaciones, asi que se
        // vuelve a comparar el cursor contra la base de datos.
        onResync: () => void drain(),
      });

      heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Ya estaba cerrado.
        }
      });
    },

    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desactiva el buffering de nginx, que de lo contrario retiene el
      // stream hasta llenar su bufer.
      "X-Accel-Buffering": "no",
    },
  });
}

async function resolveCursor(projectId: string, lastEventId: string | null): Promise<bigint> {
  if (!lastEventId) return latestSeq(projectId);
  try {
    const parsed = BigInt(lastEventId);
    return parsed < 0n ? 0n : parsed;
  } catch {
    return latestSeq(projectId);
  }
}

async function latestSeq(projectId: string): Promise<bigint> {
  const latest = await db.projectEvent.findFirst({
    where: { projectId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  return latest?.seq ?? 0n;
}
