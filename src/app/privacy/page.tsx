import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidad · TaskForge",
};

/// Politica de privacidad. Publica (ver PUBLIC_PATHS en el middleware): tiene
/// que poder leerse sin cuenta.
///
/// Describe lo que el codigo HACE, no una plantilla generica: si cambia lo que
/// se guarda (por ejemplo, la IP de las sesiones), hay que cambiar esto.
const CONTACT_EMAIL = "johanotavo2002@gmail.com";
const UPDATED_AT = "30 de octubre de 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-sm leading-relaxed text-text">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Política de privacidad</h1>
        <p className="text-text-muted">Última actualización: {UPDATED_AT}</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Qué datos guarda TaskForge</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tu nombre y tu dirección de correo, para identificarte.</li>
          <li>
            Tu contraseña, nunca en claro: solo un hash scrypt del que no se puede recuperar.
          </li>
          <li>
            Si entras con Google: el nombre, el correo y la foto de perfil de tu cuenta de
            Google. TaskForge nunca recibe tu contraseña de Google.
          </li>
          <li>
            Tus sesiones abiertas, con la dirección IP y el navegador desde el que entraste, para
            poder cerrarlas y detectar accesos indebidos.
          </li>
          <li>
            Lo que creas dentro de la aplicación: espacios de trabajo, tableros, tarjetas,
            comentarios y un registro de quién cambió qué.
          </li>
          <li>
            Las invitaciones que envías: la dirección invitada y el rol que tendrá al entrar.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Para qué se usan</h2>
        <p>
          Exclusivamente para que la aplicación funcione: iniciar sesión, mostrar tus tableros a
          quien tú hayas dado acceso y avisar a las personas que invitas. No se venden, no se
          usan para publicidad y no se comparten con nadie fuera de los proveedores que alojan
          el servicio.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Correo electrónico</h2>
        <p>
          Las invitaciones se envían a través de Brevo, un servicio de envío de correo. Brevo
          recibe la dirección invitada y el texto de la invitación, y registra si el correo se
          entregó y se abrió. Solo se escribe a la dirección que alguien ha invitado, y solo
          para entregarle su enlace de invitación.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Dónde se alojan</h2>
        <p>
          La aplicación corre en Render y la base de datos en Neon, ambos en Estados Unidos
          (región de Oregón). La conexión con la base de datos va cifrada. El correo lo envía
          Brevo, con sede en la Unión Europea.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Cookies</h2>
        <p>
          Una sola cookie técnica de sesión, necesaria para mantenerte dentro. Sin cookies de
          seguimiento ni de terceros.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Borrar tus datos</h2>
        <p>
          Escribe a <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
          desde la dirección de tu cuenta y se eliminará junto con todo lo asociado a ella.
        </p>
      </section>

      <p>
        <Link className="underline" href="/login">
          Volver a TaskForge
        </Link>
      </p>
    </main>
  );
}
