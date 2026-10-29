import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import * as comments from "@/server/modules/comments/service";
import * as issues from "@/server/modules/issues/service";
import * as labels from "@/server/modules/labels/service";
import * as orgs from "@/server/modules/orgs/service";
import * as projects from "@/server/modules/projects/service";
import * as audit from "@/server/modules/audit/service";

import {
  actorOf,
  makeIssue,
  makeOrg,
  makeProject,
  makeUser,
  type TestProject,
  type TestUser,
} from "../factories";

/// Matriz de aislamiento entre inquilinos.
///
/// Es el test que mas importa de toda la suite: enumera cada funcion exportada
/// de los servicios y la invoca como un usuario de la organizacion B pasando
/// identificadores de la organizacion A. Ninguna debe responder.
///
/// Sin esto, el aislamiento depende de recordar un `where` en cada consulta
/// nueva, y basta un olvido para que haya fuga entre organizaciones.

type Fixture = {
  orgA: { id: string };
  orgB: { id: string };
  ownerA: TestUser;
  ownerB: TestUser;
  projectA: TestProject;
  issueA: { id: string; number: number };
  commentAId: string;
  labelAId: string;
};

let f: Fixture;

beforeEach(async () => {
  const ownerA = await makeUser({ email: "owner-a@taskforge.local" });
  const ownerB = await makeUser({ email: "owner-b@taskforge.local" });

  const orgA = await makeOrg([{ user: ownerA, role: "OWNER" }]);
  const orgB = await makeOrg([{ user: ownerB, role: "OWNER" }]);

  const projectA = await makeProject({ orgId: orgA.id, key: "AAA" });
  const issueA = await makeIssue({ project: projectA, reporter: ownerA });

  const label = await db.label.create({
    data: { orgId: orgA.id, name: "bug", color: "red" },
    select: { id: true },
  });

  const comment = await db.comment.create({
    data: { orgId: orgA.id, issueId: issueA.id, authorId: ownerA.id, body: "privado" },
    select: { id: true },
  });

  f = { orgA, orgB, ownerA, ownerB, projectA, issueA, commentAId: comment.id, labelAId: label.id };
});

/// Todo acceso cruzado debe fallar como NOT_FOUND o FORBIDDEN. NOT_FOUND es
/// preferible: distinguir "no existe" de "no puedes" revela que el recurso
/// existe en otra organizacion.
async function expectDenied(action: () => Promise<unknown>): Promise<void> {
  await expect(action()).rejects.toSatisfy((error: unknown) => {
    if (!(error instanceof AppError)) return false;
    return error.code === "NOT_FOUND" || error.code === "FORBIDDEN";
  });
}

describe("aislamiento entre organizaciones", () => {
  it("no deja leer los miembros de otra organizacion", async () => {
    await expectDenied(() => orgs.listMembers(db, actorOf(f.ownerB), f.orgA.id));
  });

  it("no deja invitar a otra organizacion", async () => {
    await expectDenied(() =>
      orgs.inviteMember(db, actorOf(f.ownerB), {
        orgId: f.orgA.id,
        email: "intruso@taskforge.local",
        role: "ADMIN",
      }),
    );
  });

  it("no deja cambiar roles en otra organizacion", async () => {
    await expectDenied(() =>
      orgs.updateMemberRole(db, actorOf(f.ownerB), {
        orgId: f.orgA.id,
        userId: f.ownerA.id,
        role: "VIEWER",
      }),
    );
  });

  it("no deja expulsar miembros de otra organizacion", async () => {
    await expectDenied(() =>
      orgs.removeMember(db, actorOf(f.ownerB), { orgId: f.orgA.id, userId: f.ownerA.id }),
    );
  });

  it("no deja listar los proyectos de otra organizacion", async () => {
    await expectDenied(() => projects.listProjects(db, actorOf(f.ownerB), f.orgA.id));
  });

  it("no deja crear un proyecto en otra organizacion", async () => {
    await expectDenied(() =>
      projects.createProject(db, actorOf(f.ownerB), {
        orgId: f.orgA.id,
        key: "HACK",
        name: "Intruso",
        visibility: "ORG",
      }),
    );
  });

  it("no deja modificar un proyecto de otra organizacion", async () => {
    await expectDenied(() =>
      projects.updateProject(db, actorOf(f.ownerB), {
        projectId: f.projectA.id,
        name: "Secuestrado",
      }),
    );
  });

  it("no deja leer el tablero de otra organizacion", async () => {
    await expectDenied(() => projects.getBoard(db, actorOf(f.ownerB), f.projectA.orgId, f.projectA.key));
  });

  it("no deja leer los miembros asignables de un proyecto ajeno", async () => {
    await expectDenied(() => projects.getProjectMembers(db, actorOf(f.ownerB), f.projectA.id));
  });

  it("no deja crear un issue en un proyecto ajeno", async () => {
    await expectDenied(() =>
      issues.createIssue(db, actorOf(f.ownerB), {
        projectId: f.projectA.id,
        title: "Inyectado",
        type: "TASK",
        priority: "MEDIUM",
      }),
    );
  });

  it("no deja modificar un issue ajeno aunque se conozca su id", async () => {
    await expectDenied(() =>
      issues.updateIssue(db, actorOf(f.ownerB), {
        issueId: f.issueA.id,
        version: 0,
        title: "Secuestrado",
      }),
    );
  });

  it("no deja mover un issue ajeno", async () => {
    await expectDenied(() =>
      issues.moveIssue(db, actorOf(f.ownerB), {
        issueId: f.issueA.id,
        toColumnId: f.projectA.columnIds[1],
      }),
    );
  });

  it("no deja archivar un issue ajeno", async () => {
    await expectDenied(() => issues.archiveIssue(db, actorOf(f.ownerB), f.issueA.id));
  });

  it("no deja listar issues de un proyecto ajeno", async () => {
    await expectDenied(() =>
      issues.listIssues(db, actorOf(f.ownerB), {
        projectId: f.projectA.id,
        includeArchived: false,
        orderBy: "updatedAt",
        direction: "desc",
        limit: 50,
      }),
    );
  });

  it("no deja abrir el detalle de un issue ajeno", async () => {
    await expectDenied(() =>
      issues.getIssueDetail(db, actorOf(f.ownerB), f.projectA.orgId, f.projectA.key, f.issueA.number),
    );
  });

  it("no deja comentar en un issue ajeno", async () => {
    await expectDenied(() =>
      comments.createComment(db, actorOf(f.ownerB), {
        issueId: f.issueA.id,
        body: "deberia fallar",
      }),
    );
  });

  it("no deja borrar un comentario ajeno", async () => {
    await expectDenied(() => comments.deleteComment(db, actorOf(f.ownerB), f.commentAId));
  });

  it("no deja listar las etiquetas de otra organizacion", async () => {
    await expectDenied(() => labels.listLabels(db, actorOf(f.ownerB), f.orgA.id));
  });

  it("no deja crear etiquetas en otra organizacion", async () => {
    await expectDenied(() =>
      labels.createLabel(db, actorOf(f.ownerB), {
        orgId: f.orgA.id,
        name: "intruso",
        color: "red",
      }),
    );
  });

  it("no deja leer la auditoria de otra organizacion", async () => {
    await expectDenied(() => audit.listAuditLog(db, actorOf(f.ownerB), f.orgA.id));
  });
});

describe("identificadores ajenos dentro de una operacion propia", () => {
  it("descarta una etiqueta de otra organizacion al crear un issue", async () => {
    // El labelId existe, pero pertenece a la organizacion A: debe ignorarse
    // en silencio, no asociarse.
    const projectB = await makeProject({ orgId: f.orgB.id, key: "BBB" });
    const created = await issues.createIssue(db, actorOf(f.ownerB), {
      projectId: projectB.id,
      title: "Con etiqueta ajena",
      type: "TASK",
      priority: "MEDIUM",
      labelIds: [f.labelAId],
    });

    expect(await db.issueLabel.count({ where: { issueId: created.id } })).toBe(0);
  });

  it("rechaza asignar un issue a alguien de otra organizacion", async () => {
    const projectB = await makeProject({ orgId: f.orgB.id, key: "BBC" });
    await expectDenied(() =>
      issues.createIssue(db, actorOf(f.ownerB), {
        projectId: projectB.id,
        title: "Asignado a un extrano",
        type: "TASK",
        priority: "MEDIUM",
        assigneeId: f.ownerA.id,
      }),
    );
  });

  it("rechaza mover un issue a una columna de otro proyecto", async () => {
    const projectB = await makeProject({ orgId: f.orgB.id, key: "BBD" });
    const issueB = await makeIssue({ project: projectB, reporter: f.ownerB });

    await expectDenied(() =>
      issues.moveIssue(db, actorOf(f.ownerB), {
        issueId: issueB.id,
        toColumnId: f.projectA.columnIds[0],
      }),
    );
  });
});

describe("respaldo en la base de datos", () => {
  it("la FK compuesta impide un issue cuyo orgId no cuadre con su proyecto", async () => {
    // Incluso saltandose por completo la capa de servicio.
    await expect(
      db.issue.create({
        data: {
          orgId: f.orgB.id,
          projectId: f.projectA.id,
          number: 999,
          title: "Inconsistente",
          stateId: f.projectA.stateIds[0],
          position: "a0",
          reporterId: f.ownerB.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("la FK compuesta impide un comentario cuyo orgId no cuadre con su issue", async () => {
    await expect(
      db.comment.create({
        data: {
          orgId: f.orgB.id,
          issueId: f.issueA.id,
          authorId: f.ownerB.id,
          body: "Inconsistente",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("claves de proyecto repetidas entre organizaciones", () => {
  it("cada quien ve el tablero de SU organizacion, no el del otro", async () => {
    // `Project.key` solo es unico dentro de una organizacion. "TF" es
    // justamente la clave que dos equipos distintos eligen a la vez.
    const projectAtf = await makeProject({ orgId: f.orgA.id, key: "TF" });
    const projectBtf = await makeProject({ orgId: f.orgB.id, key: "TF" });

    await makeIssue({ project: projectAtf, reporter: f.ownerA, title: "secreto de A" });
    await makeIssue({ project: projectBtf, reporter: f.ownerB, title: "secreto de B" });

    const boardA = await projects.getBoard(db, actorOf(f.ownerA), f.orgA.id, "TF");
    const boardB = await projects.getBoard(db, actorOf(f.ownerB), f.orgB.id, "TF");

    expect(boardA.project.id).toBe(projectAtf.id);
    expect(boardB.project.id).toBe(projectBtf.id);

    const titlesA = boardA.columns.flatMap((column) => column.issues.map((i) => i.title));
    const titlesB = boardB.columns.flatMap((column) => column.issues.map((i) => i.title));
    expect(titlesA).toEqual(["secreto de A"]);
    expect(titlesB).toEqual(["secreto de B"]);
  });

  it("no deja pedir una clave propia acotandola a la organizacion ajena", async () => {
    await makeProject({ orgId: f.orgA.id, key: "TF" });
    await makeProject({ orgId: f.orgB.id, key: "TF" });

    await expectDenied(() => projects.getBoard(db, actorOf(f.ownerB), f.orgA.id, "TF"));
  });
});

describe("anclas de ambito en la base de datos", () => {
  it("impide un issue con el estado de otro proyecto", async () => {
    const otro = await makeProject({ orgId: f.orgA.id, key: "ZZA" });

    // Saltandose por completo la capa de servicio: la FK compuesta
    // (stateId, projectId) hace que esto sea inexpresable.
    await expect(
      db.issue.create({
        data: {
          orgId: f.orgA.id,
          projectId: f.projectA.id,
          number: 9001,
          title: "estado ajeno",
          stateId: otro.stateIds[0],
          position: "a0",
          reporterId: f.ownerA.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("impide un issue en la columna de otro proyecto", async () => {
    const otro = await makeProject({ orgId: f.orgA.id, key: "ZZB" });

    await expect(
      db.issue.create({
        data: {
          orgId: f.orgA.id,
          projectId: f.projectA.id,
          number: 9002,
          title: "columna ajena",
          stateId: f.projectA.stateIds[0],
          columnId: otro.columnIds[0],
          position: "a0",
          reporterId: f.ownerA.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("impide un issue cuyo padre esta en otro proyecto", async () => {
    const otro = await makeProject({ orgId: f.orgA.id, key: "ZZC" });
    const padreAjeno = await makeIssue({ project: otro, reporter: f.ownerA });

    await expect(
      db.issue.create({
        data: {
          orgId: f.orgA.id,
          projectId: f.projectA.id,
          number: 9003,
          title: "padre ajeno",
          stateId: f.projectA.stateIds[0],
          parentId: padreAjeno.id,
          position: "a0",
          reporterId: f.ownerA.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("impide unir un issue con la etiqueta de otra organizacion", async () => {
    // Es el ancla que mas importa: filterOrgLabels descarta en silencio los
    // ids ajenos, asi que un fallo que lo esquive falla ABIERTO.
    await expect(
      db.issueLabel.create({
        data: { issueId: f.issueA.id, labelId: f.labelAId, orgId: f.orgB.id },
      }),
    ).rejects.toThrow();
  });

  it("impide una columna cableada al estado de otro proyecto", async () => {
    const otro = await makeProject({ orgId: f.orgA.id, key: "ZZD" });

    await expect(
      db.boardColumn.create({
        data: {
          projectId: f.projectA.id,
          stateId: otro.stateIds[0],
          name: "columna cruzada",
          position: 5000,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("restricciones de valor", () => {
  it("impide una posicion vacia", async () => {
    await expect(
      db.issue.update({ where: { id: f.issueA.id }, data: { position: "" } }),
    ).rejects.toThrow();
  });

  it("impide un comentario en blanco", async () => {
    await expect(
      db.comment.create({
        data: { orgId: f.orgA.id, issueId: f.issueA.id, authorId: f.ownerA.id, body: "   " },
      }),
    ).rejects.toThrow();
  });
});
