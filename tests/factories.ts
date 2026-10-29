import { db } from "@/server/db";
import { keyBetween } from "@/lib/ordering";
import { DEFAULT_WORKFLOW } from "@/server/modules/projects/schema";

import type { OrgRole, ProjectRole, ProjectVisibility } from "@prisma/client";

/// Fabricas minimas. Crean solo lo imprescindible para que un test sea
/// legible; todo lo demas lleva valor por defecto.

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export type TestUser = { id: string; email: string; name: string };

export async function makeUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const id = unique();
  return db.user.create({
    data: {
      email: overrides.email ?? `user-${id}@taskforge.local`,
      name: overrides.name ?? `Usuario ${id}`,
      // Las pruebas de autenticacion crean su propio hash; aqui no hace falta.
      passwordHash: null,
    },
    select: { id: true, email: true, name: true },
  });
}

export async function makeOrg(
  members: Array<{ user: TestUser; role: OrgRole }>,
): Promise<{ id: string; slug: string }> {
  const id = unique();
  return db.organization.create({
    data: {
      name: `Org ${id}`,
      slug: `org-${id}`,
      memberships: { create: members.map((m) => ({ userId: m.user.id, role: m.role })) },
    },
    select: { id: true, slug: true },
  });
}

export type TestProject = {
  id: string;
  key: string;
  orgId: string;
  columnIds: string[];
  stateIds: string[];
};

export async function makeProject(options: {
  orgId: string;
  key?: string;
  visibility?: ProjectVisibility;
  members?: Array<{ user: TestUser; role: ProjectRole }>;
}): Promise<TestProject> {
  const key = options.key ?? `P${(counter += 1).toString().padStart(2, "0")}`;

  const project = await db.project.create({
    data: {
      orgId: options.orgId,
      key,
      name: `Proyecto ${key}`,
      visibility: options.visibility ?? "ORG",
      ...(options.members?.length
        ? { members: { create: options.members.map((m) => ({ userId: m.user.id, role: m.role })) } }
        : {}),
    },
    select: { id: true, key: true, orgId: true },
  });

  const columnIds: string[] = [];
  const stateIds: string[] = [];
  for (const [index, step] of DEFAULT_WORKFLOW.entries()) {
    const state = await db.workflowState.create({
      data: {
        projectId: project.id,
        name: step.name,
        category: step.category,
        position: (index + 1) * 1000,
      },
      select: { id: true },
    });
    const column = await db.boardColumn.create({
      data: {
        projectId: project.id,
        stateId: state.id,
        name: step.name,
        position: (index + 1) * 1000,
      },
      select: { id: true },
    });
    stateIds.push(state.id);
    columnIds.push(column.id);
  }

  return { ...project, columnIds, stateIds };
}

export async function makeIssue(options: {
  project: TestProject;
  reporter: TestUser;
  columnIndex?: number;
  title?: string;
  number?: number;
}): Promise<{ id: string; number: number }> {
  const columnIndex = options.columnIndex ?? 0;
  const number =
    options.number ??
    (
      await db.project.update({
        where: { id: options.project.id },
        data: { issueCounter: { increment: 1 } },
        select: { issueCounter: true },
      })
    ).issueCounter;

  const last = await db.issue.findFirst({
    where: { projectId: options.project.id, columnId: options.project.columnIds[columnIndex] },
    orderBy: [{ position: "desc" }, { id: "desc" }],
    select: { position: true },
  });

  return db.issue.create({
    data: {
      orgId: options.project.orgId,
      projectId: options.project.id,
      number,
      title: options.title ?? `Issue ${number}`,
      stateId: options.project.stateIds[columnIndex],
      columnId: options.project.columnIds[columnIndex],
      position: keyBetween(last?.position ?? null, null),
      reporterId: options.reporter.id,
    },
    select: { id: true, number: true },
  });
}

export const actorOf = (user: TestUser) => ({ id: user.id, email: user.email });
