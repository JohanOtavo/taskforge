import { CloseSessionsButton, PasswordForm } from "@/components/account/account-forms";
import { LocalDate } from "@/components/ui/local-date";
import { requireCtx } from "@/server/context";
import { getAccount } from "@/server/modules/account/service";

export default async function AccountPage() {
  const ctx = await requireCtx();
  const account = await getAccount(ctx.db, ctx.actor);
  const otherSessions = Math.max(account.sessionCount - 1, 0);

  return (
    <>
      <h1 className="text-xl font-semibold">Gestionar cuenta</h1>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Tu cuenta</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">Correo</dt>
            <dd>{account.email}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">Entrar con Google</dt>
            <dd>{account.hasGoogle ? "Enlazada" : "Sin enlazar"}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">Cuenta creada</dt>
            <dd>
              <LocalDate date={account.createdAt} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Contraseña</h2>
        <p className="mb-4 text-sm text-text-muted">
          {account.hasPassword
            ? "Al cambiarla se cierran todas tus demás sesiones."
            : "Tu cuenta no tiene contraseña. Puedes crear una para entrar también sin Google."}
        </p>
        <PasswordForm hasPassword={account.hasPassword} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Sesiones</h2>
        <p className="mb-4 text-sm text-text-muted">
          {otherSessions === 0
            ? "Solo tienes abierta esta sesión."
            : `Tienes ${otherSessions} ${otherSessions === 1 ? "sesión abierta" : "sesiones abiertas"} en otros dispositivos o navegadores.`}
        </p>
        {otherSessions > 0 && <CloseSessionsButton />}
      </section>
    </>
  );
}
