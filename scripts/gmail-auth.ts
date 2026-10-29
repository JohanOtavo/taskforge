/// Obtiene el refresh token de Gmail para el envio de invitaciones. Se ejecuta
/// UNA vez, en tu maquina, con el navegador donde tienes abierto Google:
///
///   $env:GMAIL_CLIENT_ID="..."; $env:GMAIL_CLIENT_SECRET="..."; npm run gmail:auth
///
/// Flujo OAuth para aplicaciones instaladas: redireccion a 127.0.0.1 con PKCE.
/// El cliente OAuth tiene que ser de tipo "Aplicacion de escritorio", que es
/// el que admite redirecciones a cualquier puerto local.
///
/// Solo se pide `gmail.send`: la aplicacion puede ENVIAR correo desde la
/// cuenta, pero no leerlo, ni borrarlo, ni ver los contactos.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const WAIT_MS = 5 * 60 * 1000;

type TokenResponse = { refresh_token?: string; error?: string; error_description?: string };

async function main(): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Faltan GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en el entorno.");
    process.exit(1);
  }

  // PKCE: aunque haya secreto de cliente, en una app de escritorio ese secreto
  // no es secreto de verdad. El verificador impide que un codigo interceptado
  // sirva a nadie mas.
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${port}`;

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // `offline` + `consent` es lo que hace que Google devuelva un refresh
    // token. Sin `consent`, en la segunda autorizacion no lo devuelve.
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  console.log("\nAbre esta URL en el navegador donde tienes Google y acepta:\n");
  console.log(url.toString());
  console.log("\nEsperando la autorizacion (5 minutos como maximo)...\n");

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tiempo agotado esperando la autorizacion")), WAIT_MS);

    server.on("request", (req, res) => {
      const params = new URL(req.url ?? "/", redirectUri).searchParams;
      // Otras peticiones del navegador (favicon) o una respuesta ajena no
      // traen nuestro `state`: se ignoran sin cerrar la espera.
      if (params.get("state") !== state) {
        res.writeHead(404).end();
        return;
      }

      clearTimeout(timer);
      const error = params.get("error");
      const received = params.get("code");
      res
        .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
        .end(error ? `Autorizacion denegada: ${error}` : "Listo. Vuelve a la terminal.");

      if (error || !received) reject(new Error(error ?? "Google no devolvio codigo"));
      else resolve(received);
    });
  }).finally(() => server.close());

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = (await response.json()) as TokenResponse;

  if (!response.ok || !data.refresh_token) {
    console.error("FALLO:", data.error ?? response.status, data.error_description ?? "");
    process.exit(1);
  }

  console.log("Autorizado. Guarda este valor como GMAIL_REFRESH_TOKEN:\n");
  console.log(data.refresh_token);
}

main().catch((error: unknown) => {
  console.error("FALLO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
