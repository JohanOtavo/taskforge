/// Redaccion del correo de invitacion. Funcion PURA: ni red, ni plantillas en
/// disco, ni acceso a la base. Asi se puede probar el contenido (que el enlace
/// aparece, que no se cuela HTML del nombre de quien invita) sin levantar un
/// servidor de correo.

export type InvitationEmail = {
  subject: string;
  text: string;
  html: string;
};

export type InvitationEmailInput = {
  /// Nombre de quien invita, tal y como lo escribio esa persona.
  inviterName: string;
  /// Espacio de trabajo al que se invita.
  organizationName: string;
  /// Tablero concreto, cuando la invitacion es a un tablero y no a toda la
  /// organizacion.
  projectName?: string | null;
  url: string;
  expiresAt: Date;
};

/// El nombre y el espacio de trabajo los escriben personas y acaban dentro de
/// HTML. Sin escapar, un nombre con `<script>` o con un `</a>` roto deforma el
/// mensaje en el cliente de correo de quien lo recibe.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(value);
}

export function buildInvitationEmail(input: InvitationEmailInput): InvitationEmail {
  const destino = input.projectName
    ? `el tablero ${input.projectName}`
    : `el espacio de trabajo ${input.organizationName}`;

  const subject = input.projectName
    ? `${input.inviterName} te invita al tablero ${input.projectName}`
    : `${input.inviterName} te invita a ${input.organizationName}`;

  const caduca = formatDate(input.expiresAt);

  const text = [
    `${input.inviterName} te ha invitado a ${destino} en TaskForge.`,
    "",
    "Abre este enlace para aceptar la invitacion:",
    input.url,
    "",
    `El enlace caduca el ${caduca} y solo sirve una vez.`,
    "Solo funciona desde la direccion de correo a la que llego este mensaje.",
    "",
    "Si no esperabas esta invitacion, ignora este correo: sin abrir el enlace no se crea nada.",
  ].join("\n");

  // Tabla y estilos en linea: los clientes de correo ignoran hojas externas y
  // buena parte de flexbox. No es descuido, es lo unico que se ve igual en
  // Gmail, Outlook y Apple Mail.
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#f8fafc;">
            ${escapeHtml(input.inviterName)} te ha invitado a ${escapeHtml(destino)}
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#cbd5e1;">
            TaskForge es un tablero de trabajo al estilo kanban. Acepta la invitacion
            para entrar al equipo.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(input.url)}"
               style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
              Aceptar invitacion
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
            Si el boton no funciona, copia este enlace:
          </p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#a5b4fc;">
            ${escapeHtml(input.url)}
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
            Caduca el ${escapeHtml(caduca)} y solo sirve una vez. Solo puede aceptarla
            esta direccion de correo. Si no esperabas la invitacion, ignora el mensaje.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
