const MAX_LENGTH = 512;

/// Destino tras entrar. Solo rutas internas: `next` llega en la URL, es
/// entrada del cliente, y `//evil.com` o `https://evil.com` convertirian el
/// login en un redireccionador abierto.
export function safeNext(value: string | null | undefined): string {
  if (!value || value.length > MAX_LENGTH) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  // Barra invertida y caracteres de control: el navegador convierte "\" en
  // "/" y borra tabuladores y saltos de linea, asi que "/\\x" o "/\t/x"
  // terminan siendo "//x".
  if (/[\x00-\x1f\x7f\\]/.test(value)) return "/";
  return value;
}
