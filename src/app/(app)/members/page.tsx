import { redirect } from "next/navigation";

import { MembersAdmin } from "@/components/layout/members-admin";
import { can } from "@/server/authz/permissions";
import { requireCtx } from "@/server/context";
import { listLabels } from "@/server/modules/labels/service";
import { getActiveWorkspace } from "@/server/current-org";
import { listMembers } from "@/server/modules/orgs/service";

export default async function MembersPage() {
  const ctx = await requireCtx();
  const current = await getActiveWorkspace(ctx.actor.id);
  // Sin espacio de trabajo no hay equipo que gestionar; la portada ofrece
  // crear uno.
  if (!current) redirect("/");

  const [members, labels] = await Promise.all([
    listMembers(ctx.db, ctx.actor, current.id),
    listLabels(ctx.db, ctx.actor, current.id),
  ]);

  return (
    <MembersAdmin
      orgId={current.id}
      orgName={current.name}
      myRole={current.role}
      actorId={ctx.actor.id}
      members={members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      }))}
      labels={labels}
      canInvite={can(current.role, "org.member.invite")}
      canManageLabels={can(current.role, "org.label.manage")}
    />
  );
}
