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

function getTransport(): Transporter | null {
  if (globalForMailer.mailer !== undefined) return globalForMailer.mailer;

  const url = process.env.SMTP_URL;
  globalForMailer.mailer = url ? createTransport(url) : null;
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
