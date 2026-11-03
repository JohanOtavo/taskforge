import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountMenu } from "@/components/layout/account-menu";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { getActor } from "@/server/context";
import { getActiveWorkspace, listWorkspaces } from "@/server/current-org";
import { db } from "@/server/db";
import { countUnread } from "@/server/modules/notifications/service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await getActor();
  // El middleware ya redirige, pero esta comprobacion es la que de verdad
  // protege: una cookie falsificada llega hasta aqui.
  if (!actor) redirect("/login");

  const [workspaces, current, unread, store] = await Promise.all([
    listWorkspaces(actor.id),
    getActiveWorkspace(actor.id),
    countUnread(db, actor),
    cookies(),
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
            <NotificationsMenu initialUnread={unread} />
            <Link
              href="/help"
              aria-label="Ayuda"
              title="Ayuda"
              className="hidden h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text sm:flex"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </Link>
            <AccountMenu
              user={{ name: actor.name, email: actor.email, imageUrl: actor.imageUrl }}
              theme={parseTheme(store.get(THEME_COOKIE)?.value)}
            />
          </nav>
        </div>
      </header>

      <KeyboardShortcuts />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
