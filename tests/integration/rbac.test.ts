import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import * as comments from "@/server/modules/comments/service";
import * as issues from "@/server/modules/issues/service";
import * as projects from "@/server/modules/projects/service";

import {
  actorOf,
  makeIssue,
  makeOrg,
  makeProject,
  makeUser,
  type TestProject,
  type TestUser,
} from "../factories";

/// Aplicacion de roles DENTRO de una misma organizacion. Complementa a
/// tenant-isolation.test.ts: alli nadie tiene acceso, aqui todos pertenecen a
/// la organizacion y lo que cambia es lo que cada rol puede hacer.

let owner: TestUser;
let admin: TestUser;
let member: TestUser;
let viewer: TestUser;
let org: { id: string };
let project: TestProject;

beforeEach(async () => {
  owner = await makeUser({ email: "owner@taskforge.local" });
  admin = await makeUser({ email: "admin@taskforge.local" });
  member = await makeUser({ email: "member@taskforge.local" });
  viewer = await makeUser({ email: "viewer@taskforge.local" });

  org = await makeOrg([
    { user: owner, role: "OWNER" },
    { user: admin, role: "ADMIN" },
    { user: member, role: "MEMBER" },
    { user: viewer, role: "VIEWER" },
  ]);
  project = await makeProject({ orgId: org.id, key: "RB" });
});

describe("VIEWER", () => {
  it("puede leer el tablero", async () => {
    const board = await projects.getBoard(db, actorOf(viewer), project.orgId, project.key);
    expect(board.role).toBe("VIEWER");
  });

  it("no puede crear issues", async () => {
    await expect(
      issues.createIssue(db, actorOf(viewer), {
        projectId: project.id,
        title: "no deberia",
        type: "TASK",
        priority: "MEDIUM",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no puede mover issues", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    await expect(
      issues.moveIssue(db, actorOf(viewer), {
        issueId: issue.id,
        toColumnId: project.columnIds[1],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no puede comentar", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    await expect(
      comments.createComment(db, actorOf(viewer), { issueId: issue.id, body: "hola" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no puede crear proyectos", async () => {
    await expect(
      projects.createProject(db, actorOf(viewer), {
        orgId: org.id,
        key: "NOPE",
        name: "No",
        visibility: "ORG",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("MEMBER", () => {
  it("puede crear y mover issues", async () => {
    const created = await issues.createIssue(db, actorOf(member), {
      projectId: project.id,
      title: "trabajo normal",
      type: "TASK",
      priority: "MEDIUM",
      columnId: project.columnIds[0],
    });
    await expect(
      issues.moveIssue(db, actorOf(member), {
        issueId: created.id,
        toColumnId: project.columnIds[1],
      }),
    ).resolves.toBeDefined();
  });

  it("no puede archivar issues", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    await expect(issues.archiveIssue(db, actorOf(member), issue.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("no puede modificar el proyecto", async () => {
    await expect(
      projects.updateProject(db, actorOf(member), { projectId: project.id, name: "Otro" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("puede borrar su propio comentario", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    const comment = await comments.createComment(db, actorOf(member), {
      issueId: issue.id,
      body: "mio",
    });
    await expect(comments.deleteComment(db, actorOf(member), comment.id)).resolves.toBeUndefined();

    const stored = await db.comment.findUniqueOrThrow({
      where: { id: comment.id },
      select: { deletedAt: true },
    });
    // Borrado logico: el hilo no queda con huecos sin explicacion.
    expect(stored.deletedAt).not.toBeNull();
  });

  it("no puede borrar el comentario de otra persona", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    const comment = await comments.createComment(db, actorOf(admin), {
      issueId: issue.id,
      body: "del admin",
    });
    await expect(comments.deleteComment(db, actorOf(member), comment.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("ADMIN de organizacion", () => {
  it("puede archivar issues y modificar el proyecto", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    await expect(issues.archiveIssue(db, actorOf(admin), issue.id)).resolves.toBeUndefined();
    await expect(
      projects.updateProject(db, actorOf(admin), { projectId: project.id, name: "Renombrado" }),
    ).resolves.toBeUndefined();
  });

  it("puede borrar comentarios de otras personas", async () => {
    const issue = await makeIssue({ project, reporter: owner });
    const comment = await comments.createComment(db, actorOf(member), {
      issueId: issue.id,
      body: "fuera de lugar",
    });
    await expect(comments.deleteComment(db, actorOf(admin), comment.id)).resolves.toBeUndefined();
  });
});

describe("proyectos privados y overrides", () => {
  it("un MEMBER no ve un proyecto PRIVATE del que no es miembro", async () => {
    const privado = await makeProject({ orgId: org.id, key: "PRV", visibility: "PRIVATE" });

    await expect(projects.getBoard(db, actorOf(member), privado.orgId, privado.key)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const visibles = await projects.listProjects(db, actorOf(member), org.id);
    expect(visibles.map((p) => p.key)).not.toContain("PRV");
  });

  it("un OWNER si ve un proyecto PRIVATE sin ser miembro", async () => {
    const privado = await makeProject({ orgId: org.id, key: "PRW", visibility: "PRIVATE" });
    const board = await projects.getBoard(db, actorOf(owner), privado.orgId, privado.key);
    expect(board.role).toBe("ADMIN");
  });

  it("una fila ProjectMember puede subir el rol en un proyecto ORG", async () => {
    const elevado = await makeProject({
      orgId: org.id,
      key: "UP",
      members: [{ user: viewer, role: "ADMIN" }],
    });
    const board = await projects.getBoard(db, actorOf(viewer), elevado.orgId, elevado.key);
    expect(board.role).toBe("ADMIN");
  });

  it("una fila ProjectMember tambien puede bajar el rol en un proyecto ORG", async () => {
    const degradado = await makeProject({
      orgId: org.id,
      key: "DOWN",
      members: [{ user: member, role: "VIEWER" }],
    });
    await expect(
      issues.createIssue(db, actorOf(member), {
        projectId: degradado.id,
        title: "no deberia",
        type: "TASK",
        priority: "MEDIUM",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un ADMIN de proyecto no puede dejar fuera al OWNER de la organizacion", async () => {
    const capturado = await makeProject({
      orgId: org.id,
      key: "CAP",
      visibility: "PRIVATE",
      members: [{ user: member, role: "ADMIN" }],
    });
    // El rol OWNER/ADMIN de organizacion no es anulable, por diseno.
    const board = await projects.getBoard(db, actorOf(owner), capturado.orgId, capturado.key);
    expect(board.role).toBe("ADMIN");
  });

  it("quien crea un proyecto queda ADMIN del proyecto aunque sea MEMBER de la organizacion", async () => {
    const created = await projects.createProject(db, actorOf(member), {
      orgId: org.id,
      key: "MINE",
      name: "Proyecto propio",
      visibility: "PRIVATE",
    });
    const board = await projects.getBoard(db, actorOf(member), org.id, created.key);
    expect(board.role).toBe("ADMIN");
  });
});

describe("integridad al borrar", () => {
  it("borrar un proyecto con issues no falla", async () => {
    // Con onDelete: Restrict en stateId, el trigger de integridad se disparaba
    // ANTES del cascade que habria borrado esos issues, asi que borrar un
    // proyecto con trabajo dentro fallaba siempre.
    const issue = await makeIssue({ project, reporter: owner });

    await expect(db.project.delete({ where: { id: project.id } })).resolves.toBeDefined();
    expect(await db.issue.count({ where: { id: issue.id } })).toBe(0);
    expect(await db.workflowState.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("borrar una organizacion con proyectos e issues no falla", async () => {
    await makeIssue({ project, reporter: owner });

    await expect(db.organization.delete({ where: { id: org.id } })).resolves.toBeDefined();
    expect(await db.project.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("borrar un usuario conserva su rastro de auditoria", async () => {
    const issue = await issues.createIssue(db, actorOf(member), {
      projectId: project.id,
      title: "deja rastro",
      type: "TASK",
      priority: "MEDIUM",
    });
    // El issue referencia a member como reporter; se archiva antes de borrar.
    await db.issue.delete({ where: { id: issue.id } });
    await db.user.delete({ where: { id: member.id } });

    const rastro = await db.auditLog.findFirst({
      where: { actorEmail: member.email },
      select: { actorId: true, actorEmail: true, action: true },
    });
    // actorId queda en NULL, pero el correo y la accion se conservan: el
    // registro es una instantanea, no una union.
    expect(rastro).toMatchObject({ actorId: null, actorEmail: member.email });
  });
});
