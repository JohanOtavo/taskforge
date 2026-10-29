import Link from "next/link";

import { CreateWorkspaceForm } from "@/components/layout/create-workspace-form";
import { Tilt } from "@/components/ui/tilt";
import { NewProjectForm } from "@/components/layout/new-project-form";
import { can } from "@/server/authz/permissions";
import { requireCtx } from "@/server/context";
import { getActiveWorkspace } from "@/server/current-org";
import { listProjects } from "@/server/modules/projects/service";

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

  const projects = await listProjects(ctx.db, ctx.actor, workspace.id);
  const canCreate = can(workspace.role, "project.create");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-text-muted">
            {workspace.name} &middot; {projects.length}{" "}
            {projects.length === 1 ? "proyecto" : "proyectos"}
          </p>
        </div>
        {canCreate && <NewProjectForm orgId={workspace.id} />}
      </div>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-text-muted">
          Todavia no hay proyectos.
          {canCreate ? " Crea el primero para empezar." : " Pide a un administrador que cree uno."}
        </p>
      ) : (
        <ul className="scene grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <li
              key={project.id}
              className="rise-in"
              style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
            >
              <Tilt max={5} lift={10} className="h-full rounded-2xl">
              <Link
                href={`/p/${project.key}`}
                className="block h-full rounded-2xl border border-border bg-surface p-5 lift-1 transition-[border-color,box-shadow] duration-200 hover:border-accent/60 hover-lift"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-muted">
                    {project.key}
                  </span>
                  {project.visibility === "PRIVATE" && (
                    <span className="text-[11px] text-text-muted">Privado</span>
                  )}
                </div>
                <h2 className="mt-2 font-medium">{project.name}</h2>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-text-muted">{project.description}</p>
                )}
                <p className="mt-3 text-xs text-text-muted">
                  {project._count.issues} {project._count.issues === 1 ? "issue" : "issues"}
                </p>
              </Link>
              </Tilt>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
