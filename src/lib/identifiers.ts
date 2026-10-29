/// Normalizacion de identificadores de cara al usuario. Modulo puro.

/// Rutas que la aplicacion ya usa: un slug de organizacion que coincida con
/// una de ellas haria ambiguo el enrutado.
export const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "login",
  "logout",
  "register",
  "settings",
  "new",
  "invite",
  "projects",
  "issues",
  "_next",
  "static",
  "public",
  "health",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Quita diacriticos: "Diseño" -> "diseno", no "dise-o".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/// `Alice@X.com` y `alice@x.com` deben ser la MISMA cuenta. Sin esto se crean
/// usuarios duplicados y una invitacion enviada a una variante no encaja con
/// la otra.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/// Clave de proyecto estilo Jira: TF, TF2, PROJ.
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

export function normalizeProjectKey(key: string): string {
  return key.trim().toUpperCase();
}

export function isValidProjectKey(key: string): boolean {
  return PROJECT_KEY_RE.test(key);
}
