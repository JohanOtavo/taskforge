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

  // Deliberadamente SOBRIO, y es una decision de entregabilidad, no de gusto.
  //
  // La version anterior (fondo oscuro, tabla maquetada, boton grande de
  // color) acababa en la pestana Promociones de Gmail: son exactamente las
  // senales por las que clasifica como publicidad. Un correo de invitacion
  // es transaccional, asi que se parece a lo que es: texto, un enlace y poco
  // mas. Sin imagenes, sin colores de marca, sin tabla de maquetacion.
  const html = `<!doctype html>
<html lang="es">
  <body style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#202124;">
    <p>Hola,</p>
    <p>
      ${escapeHtml(input.inviterName)} te ha invitado a ${escapeHtml(destino)} en TaskForge.
    </p>
    <p>
      Para aceptar la invitacion, abre este enlace:<br>
      <a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a>
    </p>
    <p>
      El enlace caduca el ${escapeHtml(caduca)} y solo sirve una vez. Unicamente
      puede aceptarlo esta direccion de correo.
    </p>
    <p>
      Si no esperabas esta invitacion, ignora el mensaje: sin abrir el enlace no
      se crea nada.
    </p>
  </body>
</html>`;

  return { subject, text, html };
}
