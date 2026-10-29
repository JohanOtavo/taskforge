import "server-only";

import { cache } from "react";

import { db } from "./db";
import { AppError } from "./errors";
import { readSession, type SessionUser } from "./session";

/// Contexto de peticion. Los servicios lo reciben como primer argumento y
/// NUNCA leen la sesion por su cuenta: asi un test les pasa un cliente de
/// transaccion y un actor falso, sin Next y sin navegador.
export type Ctx = {
  db: typeof db;
  actor: SessionUser;
};

/// `cache()` memoiza por peticion. El rol se resuelve siempre contra la base
/// de datos, nunca se guarda en un token: un usuario degradado seguiria
/// siendo ADMIN hasta que el token caducase.
export const getActor = cache(async (): Promise<SessionUser | null> => readSession());

export async function requireCtx(): Promise<Ctx> {
  const actor = await getActor();
  if (!actor) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesion.");
  return { db, actor };
}
