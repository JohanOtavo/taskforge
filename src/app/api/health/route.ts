import { db } from "@/server/db";

/// Comprobacion de salud para la plataforma de despliegue.
///
/// Sin autenticar a proposito: el comprobador de Render, Northflank o un
/// balanceador no lleva cookie de sesion. Por eso NO devuelve nada util a un
/// atacante: ni version, ni nombre de base de datos, ni el texto del error.
///
/// Comprueba la base de datos, no solo que el proceso esta vivo. Un
/// contenedor que arranca con DATABASE_URL mal puesta responde HTTP 200 en la
/// portada y falla en el primer login; eso es justo lo que debe detectar el
/// despliegue antes de enviar trafico.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
