import "server-only";

import { cookies } from "next/headers";

import { db } from "./db";
import type { OrgRole } from "@prisma/client";

/// Espacio de trabajo activo.
///
/// Una persona puede pertenecer a varias organizaciones (acepta una
/// invitacion y ya son dos). Sin esto, la interfaz mostraria siempre la
/// primera y las demas serian invisibles.
///
/// La cookie es solo una PREFERENCIA de interfaz: siempre se comprueba que la
/// persona siga perteneciendo a esa organizacion. Si la cookie apunta a una
/// organizacion de la que ya la expulsaron, se ignora en silencio.
export const ACTIVE_ORG_COOKIE = "tf_org";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
};

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const memberships = await db.membership.findMany({
    where: { userId, org: { archivedAt: null } },
    select: { role: true, org: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) => ({
    id: membership.org.id,
    name: membership.org.name,
    slug: membership.org.slug,
    role: membership.role,
  }));
}

/// Devuelve el espacio activo, o null si la persona no pertenece a ninguno
/// (recien registrada, o la expulsaron del ultimo).
export async function getActiveWorkspace(userId: string): Promise<Workspace | null> {
  const workspaces = await listWorkspaces(userId);
  if (workspaces.length === 0) return null;

  const store = await cookies();
  const preferred = store.get(ACTIVE_ORG_COOKIE)?.value;

  return workspaces.find((workspace) => workspace.id === preferred) ?? workspaces[0];
}

export async function setActiveWorkspace(orgId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
