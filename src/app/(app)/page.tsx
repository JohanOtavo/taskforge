import Link from "next/link";

import { CreateWorkspaceForm } from "@/components/layout/create-workspace-form";
import { ArchivedProjectActions } from "@/components/layout/project-lifecycle";
import { PriorityBadge } from "@/components/ui/badge";
import { LocalDate } from "@/components/ui/local-date";
import { Tilt } from "@/components/ui/tilt";
import { NewProjectForm } from "@/components/layout/new-project-form";
import { can } from "@/server/authz/permissions";
import { requireCtx } from "@/server/context";
import { getActiveWorkspace } from "@/server/current-org";
import { listMyCards } from "@/server/modules/account/service";
import { listArchivedProjects } from "@/server/modules/projects/lifecycle";
import { listProjects } from "@/server/modules/projects/service";

const CARDS_PREVIEW = 5;

export default async function ProjectsPage() {
  const ctx = await requireCtx();
  const workspace = await getActiveWorkspace(ctx.actor.id);

  // Como en Trello: la cuenta existe primero. Quien se registra sin espacio
  // de trabajo, o a quien han expulsado del ultimo, aterriza aqui.
  if (!workspace) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        <div>
          <h1 className="text-xl font-semibold">Crea tu espacio de trabajo</h1>
          <p className="mt-1 text-sm text-text-muted">
            Un espacio agrupa a tu equipo y sus proyectos. Si te han invitado a uno, abre el
            enlace de la invitacion en vez de crear este.
          </p>
        </div>
        <CreateWorkspaceForm />
      </div>
    );
  }

  const [projects, cards, archived] = await Promise.all([
    listProjects(ctx.db, ctx.actor, workspace.id),
    listMyCards(ctx.db, ctx.actor),
    listArchivedProjects(ctx.db, ctx.actor, workspace.id),
  ]);
  const canCreate = can(workspace.role, "project.create");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{workspace.name}</h1>
          <p className="text-sm text-text-muted">
            {projects.length} {projects.length === 1 ? "proyecto" : "proyectos"}
          </p>
        </div>
        {canCreate && <NewProjectForm orgId={workspace.id} />}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface/70 p-10 text-center text-sm text-text-muted">
            Todavía no hay proyectos.
            {canCreate ? " Crea el primero para empezar." : " Pide a un administrador que cree uno."}
          </p>
        ) : (
          <ul className="scene grid gap-4 sm:grid-cols-2">
            {projects.map((project, index) => (
              <li
                key={project.id}
                className="rise-in"
                style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
              >
                <Tilt max={5} lift={10} className="h-full rounded-2xl">
                  <Link
                    href={`/p/${project.key}`}
                    className="slab flex h-full gap-4 rounded-2xl p-5 transition-[border-color] duration-200 hover:border-accent/60"
                  >
                    <span className="stamp flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg">
                      {project.key}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-lg font-semibold leading-tight">
                        {project.name}
                      </span>
                      {project.description && (
                        <span className="mt-1 line-clamp-2 block text-sm text-text-muted">
                          {project.description}
                        </span>
                      )}
                      <span className="mt-2 block text-xs text-text-muted">
                        {project._count.issues}{" "}
                        {project._count.issues === 1 ? "tarjeta" : "tarjetas"}
                        {project.visibility === "PRIVATE" && ", privado"}
                      </span>
                    </span>
                  </Link>
                </Tilt>
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="my-cards" className="slab rounded-2xl p-4">
          <h2 id="my-cards" className="mb-2 px-1 font-semibold">
            Tus tarjetas
          </h2>
          {cards.length === 0 ? (
            <p className="px-1 py-3 text-sm text-text-muted">No tienes tarjetas pendientes.</p>
          ) : (
            <ul>
              {cards.slice(0, CARDS_PREVIEW).map((card) => {
                const params = new URLSearchParams({
                  org: card.orgId,
                  to: `/p/${card.projectKey}/${card.number}`,
                });
                return (
                  <li key={card.id}>
                    {/* <a> y no <Link>: /go redirige y cambia de espacio de trabajo. */}
                    <a href={`/go?${params}`} className="block rounded-lg px-1 py-2 hover:bg-surface-2">
                      <span className="line-clamp-1 block text-sm font-medium">{card.title}</span>
                      <span className="flex items-center gap-2 text-xs text-text-muted">
                        {card.projectKey}-{card.number}
                        <PriorityBadge priority={card.priority} />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {cards.length > CARDS_PREVIEW && (
            <Link
              href="/cards"
              className="mt-1 block px-1 text-sm font-medium text-accent hover:underline"
            >
              Ver las {cards.length}
            </Link>
          )}
        </section>
      </div>

      {archived.length > 0 && (
        <details className="group slab rounded-2xl">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-text-muted transition-transform group-open:rotate-90">
              ›
            </span>
            Proyectos archivados
            <span className="text-sm font-normal text-text-muted">{archived.length}</span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {archived.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="stamp flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm">
                  {project.key}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{project.name}</span>
                  {project.archivedAt && (
                    <span className="block text-xs text-text-muted">
                      Archivado el <LocalDate date={project.archivedAt} />
                    </span>
                  )}
                </span>
                <ArchivedProjectActions project={project} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
