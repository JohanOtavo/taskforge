import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/// Une clases y resuelve conflictos de Tailwind (la ultima gana), para que un
/// componente pueda sobrescribir el estilo base sin pelearse con el orden del
/// CSS generado.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
