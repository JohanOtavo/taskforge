import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import * as issues from "@/server/modules/issues/service";

import { actorOf, makeOrg, makeProject, makeUser } from "../factories";

async function setup() {
  const owner = await makeUser({ name: "Olga" });
  const member = await makeUser({ name: "Mario" });
  const org = await makeOrg([
    { user: owner, role: "OWNER" },
    { user: member, role: "MEMBER" },
  ]);
  const project = await makeProject({ orgId: org.id });
  const issue = await issues.createIssue(db, actorOf(owner), {
    projectId: project.id,
    title: "Para archivar",
    type: "TASK",
    priority: "MEDIUM",
    labelIds: [],
    columnId: project.columnIds[1],
  });
  return { owner, member, org, project, issue };
}

describe("archivar y restaurar", () => {
  it("la archivada sale del tablero y aparece en la lista de archivadas", async () => {
    const { owner, org, project, issue } = await setup();

    await issues.archiveIssue(db, actorOf(owner), issue.id);

    const archived = await issues.listArchivedIssues(db, actorOf(owner), org.id, project.key);
    expect(archived.issues.map((row) => row.id)).toEqual([issue.id]);
  });

  it("restaurar la devuelve a la columna de su estado", async () => {
    const { owner, org, project, issue } = await setup();
    await issues.archiveIssue(db, actorOf(owner), issue.id);

    await issues.restoreIssue(db, actorOf(owner), issue.id);

    const row = await db.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { archivedAt: true, columnId: true },
    });
    expect(row).toEqual({ archivedAt: null, columnId: project.columnIds[1] });
    const archived = await issues.listArchivedIssues(db, actorOf(owner), org.id, project.key);
    expect(archived.issues).toEqual([]);
  });

  it("restaurar dos veces falla la segunda", async () => {
    const { owner, issue } = await setup();
    await issues.archiveIssue(db, actorOf(owner), issue.id);
    await issues.restoreIssue(db, actorOf(owner), issue.id);

    await expect(issues.restoreIssue(db, actorOf(owner), issue.id)).rejects.toThrow();
  });

  it("quien no puede archivar tampoco puede restaurar", async () => {
    const { owner, member, issue } = await setup();
    await issues.archiveIssue(db, actorOf(owner), issue.id);

    await expect(issues.restoreIssue(db, actorOf(member), issue.id)).rejects.toThrow();
    const row = await db.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { archivedAt: true },
    });
    expect(row.archivedAt).not.toBeNull();
  });

  it("nadie de otro espacio ve las archivadas", async () => {
    const { owner, org, project, issue } = await setup();
    await issues.archiveIssue(db, actorOf(owner), issue.id);
    const outsider = await makeUser();

    await expect(
      issues.listArchivedIssues(db, actorOf(outsider), org.id, project.key),
    ).rejects.toThrow();
  });
});
