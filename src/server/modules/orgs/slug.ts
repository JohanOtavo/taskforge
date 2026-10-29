import "server-only";

import { isReservedSlug, slugify } from "@/lib/identifiers";
import type { DbClient, TxClient } from "@/server/db";
import { conflict } from "@/server/errors";

/// Slug unico de organizacion. Vive aparte porque lo necesitan dos sitios:
/// el registro (cuando trae nombre de espacio) y la creacion posterior de un
/// espacio de trabajo.
export async function uniqueOrgSlug(db: DbClient | TxClient, name: string): Promise<string> {
  const base = slugify(name) || "equipo";
  // Un slug reservado chocaria con una ruta de la aplicacion.
  let candidate = isReservedSlug(base) ? `${base}-org` : base;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const taken = await db.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }

  conflict("No se ha podido generar un identificador para la organizacion.");
}
