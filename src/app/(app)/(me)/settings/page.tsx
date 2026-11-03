import { cookies } from "next/headers";

import { NotificationPrefsForm } from "@/components/account/account-forms";
import { ThemePicker } from "@/components/layout/theme-picker";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireCtx } from "@/server/context";
import { getAccount } from "@/server/modules/account/service";

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const [account, store] = await Promise.all([getAccount(ctx.db, ctx.actor), cookies()]);

  return (
    <>
      <h1 className="text-xl font-semibold">Ajustes</h1>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Tema</h2>
        <p className="mb-4 text-sm text-text-muted">Se guarda en este navegador.</p>
        <div className="max-w-xs">
          <ThemePicker theme={parseTheme(store.get(THEME_COOKIE)?.value)} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Notificaciones</h2>
        <p className="mb-4 text-sm text-text-muted">
          Lo que aparece en la campana. Los avisos no se envían por correo.
        </p>
        <NotificationPrefsForm
          prefs={{
            notifyAssigned: account.notifyAssigned,
            notifyComments: account.notifyComments,
            notifyMembership: account.notifyMembership,
          }}
        />
      </section>
    </>
  );
}
