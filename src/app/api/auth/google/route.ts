import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import {
  buildAuthUrl,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  readGoogleConfig,
} from "@/server/modules/auth/google";
import { newToken } from "@/server/tokens";

const OAUTH_COOKIE_MAX_AGE_S = 10 * 60;

/// Primer paso: mandar a Google.
///
/// `state` ata la vuelta a ESTE navegador: sin el, un atacante podria colar
/// el codigo de su propia cuenta y dejar a la victima dentro de la cuenta del
/// atacante. El verificador PKCE impide canjear un codigo robado por el
/// camino. Los dos viajan en una cookie httpOnly que solo ve la ruta de vuelta.
export async function GET(request: NextRequest) {
  const config = readGoogleConfig();
  if (!config) redirect("/login?error=google_off");

  const state = newToken();
  const verifier = newToken();
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const store = await cookies();
  store.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    // lax y no strict: la vuelta desde Google es una navegacion entre sitios,
    // y con strict el navegador no mandaria la cookie.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE_S,
  });

  redirect(buildAuthUrl(config, state, verifier));
}
