/// Nombre de la cookie, en su propio modulo SIN `server-only`.
///
/// El middleware corre en el runtime edge y no puede importar nada que
/// arrastre Prisma o `node:crypto`; necesita solo esta constante.
export const SESSION_COOKIE = "tf_session";
