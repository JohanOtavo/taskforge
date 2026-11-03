import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetRateLimits } from "@/server/rate-limit";
import * as issues from "@/server/modules/issues/service";
import * as phases from "@/server/modules/phases/service";
import { getBoard } from "@/server/modules/projects/service";

import { actorOf, makeOrg, makeProject, makeUser } from "../factories";

beforeEach(() => {
  resetRateLimits();
});

async function setup() {
  const owner = await makeUser({ name: "Olga" });
  const member = await makeUser({ name: "Mario" });
  const org = await makeOrg([
    { user: owner, role: "OWNER" },
    { user: member, role: "MEMBER" },
  ]);
  const project = await makeProject({ orgId: org.id });
  return { owner, member, org, project };
}

function card(projectId: string, title: string, phaseId?: string) {
  return {
    projectId,
    title,
    type: "TASK" as const,
    priority: "MEDIUM" as const,
    labelIds: [],
    ...(phaseId ? { phaseId } : {}),
  };
}

const titlesOf = (board: Awaited<ReturnType<typeof getBoard>>) =>
  board.columns.flatMap((column) => column.issues.map((issue) => issue.title)).sort();

describe("fases", () => {
  it("el tablero filtrado por fase muestra solo sus tarjetas", async () => {
    const { owner, org, project } = await setup();
    const design = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Diseño" });
    const build = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Desarrollo" });
    const [column] = project.columnIds;
    for (const [title, phaseId] of [
      ["Bocetos", design.id],
      ["API", build.id],
      ["Suelta", undefined],
    ] as const) {
      await issues.createIssue(db, actorOf(owner), { ...card(project.id, title, phaseId), columnId: column });
    }

    const all = await getBoard(db, actorOf(owner), org.id, project.key);
    const onlyDesign = await getBoard(db, actorOf(owner), org.id, project.key, { phaseId: design.id });
    const unphased = await getBoard(db, actorOf(owner), org.id, project.key, { phaseId: null });

    expect(titlesOf(all)).toEqual(["API", "Bocetos", "Suelta"]);
    expect(titlesOf(onlyDesign)).toEqual(["Bocetos"]);
    expect(titlesOf(unphased)).toEqual(["Suelta"]);
  });

  it("lista las fases en orden con sus contadores", async () => {
    const { owner, project } = await setup();
    const first = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Uno" });
    await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Dos" });
    await issues.createIssue(db, actorOf(owner), card(project.id, "En uno", first.id));
    await issues.createIssue(db, actorOf(owner), card(project.id, "Sin fase"));

    const list = await phases.listPhases(db, actorOf(owner), project.id);

    expect(list.phases.map((phase) => [phase.name, phase.issueCount])).toEqual([
      ["Uno", 1],
      ["Dos", 0],
    ]);
    expect(list.unphasedCount).toBe(1);
    expect(list.totalCount).toBe(2);
  });

  it("reordena intercambiando con la vecina", async () => {
    const { owner, project } = await setup();
    await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Uno" });
    const second = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Dos" });

    await phases.movePhase(db, actorOf(owner), { phaseId: second.id, direction: "up" });

    const list = await phases.listPhases(db, actorOf(owner), project.id);
    expect(list.phases.map((phase) => phase.name)).toEqual(["Dos", "Uno"]);
  });

  it("borrar una fase deja sus tarjetas sin fase, no las borra", async () => {
    const { owner, project } = await setup();
    const phase = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Temporal" });
    const issue = await issues.createIssue(db, actorOf(owner), card(project.id, "Sobrevive", phase.id));

    await phases.deletePhase(db, actorOf(owner), { phaseId: phase.id });

    const row = await db.issue.findUniqueOrThrow({ where: { id: issue.id }, select: { phaseId: true } });
    expect(row.phaseId).toBeNull();
  });

  it("no deja dos fases con el mismo nombre en un tablero", async () => {
    const { owner, project } = await setup();
    await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "QA" });

    await expect(
      phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "qa" }),
    ).rejects.toThrow("Ya hay una fase con ese nombre en este tablero.");
  });

  it("un miembro asigna fases a tarjetas pero no gestiona fases", async () => {
    const { owner, member, project } = await setup();
    const phase = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Uno" });

    const issue = await issues.createIssue(db, actorOf(member), card(project.id, "Mia", phase.id));
    expect(
      (await db.issue.findUniqueOrThrow({ where: { id: issue.id }, select: { phaseId: true } })).phaseId,
    ).toBe(phase.id);
    await expect(
      phases.createPhase(db, actorOf(member), { projectId: project.id, name: "Otra" }),
    ).rejects.toThrow();
  });

  it("no acepta una fase de otro tablero", async () => {
    const { owner, org, project } = await setup();
    const other = await makeProject({ orgId: org.id });
    const foreign = await phases.createPhase(db, actorOf(owner), { projectId: other.id, name: "Ajena" });

    await expect(
      issues.createIssue(db, actorOf(owner), card(project.id, "Cruzada", foreign.id)),
    ).rejects.toThrow("La fase no existe");
  });

  it("cambiar la fase al editar la tarjeta", async () => {
    const { owner, project } = await setup();
    const phase = await phases.createPhase(db, actorOf(owner), { projectId: project.id, name: "Uno" });
    const issue = await issues.createIssue(db, actorOf(owner), card(project.id, "Mover"));

    await issues.updateIssue(db, actorOf(owner), { issueId: issue.id, version: 0, phaseId: phase.id });

    const row = await db.issue.findUniqueOrThrow({ where: { id: issue.id }, select: { phaseId: true } });
    expect(row.phaseId).toBe(phase.id);
  });
});
