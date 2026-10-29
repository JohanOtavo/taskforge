/// Ping para mantener despierta la instancia. SIN tocar la base de datos, y
/// eso es el punto entero de que exista separado de `/api/health`.
///
/// Render solo necesita UNA peticion HTTP para no dormirse. Si el ping
/// consultase Postgres, cada 14 minutos despertaria tambien el computo de
/// Neon, que entonces no se suspenderia nunca: 0,25 CU x 20 h x 30 dias son
/// unas 150 CU-horas, y el plan gratuito da 100. La base se quedaria
/// suspendida a mitad de mes por mantener despierta una aplicacion que nadie
/// estaba usando.
///
/// Para comprobar de verdad que la aplicacion funciona, usa `/api/health`:
/// ese si verifica la base de datos.

export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
