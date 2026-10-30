import "server-only";

import { createHash } from "node:crypto";

/// Entrar con Google: flujo "authorization code" de OpenID Connect con PKCE.
///
/// Sin libreria a proposito. Son dos peticiones HTTP y la comprobacion de
/// cinco campos; una dependencia como Auth.js traeria su propio modelo de
/// sesiones, y la aplicacion ya tiene el suyo (ver session.ts).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const HTTP_TIMEOUT_MS = 10_000;
const NAME_MAX = 120;

/// Cookie de un solo uso con `state`, el verificador PKCE y el destino. Su
/// ruta la limita a las dos rutas de este flujo.
export const OAUTH_COOKIE = "tf_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

/// Errores que la pantalla de entrada sabe explicar. Cualquier otro fallo se
/// muestra como uno generico y su detalle queda en el log.
export class GoogleAuthError extends Error {
  constructor(readonly code: "google_unverified" | "google_conflict") {
    super(code);
  }
}

/// Sin las dos claves no se ofrece el boton: el acceso con Google es opcional
/// y la aplicacion arranca igual sin el.
export function readGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  // APP_URL y no la cabecera Host: la URL de vuelta debe coincidir al
  // caracter con la registrada en Google, y Host la controla el cliente.
  return { clientId, clientSecret, redirectUri: new URL("/api/auth/google/callback", appUrl).href };
}

export function buildAuthUrl(config: GoogleConfig, state: string, verifier: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    // Deja elegir cuenta aunque solo haya una abierta: quien comparte equipo
    // no debe entrar sin querer con la cuenta de otra persona.
    prompt: "select_account",
  }).toString();
  return url.href;
}

export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  verifier: string,
): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google respondio ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { id_token?: unknown };
  if (typeof data.id_token !== "string") throw new Error("la respuesta de Google no trae id_token");
  return parseIdToken(data.id_token, config.clientId);
}

/// Lee y valida el id_token.
///
/// La firma NO se comprueba, y es correcto: el token llega en la respuesta
/// directa del endpoint de Google, por TLS y autenticados con el secreto del
/// cliente, asi que no ha podido manipularlo nadie por el camino (OpenID
/// Connect Core 3.1.3.7). Si algun dia el token llegase por el navegador, la
/// firma pasaria a ser obligatoria.
export function parseIdToken(idToken: string, clientId: string, now = Date.now()): GoogleProfile {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("id_token mal formado");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;

  if (!ISSUERS.has(String(claims.iss))) throw new Error("id_token de otro emisor");
  if (claims.aud !== clientId) throw new Error("id_token para otra aplicacion");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) throw new Error("id_token caducado");
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new Error("id_token sin sub o sin email");
  }
  // El correo es la identidad de la cuenta. Sin verificar, cualquiera podria
  // abrir una cuenta de Google con la direccion de otra persona.
  if (claims.email_verified !== true) throw new GoogleAuthError("google_unverified");

  const name = typeof claims.name === "string" ? claims.name.trim() : "";
  const picture = typeof claims.picture === "string" ? claims.picture : "";

  return {
    sub: claims.sub,
    email: claims.email,
    name: (name || claims.email.split("@")[0]).slice(0, NAME_MAX),
    picture: picture.startsWith("https://") ? picture : null,
  };
}
