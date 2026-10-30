import "server-only";

import { createTransport, type Transporter } from "nodemailer";

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

export async function sendInvitationEmail(input: SendInvitationInput): Promise<SendOutcome> {
  const from = process.env.EMAIL_FROM;
  if (!from) return "not-configured";

  const { to, ...rest } = input;
  const email = buildInvitationEmail(rest);

  // Brevo por HTTPS primero; SMTP solo para servidores propios o desarrollo.
  // La API de Gmail se probo y se descarto: Google aceptaba el envio pero no
  // lo entregaba a buzones de Gmail (ver docs/DEPLOY.md).
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
