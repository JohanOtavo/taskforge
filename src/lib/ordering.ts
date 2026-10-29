import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/// Fractional indexing en base62. Precision ilimitada, nunca hay que
/// reequilibrar.
///
/// Por que no un float: `double precision` tiene 53 bits de mantisa. Arrastrar
/// siempre al mismo borde parte el hueco a la mitad cada vez, y tras ~50
/// gestos `(a + b) / 2 === a`. "Mover al principio de la columna" es el gesto
/// mas comun que existe en un tablero, asi que no es un caso teorico. El
/// reequilibrado alternativo es un UPDATE O(n) que necesita bloqueo y choca
/// con los arrastres concurrentes.

export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function keysBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(before, after, count);
}

export const FIRST_KEY = generateKeyBetween(null, null);

/// Ordenacion canonica. SIEMPRE se desempata por id: si dos posiciones
/// coinciden por una carrera, el resultado es un detalle cosmetico y no un
/// orden distinto en cada recarga.
export function compareByPosition<T extends { position: string; id: string }>(
  a: T,
  b: T,
): number {
  if (a.position === b.position) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return a.position < b.position ? -1 : 1;
}
