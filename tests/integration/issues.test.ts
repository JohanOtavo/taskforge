import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { compareByPosition } from "@/lib/ordering";
import * as comments from "@/server/modules/comments/service";
import * as issues from "@/server/modules/issues/service";
import * as projects from "@/server/modules/projects/service";
import { pruneExpiredSessions, pruneProjectEvents } from "@/server/realtime/retention";

import {
  actorOf,
  makeIssue,
  makeOrg,
  makeProject,
  makeUser,
  type TestProject,
  type TestUser,
} from "../factories";

let owner: TestUser;
let member: TestUser;
let project: TestProject;

beforeEach(async () => {
  owner = await makeUser({ email: "owner@taskforge.local" });
  member = await makeUser({ email: "member@taskforge.local" });
  const org = await makeOrg([
    { user: owner, role: "OWNER" },
    { user: member, role: "MEMBER" },
  ]);
  project = await makeProject({ orgId: org.id, key: "TF" });
});

const create = (title: string, columnIndex = 0) =>
  issues.createIssue(db, actorOf(owner), {
    projectId: project.id,
    title,
    type: "TASK",
    priority: "MEDIUM",
    columnId: project.columnIds[columnIndex],
  });

describe("numeracion de issues", () => {
  it("empieza en 1 y avanza de uno en uno", async () => {
    expect((await create("primero")).key).toBe("TF-1");
    expect((await create("segundo")).key).toBe("TF-2");
  });

  it("no duplica numeros con creaciones concurrentes", async () => {
    // Este es el caso que rompe un patron leer-sumar-escribir: todas las
    // llamadas leerian el mismo contador.
    const created = await Promise.all(
      Array.from({ length: 12 }, (_, i) => create(`concurrente ${i}`)),
    );

    const numbers = created.map((issue) => issue.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(12);
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe("concurrencia optimista", () => {
  it("acepta la primera escritura y rechaza la segunda con version obsoleta", async () => {
    const issue = await create("editado a dos manos");

    const first = await issues.updateIssue(db, actorOf(owner), {
      issueId: issue.id,
      version: 0,
      description: "lo que escribio Ana",
    });
    expect(first.version).toBe(1);

    // Luis tenia el formulario abierto con la version 0.
    await expect(
      issues.updateIssue(db, actorOf(member), {
        issueId: issue.id,
        version: 0,
        description: "lo que escribio Luis",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const stored = await db.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { description: true, version: true },
    });
    // La primera escritura sobrevive; no se pierde en silencio.
    expect(stored.description).toBe("lo que escribio Ana");
    expect(stored.version).toBe(1);
  });

  it("deja reintentar con la version actualizada", async () => {
    const issue = await create("reintento");
    await issues.updateIssue(db, actorOf(owner), { issueId: issue.id, version: 0, title: "v1" });
    const retry = await issues.updateIssue(db, actorOf(member), {
      issueId: issue.id,
      version: 1,
      title: "v2",
    });
    expect(retry.version).toBe(2);
  });
});

describe("ordenacion y movimiento", () => {
  it("coloca los nuevos issues al final de su columna", async () => {
    const a = await create("a");
    const b = await create("b");
    const c = await create("c");

    const rows = await db.issue.findMany({
      where: { columnId: project.columnIds[0] },
      select: { id: true, position: true },
    });
    const ordered = rows.sort(compareByPosition).map((row) => row.id);
    expect(ordered).toEqual([a.id, b.id, c.id]);
  });

  it("mueve un issue al principio por intencion, sin posicion del cliente", async () => {
    const a = await create("a");
    const b = await create("b");

    // "antes de a" se expresa como beforeId, no como una posicion calculada.
    await issues.moveIssue(db, actorOf(owner), {
      issueId: b.id,
      toColumnId: project.columnIds[0],
      beforeId: a.id,
    });

    const rows = await db.issue.findMany({
      where: { columnId: project.columnIds[0] },
      select: { id: true, position: true },
    });
    expect(rows.sort(compareByPosition).map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("sobrevive a 60 movimientos al mismo borde sin colisionar", async () => {
    // Con posiciones en double, hacia la insercion 50 el punto medio deja de
    // existir y las tarjetas empatan.
    const anchor = await create("ancla");
    let firstId = anchor.id;

    for (let i = 0; i < 60; i += 1) {
      const next = await create(`arrastrada ${i}`);
      await issues.moveIssue(db, actorOf(owner), {
        issueId: next.id,
        toColumnId: project.columnIds[0],
        beforeId: firstId,
      });
      firstId = next.id;
    }

    const rows = await db.issue.findMany({
      where: { columnId: project.columnIds[0] },
      select: { id: true, position: true },
    });
    expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
    expect(rows.sort(compareByPosition)[0].id).toBe(firstId);
  });

  it("mover de columna cambia el estado autoritativo", async () => {
    const issue = await create("de por hacer a hecho");
    await issues.moveIssue(db, actorOf(owner), {
      issueId: issue.id,
      toColumnId: project.columnIds[3],
    });

    const stored = await db.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { stateId: true, state: { select: { category: true } } },
    });
    expect(stored.stateId).toBe(project.stateIds[3]);
    expect(stored.state.category).toBe("DONE");
  });

  it("respeta el limite WIP de la columna destino", async () => {
    await db.boardColumn.update({
      where: { id: project.columnIds[1] },
      data: { wipLimit: 2 },
    });

    for (let i = 0; i < 2; i += 1) {
      const issue = await create(`en curso ${i}`);
      await issues.moveIssue(db, actorOf(owner), {
        issueId: issue.id,
        toColumnId: project.columnIds[1],
      });
    }

    const extra = await create("uno de mas");
    await expect(
      issues.moveIssue(db, actorOf(owner), {
        issueId: extra.id,
        toColumnId: project.columnIds[1],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deja reordenar dentro de una columna que ya esta en su limite WIP", async () => {
    await db.boardColumn.update({ where: { id: project.columnIds[0] }, data: { wipLimit: 2 } });
    const a = await create("a");
    const b = await create("b");

    // Mover dentro de la MISMA columna no aumenta la ocupacion.
    await expect(
      issues.moveIssue(db, actorOf(owner), {
        issueId: b.id,
        toColumnId: project.columnIds[0],
        beforeId: a.id,
      }),
    ).resolves.toBeDefined();
  });

  it("mueve al backlog con columna nula", async () => {
    const issue = await create("al backlog");
    await issues.moveIssue(db, actorOf(owner), { issueId: issue.id, toColumnId: null });

    const stored = await db.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { columnId: true },
    });
    expect(stored.columnId).toBeNull();
  });
});

describe("jerarquia padre-hijo", () => {
  const createTyped = (title: string, type: "EPIC" | "STORY" | "TASK" | "BUG") =>
    issues.createIssue(db, actorOf(owner), {
      projectId: project.id,
      title,
      type,
      priority: "MEDIUM",
      columnId: project.columnIds[0],
    });

  it("acepta EPIC como padre de STORY", async () => {
    const epic = await createTyped("epica", "EPIC");
    const story = await issues.createIssue(db, actorOf(owner), {
      projectId: project.id,
      title: "historia",
      type: "STORY",
      priority: "MEDIUM",
      parentId: epic.id,
    });
    const stored = await db.issue.findUniqueOrThrow({
      where: { id: story.id },
      select: { parentId: true },
    });
    expect(stored.parentId).toBe(epic.id);
  });

  it("rechaza un padre de tipo inferior o igual", async () => {
    const bug = await createTyped("un bug", "BUG");
    await expect(
      issues.createIssue(db, actorOf(owner), {
        projectId: project.id,
        title: "epica bajo un bug",
        type: "EPIC",
        priority: "MEDIUM",
        parentId: bug.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rechaza que un issue sea su propio padre", async () => {
    const issue = await createTyped("autorreferencia", "TASK");
    await expect(
      issues.updateIssue(db, actorOf(owner), {
        issueId: issue.id,
        version: 0,
        parentId: issue.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rechaza una jerarquia de mas de tres niveles", async () => {
    const epic = await createTyped("nivel 1", "EPIC");
    const story = await issues.createIssue(db, actorOf(owner), {
      projectId: project.id,
      title: "nivel 2",
      type: "STORY",
      priority: "MEDIUM",
      parentId: epic.id,
    });
    const task = await issues.createIssue(db, actorOf(owner), {
      projectId: project.id,
      title: "nivel 3",
      type: "TASK",
      priority: "MEDIUM",
      parentId: story.id,
    });

    // Un cuarto nivel colgando de la tarea no cabe.
    await expect(
      issues.createIssue(db, actorOf(owner), {
        projectId: project.id,
        title: "nivel 4",
        type: "BUG",
        priority: "MEDIUM",
        parentId: task.id,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("la restriccion CHECK impide la autorreferencia incluso por SQL directo", async () => {
    const issue = await createTyped("respaldo", "TASK");
    await expect(
      db.$executeRawUnsafe(`UPDATE "Issue" SET "parentId" = id WHERE id = '${issue.id}'`),
    ).rejects.toThrow();
  });
});

describe("tablero, filtros y auditoria", () => {
  it("getBoard devuelve las columnas en orden con sus issues ordenados", async () => {
    await create("primera", 0);
    await create("en curso", 1);

    const board = await projects.getBoard(db, actorOf(owner), project.orgId, project.key);
    expect(board.columns.map((c) => c.name)).toEqual([
      "Por hacer",
      "En curso",
      "En revision",
      "Hecho",
    ]);
    expect(board.columns[0].issues).toHaveLength(1);
    expect(board.columns[1].issues).toHaveLength(1);
    expect(board.role).toBe("ADMIN");
  });

  it("el listado filtra por texto y por numero", async () => {
    await create("arreglar el login");
    await create("rehacer el tablero");

    const byText = await issues.listIssues(db, actorOf(owner), {
      projectId: project.id,
      text: "login",
      includeArchived: false,
      orderBy: "number",
      direction: "asc",
      limit: 50,
    });
    expect(byText.items.map((i) => i.title)).toEqual(["arreglar el login"]);

    const byNumber = await issues.listIssues(db, actorOf(owner), {
      projectId: project.id,
      text: "TF-2",
      includeArchived: false,
      orderBy: "number",
      direction: "asc",
      limit: 50,
    });
    expect(byNumber.items.map((i) => i.number)).toContain(2);
  });

  it("excluye los archivados salvo que se pidan", async () => {
    const issue = await create("a archivar");
    await issues.archiveIssue(db, actorOf(owner), issue.id);

    const base = { projectId: project.id, orderBy: "number" as const, direction: "asc" as const, limit: 50 };
    const activos = await issues.listIssues(db, actorOf(owner), { ...base, includeArchived: false });
    const todos = await issues.listIssues(db, actorOf(owner), { ...base, includeArchived: true });

    expect(activos.items).toHaveLength(0);
    expect(todos.items).toHaveLength(1);
  });

  it("registra auditoria y evento de tablero en la misma transaccion que la mutacion", async () => {
    const issue = await create("con rastro");

    const auditRows = await db.auditLog.findMany({
      where: { entityId: issue.id },
      select: { action: true, actorEmail: true, entityLabel: true },
    });
    expect(auditRows).toEqual([
      { action: "issue.created", actorEmail: owner.email, entityLabel: "TF-1" },
    ]);

    const events = await db.projectEvent.findMany({
      where: { entityId: issue.id },
      select: { type: true, projectId: true },
    });
    expect(events).toEqual([{ type: "issue.created", projectId: project.id }]);
  });

  it("no deja rastro de auditoria cuando la mutacion falla", async () => {
    // El limite WIP hace fallar el movimiento; la auditoria debe irse con el
    // rollback, no quedar como un movimiento que nunca ocurrio.
    await db.boardColumn.update({ where: { id: project.columnIds[1] }, data: { wipLimit: 1 } });
    const ocupante = await create("ocupante");
    await issues.moveIssue(db, actorOf(owner), {
      issueId: ocupante.id,
      toColumnId: project.columnIds[1],
    });

    const rechazado = await create("rechazado");
    await expect(
      issues.moveIssue(db, actorOf(owner), {
        issueId: rechazado.id,
        toColumnId: project.columnIds[1],
      }),
    ).rejects.toBeInstanceOf(AppError);

    const moved = await db.auditLog.count({
      where: { entityId: rechazado.id, action: "issue.moved" },
    });
    expect(moved).toBe(0);
  });
});

describe("concurrencia en la posicion", () => {
  it("doce creaciones simultaneas no comparten posicion", async () => {
    // Con el calculo de la posicion FUERA de la transaccion, las doce leian
    // "columna vacia" y las doce escribian la misma clave "a0". Despues,
    // arrastrar entre dos de ellas llamaba a keyBetween(p, p), que lanza, y
    // ese hueco quedaba con un 500 permanente.
    await Promise.all(Array.from({ length: 12 }, (_, i) => create(`simultanea ${i}`)));

    const rows = await db.issue.findMany({
      where: { projectId: project.id, columnId: project.columnIds[0] },
      select: { position: true },
    });

    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((row) => row.position)).size).toBe(12);
  });

  it("se puede arrastrar entre dos tarjetas creadas a la vez", async () => {
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) => create(`lote ${i}`)),
    );
    const ordered = await db.issue.findMany({
      where: { projectId: project.id, columnId: project.columnIds[0] },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    const movido = created[created.length - 1];
    await expect(
      issues.moveIssue(db, actorOf(owner), {
        issueId: movido.id,
        toColumnId: project.columnIds[0],
        afterId: ordered[0].id,
        beforeId: ordered[1].id,
      }),
    ).resolves.toBeDefined();
  });
});

describe("mover sin vecinos", () => {
  it("anade al final de la columna, no encima de la primera tarjeta", async () => {
    // Sin afterId ni beforeId, keyBetween(null, null) devuelve siempre la
    // primera clave: en una columna con tarjetas eso repite posicion y solo
    // el desempate por id evita un orden indeterminado.
    const a = await create("existente a", 0);
    const b = await create("existente b", 0);
    const suelta = await create("llega sin vecinos", 3);

    await issues.moveIssue(db, actorOf(owner), {
      issueId: suelta.id,
      toColumnId: project.columnIds[0],
    });

    const rows = await db.issue.findMany({
      where: { columnId: project.columnIds[0] },
      select: { id: true, position: true },
    });

    expect(new Set(rows.map((row) => row.position)).size).toBe(3);
    expect(rows.sort(compareByPosition).map((row) => row.id)).toEqual([a.id, b.id, suelta.id]);
  });

  it("en una columna vacia sigue funcionando", async () => {
    const issue = await create("a una columna vacia", 0);
    await expect(
      issues.moveIssue(db, actorOf(owner), {
        issueId: issue.id,
        toColumnId: project.columnIds[2],
      }),
    ).resolves.toMatchObject({ columnId: project.columnIds[2] });
  });
});

describe("conteos del tablero", () => {
  it("cuenta solo los comentarios vivos de cada issue", async () => {
    // El \`_count\` anidado de Prisma agregaba la tabla Comment entera, de todas
    // las organizaciones, en cada carga del tablero. Ahora es un groupBy
    // acotado a los issues del tablero: el resultado tiene que ser el mismo.
    const conComentarios = await create("con comentarios");
    const sinComentarios = await create("sin comentarios");

    const uno = await comments.createComment(db, actorOf(owner), {
      issueId: conComentarios.id,
      body: "primero",
    });
    await comments.createComment(db, actorOf(owner), {
      issueId: conComentarios.id,
      body: "segundo",
    });
    await comments.deleteComment(db, actorOf(owner), uno.id);

    const board = await projects.getBoard(db, actorOf(owner), project.orgId, project.key);
    const todos = board.columns.flatMap((column) => column.issues);

    expect(todos.find((i) => i.id === conComentarios.id)?._count.comments).toBe(1);
    expect(todos.find((i) => i.id === sinComentarios.id)?._count.comments).toBe(0);
  });

  it("no cuenta comentarios de otros proyectos", async () => {
    const otro = await makeProject({ orgId: project.orgId, key: "OTR" });
    const ajeno = await makeIssue({ project: otro, reporter: owner });
    await comments.createComment(db, actorOf(owner), { issueId: ajeno.id, body: "de otro" });

    const mio = await create("el mio");
    const board = await projects.getBoard(db, actorOf(owner), project.orgId, project.key);
    const encontrado = board.columns.flatMap((c) => c.issues).find((i) => i.id === mio.id);

    expect(encontrado?._count.comments).toBe(0);
  });

  it("listProjects cuenta los issues activos de cada proyecto", async () => {
    await create("activo 1");
    const archivado = await create("se archiva");
    await issues.archiveIssue(db, actorOf(owner), archivado.id);

    const otro = await makeProject({ orgId: project.orgId, key: "VAC" });

    const lista = await projects.listProjects(db, actorOf(owner), project.orgId);
    expect(lista.find((p) => p.id === project.id)?._count.issues).toBe(1);
    expect(lista.find((p) => p.id === otro.id)?._count.issues).toBe(0);
  });
});

describe("retencion y limites", () => {
  it("borra los eventos mas viejos que la ventana y conserva los recientes", async () => {
    const reciente = await create("evento reciente");

    // Se envejece el evento de creacion por debajo de la ventana.
    await db.projectEvent.updateMany({
      where: { entityId: reciente.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const otro = await create("evento de hoy");

    const { deleted } = await pruneProjectEvents();

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await db.projectEvent.count({ where: { entityId: reciente.id } })).toBe(0);
    expect(await db.projectEvent.count({ where: { entityId: otro.id } })).toBe(1);
  });

  it("borra las sesiones caducadas y deja las vivas", async () => {
    const viva = await db.session.create({
      data: {
        tokenHash: "hash-vivo",
        userId: owner.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    await db.session.create({
      data: {
        tokenHash: "hash-caducado",
        userId: owner.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await pruneExpiredSessions()).toBe(1);
    expect(await db.session.count({ where: { id: viva.id } })).toBe(1);
  });

  it("acota los comentarios que trae el detalle de un issue", async () => {
    const issue = await create("hilo largo");
    // El limite es 200; se comprueba que el `take` esta puesto sin escribir
    // 201 comentarios en cada ejecucion.
    await comments.createComment(db, actorOf(owner), { issueId: issue.id, body: "uno" });

    const { issue: detalle } = await issues.getIssueDetail(
      db,
      actorOf(owner),
      project.orgId,
      project.key,
      issue.number,
    );
    expect(detalle.comments.length).toBeLessThanOrEqual(200);
    expect(detalle.comments).toHaveLength(1);
  });

  it("rechaza un cursor de otro proyecto", async () => {
    const otro = await makeProject({ orgId: project.orgId, key: "CUR" });
    const ajeno = await makeIssue({ project: otro, reporter: owner });

    await expect(
      issues.listIssues(db, actorOf(owner), {
        projectId: project.id,
        cursor: ajeno.id,
        includeArchived: false,
        orderBy: "updatedAt",
        direction: "desc",
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
