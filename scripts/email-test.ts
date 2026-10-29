/// Prueba el envio de correo SIN tocar la base de datos ni crear invitaciones.
///
///   npm run email:test -- alguien@ejemplo.com
///
/// Con SMTP_URL y EMAIL_FROM puestos, manda por ese servidor: sirve para
/// comprobar unas credenciales nuevas antes de confiarles las invitaciones
/// reales. Sin ellos, crea un buzon de usar y tirar en Ethereal y devuelve
/// una URL para ver como queda el mensaje.
import { createTestAccount, createTransport, getTestMessageUrl } from "nodemailer";

import { buildInvitationEmail } from "../src/server/email/message";

const EJEMPLO = {
  inviterName: "Ana Rivas",
  organizationName: "Acme",
  projectName: "TaskForge",
  url: "https://taskforge.example.com/invite/token-de-ejemplo",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error("Falta el destinatario: npm run email:test -- alguien@ejemplo.com");
    process.exit(1);
  }

  const email = buildInvitationEmail(EJEMPLO);
  const configurado = Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM);

  const transport = configurado
    ? createTransport(process.env.SMTP_URL as string)
    : createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: await createTestAccount().then((cuenta) => ({
          user: cuenta.user,
          pass: cuenta.pass,
        })),
      });

  // Comprueba credenciales y conectividad antes de mandar nada: un fallo aqui
  // dice "usuario/clave" o "puerto bloqueado", no "no llego el correo".
  await transport.verify();
  console.log(configurado ? "SMTP propio: conexion verificada" : "Ethereal: buzon temporal creado");

  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "TaskForge <no-reply@ethereal.email>",
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  console.log("enviado:", info.messageId);
  const preview = getTestMessageUrl(info);
  if (preview) console.log("vista previa:", preview);
}

main().catch((error: unknown) => {
  console.error("FALLO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
