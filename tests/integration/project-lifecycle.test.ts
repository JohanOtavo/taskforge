import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import * as comments from "@/server/modules/comments/service";
import * as issues from "@/server/modules/issues/service";
import * as lifecycle from "@/server/modules/projects/lifecycle";
import * as projects from "@/server/modules/projects/service";
import { getBoard, listProjects } from "@/server/modules/projects/service";

import { actorOf, makeOrg, makeProject, makeUser } from "../factories";

async function setup() {
  const owner = await makeUser({ name: "Olga" });
  const member = await makeUser({ name: "Mario" });
  const org = await makeOrg([
    { user: owner, role: "OWNER" },
    { user: member, role: "MEMBER" },
  ]);
  const project = await makeProject({ orgId: org.id, key: "WEB" });
  const issue = await issues.createIssue(db, actorOf(owner), {
    projectId: project.id,
    title: "Con historia",
    type: "TASK",
    priority: "MEDIUM",
    labelIds: [],
  });
  await comments.createComment(db, actorOf(owner), { issueId: issue.id, body: "Un comentario" });
  return { owner, member, org, project, issue };
}

describe("archivar y eliminar proyectos", () => {
  it("archivar lo saca de la portada y deja de abrirse; restaurar lo devuelve", async () => {
    const { owner, org, project } = await setup();

    await lifecycle.archiveProject(db, actorOf(owner), project.id);

    expect(await listProjects(db, actorOf(owner), org.id)).toEqual([]);
    await expect(getBoard(db, actorOf(owner), org.id, project.key)).rejects.toThrow();
    const archived = await lifecycle.listArchivedProjects(db, actorOf(owner), org.id);
    expect(archived.map((row) => [row.key, row.canRestore, row.canDelete])).toEqual([
      ["WEB", true, true],
    ]);

    await lifecycle.restoreProject(db, actorOf(owner), project.id);

    expect((await listProjects(db, actorOf(owner), org.id)).map((row) => row.key)).toEqual(["WEB"]);
  });

  it("un miembro no puede archivar", async () => {
    const { member, project } = await setup();

    await expect(lifecycle.archiveProject(db, actorOf(member), project.id)).rejects.toThrow();
  });

  it("un administrador que no lo creo tampoco puede archivar", async () => {
    const { org, project } = await setup();
    const admin = await makeUser({ name: "Ada" });
    await db.membership.create({ data: { orgId: org.id, userId: admin.id, role: "ADMIN" } });

    await expect(lifecycle.archiveProject(db, actorOf(admin), project.id)).rejects.toThrow(
      "Solo el dueño del espacio o quien creó el proyecto",
    );
  });

  it("quien creo el proyecto lo archiva y lo elimina aunque sea solo miembro", async () => {
    const { owner, member, org } = await setup();
    const mine = await projects.createProject(db, actorOf(member), {
      orgId: org.id,
      name: "El mio",
      key: "MIO",
      visibility: "ORG",
    });

    await lifecycle.archiveProject(db, actorOf(member), mine.id);
    const archived = await lifecycle.listArchivedProjects(db, actorOf(member), org.id);
    expect(archived.map((row) => [row.key, row.canDelete])).toEqual([["MIO", true]]);
    await lifecycle.deleteProject(db, actorOf(member), { projectId: mine.id, confirmKey: "MIO" });

    expect(await db.project.count({ where: { id: mine.id } })).toBe(0);
    // El dueno no lo creo, pero como dueno del espacio tambien podia.
    expect(owner.id).not.toBe(member.id);
  });

  it("no deja eliminar un proyecto sin archivar", async () => {
    const { owner, project } = await setup();

    await expect(
      lifecycle.deleteProject(db, actorOf(owner), { projectId: project.id, confirmKey: "WEB" }),
    ).rejects.toThrow();
    expect(await db.project.count({ where: { id: project.id } })).toBe(1);
  });

  it("exige escribir la clave para eliminar", async () => {
    const { owner, project } = await setup();
    await lifecycle.archiveProject(db, actorOf(owner), project.id);

    await expect(
      lifecycle.deleteProject(db, actorOf(owner), { projectId: project.id, confirmKey: "OTRA" }),
    ).rejects.toThrow("Escribe la clave del proyecto (WEB)");
    expect(await db.project.count({ where: { id: project.id } })).toBe(1);
  });

  it("eliminar borra el proyecto con sus tarjetas y comentarios, y deja la auditoria", async () => {
    const { owner, project, issue } = await setup();
    await lifecycle.archiveProject(db, actorOf(owner), project.id);

    await lifecycle.deleteProject(db, actorOf(owner), { projectId: project.id, confirmKey: "web" });

    expect(await db.project.count({ where: { id: project.id } })).toBe(0);
    expect(await db.issue.count({ where: { id: issue.id } })).toBe(0);
    expect(await db.comment.count({ where: { issueId: issue.id } })).toBe(0);
    expect(
      await db.auditLog.count({ where: { action: "project.deleted", entityId: project.id } }),
    ).toBe(1);
  });

  it("un miembro no ve el boton de eliminar y el servidor tampoco le deja", async () => {
    const { owner, member, org, project } = await setup();
    await lifecycle.archiveProject(db, actorOf(owner), project.id);

    const archived = await lifecycle.listArchivedProjects(db, actorOf(member), org.id);
    expect(archived.map((row) => [row.canRestore, row.canDelete])).toEqual([[false, false]]);
    await expect(
      lifecycle.deleteProject(db, actorOf(member), { projectId: project.id, confirmKey: "WEB" }),
    ).rejects.toThrow();
  });
});
