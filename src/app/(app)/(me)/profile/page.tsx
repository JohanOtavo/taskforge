import { ProfileForm } from "@/components/account/account-forms";
import { Avatar } from "@/components/ui/badge";
import { requireCtx } from "@/server/context";

export default async function ProfilePage() {
  const { actor } = await requireCtx();

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={actor.name} imageUrl={actor.imageUrl} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">Perfil y visibilidad</h1>
          <p className="truncate text-sm text-text-muted">{actor.email}</p>
        </div>
      </div>

      <section className="slab rounded-xl p-5">
        <h2 className="mb-4 text-sm font-semibold">Tu perfil</h2>
        <ProfileForm name={actor.name} />
        <p className="mt-4 text-xs text-text-muted">
          Tu foto de Google solo aparece en este menú y en esta página. El resto de la aplicación
          muestra tus iniciales.
        </p>
      </section>

      <section className="slab rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold">Quién puede ver tu perfil</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>Las personas de tus espacios de trabajo ven tu nombre y tu correo.</li>
          <li>En las tarjetas y los comentarios aparece tu nombre, para quien pueda ver ese tablero.</li>
          <li>
            Quien invite a tu correo te añade a su espacio al momento si ya tienes cuenta, y ve tu
            nombre. Puedes salir pidiendo a su propietario que te quite.
          </li>
        </ul>
      </section>
    </>
  );
}
