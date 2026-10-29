import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { AppError, HTTP_STATUS, mapPrismaError } from "@/server/errors";
import { moveIssueSchema } from "@/server/modules/issues/schema";
import { moveIssue } from "@/server/modules/issues/service";

/// El arrastre va por route handler, NO por Server Action.
///
/// Next serializa las llamadas a Server Actions y cada una provoca un
/// refresco del router con su carga RSC. Un gesto de arrastre encadenando
/// acciones se encola y se siente lento, y ademas recarga el tablero que ya
/// se actualizo de forma optimista en el cliente. Un POST normal responde en
/// un viaje y el SSE se encarga de avisar al resto.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { issueId } = await params;

  const actor = await getActor();
  if (!actor) return json({ error: "No autenticado" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Cuerpo invalido" }, 400);
  }

  // El issueId viene de la ruta, no del cuerpo: asi no hay dos fuentes que
  // puedan discrepar.
  const parsed = moveIssueSchema.safeParse({
    ...(typeof body === "object" && body !== null ? body : {}),
    issueId,
  });
  if (!parsed.success) return json({ error: "Datos de movimiento invalidos" }, 422);

  try {
    const result = await moveIssue(db, actor, parsed.data);
    return json(result, 200);
  } catch (error) {
    const mapped = error instanceof AppError ? error : mapPrismaError(error);
    if (mapped) return json({ error: mapped.message, code: mapped.code }, HTTP_STATUS[mapped.code]);
    console.error("[move] error inesperado", error);
    return json({ error: "Error inesperado" }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
