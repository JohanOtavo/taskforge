import Link from "next/link";

const TOPICS = [
  {
    title: "Espacios de trabajo y tableros",
    text: "Un espacio agrupa a un equipo. Dentro de él creas tableros, y cada tablero tiene sus columnas y tarjetas. Si perteneces a varios espacios, cambias de uno a otro desde la cabecera.",
  },
  {
    title: "Tarjetas",
    text: "Arrastra una tarjeta para moverla de columna. Ábrela para editarla, asignarla o comentar en ella. En Tarjetas, dentro del menú de cuenta, ves todas las que tienes asignadas.",
  },
  {
    title: "Invitar a tu equipo",
    text: "Desde Equipo o desde Miembros de un tablero, escribe el correo de la persona. Si ya tiene cuenta entra al momento. Si no, recibe un enlace por correo que también ves en pantalla. Si no le llega, revisa Promociones o pásale el enlace directamente.",
  },
  {
    title: "Notificaciones",
    text: "La campana avisa cuando te asignan una tarjeta, comentan en una tuya, te añaden a un equipo o aceptan tu invitación. En Ajustes eliges cuáles quieres recibir.",
  },
  {
    title: "Tu cuenta",
    text: "En Gestionar cuenta cambias o creas tu contraseña y cierras sesiones en otros dispositivos. Si entras con Google en una cuenta creada con contraseña, esa contraseña se borra; desde ahí puedes crear otra.",
  },
];

export default function HelpPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Ayuda</h1>

      <div className="space-y-3">
        {TOPICS.map((topic) => (
          <section key={topic.title} className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-1 text-sm font-semibold">{topic.title}</h2>
            <p className="text-sm text-text-muted">{topic.text}</p>
          </section>
        ))}
      </div>

      <p className="text-sm text-text-muted">
        Consulta también los{" "}
        <Link href="/shortcuts" className="font-medium text-accent hover:underline">
          accesos directos
        </Link>{" "}
        y la{" "}
        <Link href="/privacy" className="font-medium text-accent hover:underline">
          política de privacidad
        </Link>
        , donde está el contacto.
      </p>
    </>
  );
}
