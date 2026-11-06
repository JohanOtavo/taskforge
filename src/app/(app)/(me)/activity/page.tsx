import { LocalDate } from "@/components/ui/local-date";
import { requireCtx } from "@/server/context";
import { listMyActivity } from "@/server/modules/account/service";

const ACTION_TEXT: Record<string, string> = {
  "comment.created": "Comentaste en",
  "comment.deleted": "Borraste un comentario de",
  "invitation.accepted": "Aceptaste una invitación",
  "invitation.created": "Invitaste a",
  "issue.archived": "Archivaste",
  "issue.created": "Creaste",
  "issue.moved": "Moviste",
  "issue.restored": "Restauraste",
  "issue.updated": "Editaste",
  "label.created": "Creaste la etiqueta",
  "membership.added": "Añadiste a",
  "membership.removed": "Expulsaste a",
  "membership.role_changed": "Cambiaste el rol de",
  "organization.created": "Creaste el espacio",
  "organization.renamed": "Renombraste el espacio",
  "phase.created": "Creaste la fase",
  "phase.deleted": "Borraste la fase",
  "phase.renamed": "Renombraste la fase",
  "project.archived": "Archivaste el tablero",
  "project.created": "Creaste el tablero",
  "project.deleted": "Eliminaste el tablero",
  "project.member_added": "Añadiste a un tablero a",
  "project.member_removed": "Quitaste de un tablero a",
  "project.restored": "Restauraste el tablero",
  "project.updated": "Editaste el tablero",
  "user.google_linked": "Enlazaste tu cuenta de Google",
  "user.password_changed": "Cambiaste tu contraseña",
  "user.profile_updated": "Actualizaste tu perfil",
  "user.registered": "Creaste tu cuenta",
};

/// En estas la etiqueta guardada es tu propio correo: repetirlo no dice nada.
function isOwnAccount(action: string): boolean {
  return action.startsWith("user.") || action === "invitation.accepted";
}

export default async function ActivityPage() {
  const ctx = await requireCtx();
  const rows = await listMyActivity(ctx.db, ctx.actor);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Actividad</h1>
        <p className="mt-1 text-sm text-text-muted">Lo último que has hecho en TaskForge.</p>
      </div>

      {rows.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center text-sm text-text-muted">
          Todavía no hay actividad.
        </section>
      ) : (
        <ul className="divide-y divide-border slab rounded-xl">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-3">
              <p className="text-sm">
                {ACTION_TEXT[row.action] ?? row.action}
                {row.entityLabel && !isOwnAccount(row.action) && (
                  <span className="font-medium"> {row.entityLabel}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                <LocalDate date={row.createdAt} />
                {row.org && ` · ${row.org.name}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
