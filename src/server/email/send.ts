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

export async function sendInvitationEmail(input: SendInvitationInput): Promise<SendOutcome> {
  const transport = getTransport();
  const from = process.env.EMAIL_FROM;
  if (!transport || !from) return "not-configured";

  const { to, ...rest } = input;
  const email = buildInvitationEmail(rest);

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
