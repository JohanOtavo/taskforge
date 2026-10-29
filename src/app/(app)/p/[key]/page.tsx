import Link from "next/link";
import { notFound } from "next/navigation";

import { Board } from "@/components/board/board";
import { NewIssueForm } from "@/components/board/new-issue-form";
import { ProjectMembers } from "@/components/board/project-members";
import { can } from "@/server/authz/permissions";
import { requireCtx } from "@/server/context";
import { getActiveWorkspace } from "@/server/current-org";
import { listLabels } from "@/server/modules/labels/service";
import { listProjectMembers } from "@/server/modules/orgs/service";
import { getBoard } from "@/server/modules/projects/service";

export default async function BoardPage({ params }: PageProps<"/p/[key]">) {
  const { key } = await params;
  const ctx = await requireCtx();

  // El espacio activo es lo que hace inequivoca la clave del proyecto: "TF"
  // puede existir en varias organizaciones.
  const workspace = await getActiveWorkspace(ctx.actor.id);
  if (!workspace) notFound();

  const board = await getBoard(ctx.db, ctx.actor, workspace.id, key);

  const [members, labels] = await Promise.all([
    listProjectMembers(ctx.db, ctx.actor, board.project.id),
    listLabels(ctx.db, ctx.actor, board.orgId),
  ]);

  const total = board.columns.reduce((sum, column) => sum + column.issues.length, 0);
  const assignables = [
    ...members.members.map((member) => member.user),
    ...members.candidates.map((member) => member.user),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label="Ruta" className="mb-1 text-xs text-text-muted">
            <Link href="/" className="hover:text-accent hover:underline">
              Proyectos
            </Link>
            <span aria-hidden> / </span>
            <span className="font-mono">{board.project.key}</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">{board.project.name}</h1>
          <p className="text-sm text-text-muted">
            {total} {total === 1 ? "issue activo" : "issues activos"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ProjectMembers
            projectId={board.project.id}
            orgId={board.orgId}
            members={members.members.map((member) => ({ ...member.user, role: member.role }))}
            candidates={members.candidates.map((member) => member.user)}
            canManage={can(board.role, "project.member.manage")}
          />
          {can(board.role, "issue.create") && (
            <NewIssueForm
              projectId={board.project.id}
              columns={board.columns.map((column) => ({ id: column.id, name: column.name }))}
              members={assignables}
              labels={labels}
            />
          )}
        </div>
      </div>

      <Board {...board} />
    </div>
  );
}
