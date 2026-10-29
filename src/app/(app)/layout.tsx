import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "../(auth)/actions";
import { Avatar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { getActor } from "@/server/context";
import { getActiveWorkspace, listWorkspaces } from "@/server/current-org";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await getActor();
  // El middleware ya redirige, pero esta comprobacion es la que de verdad
  // protege: una cookie falsificada llega hasta aqui.
  if (!actor) redirect("/login");

  const [workspaces, current] = await Promise.all([
    listWorkspaces(actor.id),
    getActiveWorkspace(actor.id),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-30 border-b border-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link
            href="/"
            className="text-gradient text-lg font-semibold tracking-tight"
          >
            TaskForge
          </Link>

          {current && <WorkspaceSwitcher workspaces={workspaces} activeId={current.id} />}

          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
            >
              Proyectos
            </Link>
            {current && (
              <Link
                href="/members"
                className="rounded-md px-3 py-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
              >
                Equipo
              </Link>
            )}
            <span className="mx-2 hidden items-center gap-2 sm:flex">
              <Avatar name={actor.name} />
              <span className="text-xs text-text-muted">{actor.name}</span>
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
