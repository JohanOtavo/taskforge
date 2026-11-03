import Link from "next/link";
import { notFound } from "next/navigation";

import { PhaseManager } from "@/components/board/phase-manager";
import { can } from "@/server/authz/permissions";
import { requireCtx } from "@/server/context";
import { getActiveWorkspace } from "@/server/current-org";
import { listPhases } from "@/server/modules/phases/service";
import { getBoard } from "@/server/modules/projects/service";

export default async function PhasesPage({ params }: PageProps<"/p/[key]/phases">) {
  const { key } = await params;
  const ctx = await requireCtx();
  const workspace = await getActiveWorkspace(ctx.actor.id);
  if (!workspace) notFound();

  const board = await getBoard(ctx.db, ctx.actor, workspace.id, key);
  const { phases } = await listPhases(ctx.db, ctx.actor, board.project.id);
  const canManage = can(board.role, "project.column.manage");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <nav aria-label="Ruta" className="mb-1 text-xs text-text-muted">
          <Link href="/" className="hover:text-accent hover:underline">
            Proyectos
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/p/${board.project.key}`} className="hover:text-accent hover:underline">
            {board.project.key}
          </Link>
          <span aria-hidden> / </span>
          Fases
        </nav>
        <h1 className="text-2xl font-bold">Fases</h1>
        <p className="text-sm text-text-muted">
          Agrupa las tarjetas de {board.project.name} por etapas. En el tablero, elige una fase para
          ver solo sus tarjetas.
        </p>
      </div>

      {canManage ? (
        <PhaseManager projectId={board.project.id} phases={phases} />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center text-sm text-text-muted">
          Solo quien administra el tablero puede crear y ordenar fases.
        </p>
      )}
    </div>
  );
}
