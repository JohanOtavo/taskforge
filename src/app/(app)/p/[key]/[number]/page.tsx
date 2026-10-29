import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueDetail } from "@/components/board/issue-detail";
import { requireCtx } from "@/server/context";
import { getIssueDetail } from "@/server/modules/issues/service";
import { listProjectMembers } from "@/server/modules/orgs/service";
import { getActiveWorkspace } from "@/server/current-org";

export default async function IssuePage({ params }: PageProps<"/p/[key]/[number]">) {
  const { key, number } = await params;
  const parsed = Number(number);
  if (!Number.isInteger(parsed) || parsed <= 0) notFound();

  const ctx = await requireCtx();

  const workspace = await getActiveWorkspace(ctx.actor.id);
  if (!workspace) notFound();

  const { issue, scope } = await getIssueDetail(ctx.db, ctx.actor, workspace.id, key, parsed);
  const members = await listProjectMembers(ctx.db, ctx.actor, scope.projectId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Ruta" className="text-xs text-text-muted">
        <Link href="/" className="hover:text-accent hover:underline">
          Proyectos
        </Link>
        <span aria-hidden> / </span>
        <Link href={`/p/${key}`} className="hover:text-accent hover:underline">
          {key}
        </Link>
        <span aria-hidden> / </span>
        <span className="font-mono">
          {key}-{issue.number}
        </span>
      </nav>

      <IssueDetail
        issue={issue}
        projectKey={key}
        role={scope.role}
        actorId={ctx.actor.id}
        members={[...members.members, ...members.candidates].map((member) => member.user)}
      />
    </div>
  );
}
