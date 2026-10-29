import "server-only";

import { createTransport, type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

import { buildInvitationEmail, type InvitationEmailInput } from "./message";

/// Envio de correo por SMTP.
///
/// SMTP y no la API de un proveedor concreto: lo hablan Gmail, Brevo, Resend,
/// Mailtrap y cualquier servidor propio, asi que cambiar de proveedor es
/// cambiar una variable de entorno y no tocar codigo.
///
/// Sin `SMTP_URL` la aplicacion sigue funcionando y la interfaz muestra el
/// enlace para copiarlo a mano, que es como funcionaba antes. El correo es una
/// mejora, no un requisito nuevo para arrancar.

export type SendOutcome = "sent" | "not-configured" | "failed";

/// Cacheado en globalThis por lo mismo que el cliente de Prisma: el HMR de
/// Next crea un modulo nuevo en cada edicion, y un transporte por edicion deja
/// conexiones SMTP abiertas.
const globalForMailer = globalThis as unknown as { mailer?: Transporter | null };

/// Tiempos limite. SIN ellos, un servidor SMTP que no contesta deja colgada
/// la Server Action: quien invita se queda con el boton girando para siempre,
/// porque el correo se envia dentro de la peticion. Con esto, lo peor que
/// pasa es que a los ~8 segundos se da por fallido y la interfaz muestra el
/// enlace para pasarlo a mano.
const CONNECTION_TIMEOUT_MS = 8_000;
const GREETING_TIMEOUT_MS = 8_000;
const SOCKET_TIMEOUT_MS = 12_000;

/// `createTransport` con una cadena no admite opciones, asi que la URL se
/// desmonta a mano para poder anadir los tiempos limite.
function buildTransport(url: string): Transporter {
  const parsed = new URL(url);
  const port = Number(parsed.port) || (parsed.protocol === "smtps:" ? 465 : 587);

  return createTransport({
    host: parsed.hostname,
    port,
    // 465 es TLS desde el primer byte; 587 empieza en claro y sube a TLS con
    // STARTTLS, que aqui se exige en vez de dejarlo a criterio del servidor.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: parsed.username
      ? {
          user: decodeURIComponent(parsed.username),
          pass: decodeURIComponent(parsed.password),
        }
      : undefined,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

function getTransport(): Transporter | null {
  if (globalForMailer.mailer !== undefined) return globalForMailer.mailer;

  const url = process.env.SMTP_URL;
  globalForMailer.mailer = url ? buildTransport(url) : null;
  return globalForMailer.mailer;
}

export type SendInvitationInput = InvitationEmailInput & {
  to: string;
};

/// `EMAIL_FROM` viene como "TaskForge <no-reply@dominio>" o como una
/// direccion suelta. La API de Brevo quiere nombre y direccion por separado.
function parseFrom(value: string): { name: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { name: "TaskForge", email: value.trim() };
  return { name: match[1] || "TaskForge", email: match[2] };
}

const HTTP_TIMEOUT_MS = 10_000;

/// Envio por HTTPS en vez de SMTP.
///
/// Render bloquea el SMTP saliente en el plan gratuito: la conexion al puerto
/// 587 expira sin llegar a abrirse (ETIMEDOUT en CONN). Lo mismo pasa en
/// varios proveedores de hosting, que cierran esos puertos contra el envio de
/// spam. El 443 no se bloquea nunca, asi que esta es la via fiable en la
/// nube; SMTP se queda para servidores propios y para desarrollo.
async function sendViaBrevoApi(
  apiKey: string,
  from: string,
  to: string,
  email: { subject: string; text: string; html: string },
): Promise<SendOutcome> {
  const sender = parseFrom(from);

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject: email.subject,
        textContent: email.text,
        htmlContent: email.html,
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (response.ok) return "sent";

    // El cuerpo del error dice el motivo real (remitente sin verificar,
    // cuota agotada, clave invalida). Sin registrarlo, el fallo seria otra
    // vez invisible.
    console.error("[email] Brevo respondio", response.status, await response.text());
    return "failed";
  } catch (error) {
    console.error("[email] fallo al llamar a la API de Brevo", error);
    return "failed";
  }
}

/// Envio por la API de Gmail, tambien por HTTPS.
///
/// Es la unica via que NO reescribe el remitente. Brevo, Resend o SendGrid no
/// pueden firmar en nombre de gmail.com, asi que sustituyen la direccion por
/// una suya (johanotavo2002@NNN.brevosend.com) y Gmail lo manda a
/// Promociones. Aqui el correo sale de verdad desde la cuenta de Gmail, lo
/// firma Google y llega autenticado. Limite: ~500 destinatarios al dia.
///
/// Las credenciales salen de `npm run gmail:auth`, que hace el baile OAuth
/// una vez y devuelve un refresh token de larga duracion.
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type GmailConfig = { clientId: string; clientSecret: string; refreshToken: string };

function readGmailConfig(): GmailConfig | null {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

// ponytail: pide un access token por envio. Las invitaciones son escasas;
// si algun dia se envia en volumen, cachearlo ~55 min (dura 60).
async function getGmailAccessToken(config: GmailConfig): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  // Un 400 "invalid_grant" aqui significa refresh token revocado o caducado:
  // hay que repetir `npm run gmail:auth`. Se registra el cuerpo para verlo.
  if (!response.ok) throw new Error(`token ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("la respuesta de Google no trae access_token");
  return data.access_token;
}

async function sendViaGmailApi(
  config: GmailConfig,
  from: string,
  to: string,
  email: { subject: string; text: string; html: string },
): Promise<SendOutcome> {
  try {
    // La API de Gmail recibe el mensaje MIME completo. MailComposer ya viene
    // con nodemailer y se ocupa de cabeceras, codificacion y multipart.
    const raw = await new MailComposer({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    })
      .compile()
      .build();

    const accessToken = await getGmailAccessToken(config);
    const response = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: raw.toString("base64url") }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (response.ok) return "sent";
    console.error("[email] Gmail respondio", response.status, await response.text());
    return "failed";
  } catch (error) {
    console.error("[email] fallo al enviar por la API de Gmail", error);
    return "failed";
  }
}

export async function sendInvitationEmail(input: SendInvitationInput): Promise<SendOutcome> {
  const from = process.env.EMAIL_FROM;
  if (!from) return "not-configured";

  const { to, ...rest } = input;
  const email = buildInvitationEmail(rest);

  // Orden de preferencia: Gmail (remitente autenticado de verdad), Brevo por
  // HTTPS, y SMTP solo para servidores propios o desarrollo.
  const gmail = readGmailConfig();
  if (gmail) return sendViaGmailApi(gmail, from, to, email);

  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) return sendViaBrevoApi(apiKey, from, to, email);

  const transport = getTransport();
  if (!transport) return "not-configured";

  try {
    await transport.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return "sent";
  } catch (error) {
    // Un fallo del correo NO puede tumbar la invitacion: la invitacion ya
    // existe en la base de datos y su enlace es valido. Se registra y la
    // interfaz muestra el enlace para pasarlo a mano.
    console.error("[email] fallo al enviar la invitacion", error);
    return "failed";
  }
}
