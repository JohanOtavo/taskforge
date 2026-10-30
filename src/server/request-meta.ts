import "server-only";

import { headers } from "next/headers";

import type { RequestMeta } from "./modules/auth/service";

/// IP y navegador de la peticion, para limitar intentos y para el registro
/// de sesiones y auditoria.
export async function requestMeta(): Promise<RequestMeta> {
  const list = await headers();
  return {
    // x-forwarded-for solo es fiable detras de un proxy de confianza. Se usa
    // para limitar intentos, nunca para autorizar.
    ip: list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: list.get("user-agent"),
  };
}
