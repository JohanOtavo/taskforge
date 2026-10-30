import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import { db } from "@/server/db";
import {
  exchangeCode,
  GoogleAuthError,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  readGoogleConfig,
} from "@/server/modules/auth/google";
import { loginWithGoogle } from "@/server/modules/auth/service";
import { rateLimit } from "@/server/rate-limit";
import { requestMeta } from "@/server/request-meta";
import { createSession } from "@/server/session";
import { constantTimeEquals } from "@/server/tokens";

const CALLBACK_LIMIT = 10;
const CALLBACK_WINDOW_MS = 10 * 60 * 1000;

type Saved = { state: string; verifier: string; next: string };

function readSaved(raw: string | undefined): Saved | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Saved>;
    if (typeof value.state !== "string" || typeof value.verifier !== "string") return null;
    return { state: value.state, verifier: value.verifier, next: safeNext(value.next) };
  } catch {
    return null;
  }
}

/// Vuelta desde Google: comprobar `state`, canjear el codigo, abrir sesion.
export async function GET(request: NextRequest) {
  const store = await cookies();
  const saved = readSaved(store.get(OAUTH_COOKIE)?.value);
  // De un solo uso, salga bien o mal. Se borra con la misma ruta con la que
  // se creo; un delete con la ruta por defecto no la tocaria.
  store.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });

  // `redirect` lanza una excepcion, asi que va FUERA del try de `finish`.
  redirect(await finish(request, saved));
}

async function finish(request: NextRequest, saved: Saved | null): Promise<string> {
  const config = readGoogleConfig();
  if (!config) return "/login?error=google_off";

  const params = request.nextUrl.searchParams;
  // Cancelar en la pantalla de Google no es un error: se vuelve sin aviso.
  if (params.get("error") === "access_denied") return "/login";

  const state = params.get("state");
  const code = params.get("code");
  if (!saved || !state || !code || !constantTimeEquals(state, saved.state)) {
    return "/login?error=google";
  }

  // Antes de llamar a Google: cada intento es una peticion con el secreto del
  // cliente, y un bucle con codigos falsos acabaria con Google limitandolo.
  const meta = await requestMeta();
  if (!rateLimit(`google:ip:${meta.ip ?? "unknown"}`, CALLBACK_LIMIT, CALLBACK_WINDOW_MS).allowed) {
    return "/login?error=google_rate";
  }

  try {
    const profile = await exchangeCode(config, code, saved.verifier);
    const { userId } = await loginWithGoogle(db, profile, meta);
    await createSession(userId, meta);
    return saved.next;
  } catch (error) {
    if (error instanceof GoogleAuthError) return `/login?error=${error.code}`;
    console.error("[auth] fallo al entrar con Google", error);
    return "/login?error=google";
  }
}
