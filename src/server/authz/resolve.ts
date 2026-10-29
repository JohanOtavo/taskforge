import "server-only";

import type { TxClient } from "../db";
import { forbidden, notFound } from "../errors";
import { can, type Permission } from "./permissions";
import { effectiveProjectRole, type EffectiveRole } from "./roles";

/// Unico modulo de authz que toca la base de datos.
///
/// Regla de oro: el ambito se DERIVA del objeto, nunca se acepta del cliente.
/// `moveIssue({ issueId, orgId })` con el orgId del cuerpo de la peticion se
/// autoriza a si mismo. Aqui se sube del issue al proyecto y del proyecto a
/// la organizacion, y solo entonces se comprueba.

export type OrgScope = {
  orgId: string;
  role: EffectiveRole;
};

export type ProjectScope = {
  orgId: string;
  projectId: string;
  projectKey: string;
  role: EffectiveRole;
};

export type IssueScope = ProjectScope & {
  issueId: string;
  issueNumber: number;
};

export async function requireOrgAccess(
  db: TxClient,
  userId: string,
  orgId: string,
  permission: Permission,
): Promise<OrgScope> {
  const membership = await db.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, org: { select: { archivedAt: true } } },
  });

  if (!membership || membership.org.archivedAt) notFound("La organizacion");

  const role = membership.role as EffectiveRole;
  if (!can(role, permission)) forbidden();
  return { orgId, role };
}

export async function requireProjectAccess(
  db: TxClient,
  userId: string,
  projectId: string,
  permission: Permission,
): Promise<ProjectScope> {
  const project = await db.project.findFirst({
    where: { id: projectId, archivedAt: null },
    select: {
      id: true,
      orgId: true,
      key: true,
      visibility: true,
      org: {
        select: {
          archivedAt: true,
          memberships: { where: { userId }, select: { role: true } },
        },
      },
      members: { where: { userId }, select: { role: true } },
    },
  });

  if (!project || project.org.archivedAt) notFound("El proyecto");

  const role = effectiveProjectRole({
    orgRole: project.org.memberships[0]?.role ?? null,
    visibility: project.visibility,
    projectRole: project.members[0]?.role ?? null,
  });

  // Un rol NONE es indistinguible de "no existe" de cara al cliente: revelar
  // la diferencia filtraria la existencia de proyectos de otras orgs.
  if (role === "NONE") notFound("El proyecto");
  if (!can(role, permission)) forbidden();

  return { orgId: project.orgId, projectId: project.id, projectKey: project.key, role };
}

/// Acceso a un issue por su id. Resuelve issue -> proyecto -> organizacion en
/// una sola consulta y despues comprueba el permiso.
export async function requireIssueAccess(
  db: TxClient,
  userId: string,
  issueId: string,
  permission: Permission,
): Promise<IssueScope> {
  const issue = await db.issue.findFirst({
    where: { id: issueId, archivedAt: null },
    select: { id: true, number: true, projectId: true },
  });

  if (!issue) notFound("El issue");

  const scope = await requireProjectAccess(db, userId, issue.projectId, permission);
  return { ...scope, issueId: issue.id, issueNumber: issue.number };
}

