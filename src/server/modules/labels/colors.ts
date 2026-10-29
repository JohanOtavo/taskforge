/// Paleta cerrada, en su propio modulo SIN `server-only`: el formulario del
/// cliente necesita la misma lista que valida el servidor.
///
/// Un campo de color libre acaba con 40 grises distintos y, peor, con una
/// cadena sin validar dentro de un atributo `style`.
export const LABEL_COLORS = [
  "slate",
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];
