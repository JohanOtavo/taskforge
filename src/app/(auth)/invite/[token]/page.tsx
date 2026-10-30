import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getActor } from "@/server/context";
import { db } from "@/server/db";
import { toResult } from "@/server/errors";
import { acceptInviteSchema } from "@/server/modules/orgs/schema";
import { acceptInvite } from "@/server/modules/orgs/service";
import { setActiveWorkspace } from "@/server/current-org";

/// La aceptacion se hace con un POST (un formulario), no al cargar la pagina:
/// un GET que muta estado lo dispara cualquier precargador de enlaces o
/// antivirus que visite el correo, y la invitacion se consumiria sola.
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const actor = await getActor();

  if (!actor) {
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">Invitacion</h1>
        <p className="mb-6 text-sm text-text-muted">
          Entra o crea tu cuenta con el correo al que se envio la invitacion y vuelve a abrir
          este enlace.
        </p>
        <div className="flex gap-2">
          <Link href={`/login?next=/invite/${token}`} className="flex-1">
            <Button className="w-full">Entrar</Button>
          </Link>
          <Link href={`/register?next=/invite/${token}`} className="flex-1">
            <Button variant="secondary" className="w-full">
              Crear cuenta
            </Button>
          </Link>
        </div>
      </>
    );
  }

  async function accept() {
    "use server";
    const current = await getActor();
    if (!current) redirect("/login");

    const parsed = acceptInviteSchema.safeParse({ token });
    if (!parsed.success) redirect("/invite/invalida");

    const result = await toResult(() => acceptInvite(db, current, parsed.data));
    if (!result.ok) redirect(`/invite/${token}?error=${encodeURIComponent(result.message)}`);

    // La invitacion puede ser a un tablero concreto: se aterriza ahi, no en
    // la lista generica de proyectos.
    await setActiveWorkspace(result.data.orgId);
    redirect(result.data.projectKey ? `/p/${result.data.projectKey}` : "/");
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Unirte a la organizacion</h1>
      <p className="mb-6 text-sm text-text-muted">
        Vas a aceptar la invitacion como <strong>{actor.email}</strong>. Si la invitacion se
        envio a otra direccion, sal de la cuenta y entra con la correcta.
      </p>
      <form action={accept}>
        <Button type="submit" className="w-full">
          Aceptar invitacion
        </Button>
      </form>
    </>
  );
}
