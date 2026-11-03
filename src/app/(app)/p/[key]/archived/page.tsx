import Link from "next/link";
import { notFound } from "next/navigation";

import { RestoreIssueButton } from "@/components/board/restore-issue-button";
import { PriorityBadge, TypeBadge } from "@/components/ui/badge";
import { LocalDate } from "@/components/ui/local-date";
import { can } from "@/server/authz/permissions";
import { requireCtx } from "@/server/context";
import { getActiveWorkspace } from "@/server/current-org";
import { listArchivedIssues } from "@/server/modules/issues/service";

export default async function ArchivedPage({ params }: PageProps<"/p/[key]/archived">) {
  const { key } = await params;
  const ctx = await requireCtx();
  const workspace = await getActiveWorkspace(ctx.actor.id);
  if (!workspace) notFound();

  const { project, role, issues } = await listArchivedIssues(ctx.db, ctx.actor, workspace.id, key);
  const canRestore = can(role, "issue.delete");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <nav aria-label="Ruta" className="mb-1 text-xs text-text-muted">
          <Link href="/" className="hover:text-accent hover:underline">
            Proyectos
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/p/${project.key}`} className="hover:text-accent hover:underline">
            {project.key}
          </Link>
          <span aria-hidden> / </span>
          Archivadas
        </nav>
        <h1 className="text-2xl font-bold">Tarjetas archivadas</h1>
        <p className="text-sm text-text-muted">
          {project.name}. Archivar no borra nada: aquí siguen hasta que alguien las restaure.
        </p>
      </div>

      {issues.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center text-sm text-text-muted">
          No hay tarjetas archivadas en este tablero.
        </section>
      ) : (
        <ul className="space-y-2.5">
          {issues.map((issue) => (
            <li
              key={issue.id}
              data-priority={issue.priority}
              className="slab heat flex flex-wrap items-center gap-3 rounded-xl px-4 pb-3 pt-3.5"
            >
              <div className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={issue.type} />
                  <PriorityBadge priority={issue.priority} />
                  <span className="text-xs text-text-muted">{issue.state.name}</span>
                </span>
                <Link
                  href={`/p/${project.key}/${issue.number}`}
                  className="mt-1 block text-sm font-medium hover:text-accent"
                >
                  {project.key}-{issue.number} {issue.title}
                </Link>
                {issue.archivedAt && (
                  <span className="mt-0.5 block text-xs text-text-muted">
                    Archivada el <LocalDate date={issue.archivedAt} />
                  </span>
                )}
              </div>
              {canRestore && <RestoreIssueButton issueId={issue.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
