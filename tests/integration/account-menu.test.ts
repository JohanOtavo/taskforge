import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetRateLimits } from "@/server/rate-limit";
import * as account from "@/server/modules/account/service";
import * as auth from "@/server/modules/auth/service";
import * as comments from "@/server/modules/comments/service";
import * as issues from "@/server/modules/issues/service";
import * as notifications from "@/server/modules/notifications/service";
import * as orgs from "@/server/modules/orgs/service";
import { hashPassword } from "@/server/password";

import { actorOf, makeOrg, makeProject, makeUser, type TestUser } from "../factories";

beforeEach(() => {
  resetRateLimits();
});

async function team() {
  const owner = await makeUser({ name: "Olga Duena" });
  const member = await makeUser({ name: "Mario Miembro" });
  const org = await makeOrg([
    { user: owner, role: "OWNER" },
    { user: member, role: "MEMBER" },
  ]);
  const project = await makeProject({ orgId: org.id });
  return { owner, member, org, project };
}

const inbox = (user: TestUser) => notifications.listNotifications(db, { id: user.id });

function newIssue(projectId: string, title: string, assigneeId?: string) {
  return {
    projectId,
    title,
    type: "TASK" as const,
    priority: "MEDIUM" as const,
    labelIds: [],
    ...(assigneeId ? { assigneeId } : {}),
  };
}

describe("notificaciones", () => {
  it("avisa a quien le asignan una tarjeta al crearla, con enlace a la tarjeta", async () => {
    const { owner, member, project } = await team();

    const issue = await issues.createIssue(
      db,
      actorOf(owner),
      newIssue(project.id, "Arreglar login", member.id),
    );

    const { items, unread } = await inbox(member);
    expect(unread).toBe(1);
    expect(items[0]?.message).toBe(`Olga Duena te asignó ${issue.key}: Arreglar login`);
    expect(items[0]?.path).toBe(`/p/${project.key}/${issue.number}`);
  });

  it("no avisa a quien se asigna a si mismo", async () => {
    const { owner, project } = await team();

    await issues.createIssue(db, actorOf(owner), newIssue(project.id, "Mia", owner.id));

    expect((await inbox(owner)).unread).toBe(0);
  });

  it("avisa al reasignar, pero no al editar otro campo", async () => {
    const { owner, member, project } = await team();
    const issue = await issues.createIssue(db, actorOf(owner), newIssue(project.id, "Sin asignar"));

    const { version } = await issues.updateIssue(db, actorOf(owner), {
      issueId: issue.id,
      version: 0,
      assigneeId: member.id,
    });
    expect((await inbox(member)).unread).toBe(1);

    await issues.updateIssue(db, actorOf(owner), {
      issueId: issue.id,
      version,
      title: "Otro titulo",
    });
    expect((await inbox(member)).unread).toBe(1);
  });

  it("avisa de un comentario a quien la reporto y a su responsable, nunca al autor", async () => {
    const { owner, member, org, project } = await team();
    const third = await makeUser({ name: "Tere" });
    await db.membership.create({ data: { orgId: org.id, userId: third.id, role: "MEMBER" } });
    const issue = await issues.createIssue(
      db,
      actorOf(owner),
      newIssue(project.id, "Hilo", member.id),
    );
    await notifications.markAllNotificationsRead(db, { id: member.id });

    await comments.createComment(db, actorOf(third), { issueId: issue.id, body: "Una idea" });

    expect((await inbox(owner)).unread).toBe(1);
    expect((await inbox(member)).unread).toBe(1);
    expect((await inbox(third)).unread).toBe(0);
  });

  it("respeta la preferencia de no recibir avisos de comentarios", async () => {
    const { owner, member, project } = await team();
    await account.updateNotificationPrefs(db, actorOf(owner), {
      notifyAssigned: true,
      notifyComments: false,
      notifyMembership: true,
    });
    const issue = await issues.createIssue(db, actorOf(owner), newIssue(project.id, "Callada"));

    await comments.createComment(db, actorOf(member), { issueId: issue.id, body: "Hola" });

    expect((await inbox(owner)).unread).toBe(0);
  });

  it("no filtra el titulo de una tarjeta de un tablero privado a quien no lo ve", async () => {
    const { owner, member, org } = await team();
    const secret = await makeProject({
      orgId: org.id,
      visibility: "PRIVATE",
      members: [{ user: owner, role: "ADMIN" }],
    });

    await issues.createIssue(
      db,
      actorOf(owner),
      newIssue(secret.id, "Despidos de enero", member.id),
    );

    expect((await inbox(member)).items).toEqual([]);
  });

  it("deja de mostrar los avisos de un espacio del que te expulsan", async () => {
    const { owner, member, org, project } = await team();
    await issues.createIssue(db, actorOf(owner), newIssue(project.id, "Antes de irse", member.id));

    await orgs.removeMember(db, actorOf(owner), { orgId: org.id, userId: member.id });

    expect(await inbox(member)).toEqual({ items: [], unread: 0 });
  });

  it("avisa a quien anaden a un equipo por correo", async () => {
    const { owner, org } = await team();
    const newcomer = await makeUser({ name: "Nora" });

    await orgs.inviteMember(db, actorOf(owner), {
      orgId: org.id,
      email: newcomer.email,
      role: "MEMBER",
    });

    expect((await inbox(newcomer)).items[0]?.message).toContain("Olga Duena te añadió");
  });

  it("avisa a quien invito cuando aceptan su invitacion", async () => {
    const { owner, org } = await team();
    const outcome = await orgs.inviteMember(db, actorOf(owner), {
      orgId: org.id,
      email: "ines@taskforge.local",
      role: "MEMBER",
    });
    if (outcome.kind !== "invited") throw new Error("se esperaba una invitacion");
    const ines = await makeUser({ name: "Ines", email: "ines@taskforge.local" });

    await orgs.acceptInvite(db, actorOf(ines), { token: outcome.token });

    expect((await inbox(owner)).items[0]?.message).toContain("Ines aceptó tu invitación");
  });

  it("marcar como leida solo funciona con las propias", async () => {
    const { owner, member, project } = await team();
    await issues.createIssue(db, actorOf(owner), newIssue(project.id, "Ajena", member.id));
    const id = (await inbox(member)).items[0]!.id;

    await notifications.markNotificationRead(db, { id: owner.id }, id);
    expect((await inbox(member)).unread).toBe(1);

    await notifications.markNotificationRead(db, { id: member.id }, id);
    expect((await inbox(member)).unread).toBe(0);
  });
});

describe("cuenta", () => {
  it("cambia la contrasena con la actual correcta y cierra las sesiones", async () => {
    const email = "pepa@taskforge.local";
    const { userId } = await auth.register(
      db,
      { name: "Pepa", email, password: "la-frase-vieja-y-larga" },
      { ip: "203.0.113.60" },
    );
    await db.session.create({
      data: { tokenHash: "s".repeat(64), userId, expiresAt: new Date(Date.now() + 60_000) },
    });

    await account.changePassword(db, { id: userId, email }, {
      currentPassword: "la-frase-vieja-y-larga",
      newPassword: "la-frase-nueva-y-larga",
    });

    expect(await db.session.count({ where: { userId } })).toBe(0);
    const logged = await auth.login(db, { email, password: "la-frase-nueva-y-larga" });
    expect(logged.userId).toBe(userId);
  });

  it("rechaza el cambio si la contrasena actual es incorrecta", async () => {
    const user = await makeUser();
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword("la-frase-vieja-y-larga") },
    });

    await expect(
      account.changePassword(db, actorOf(user), {
        currentPassword: "otra-cosa",
        newPassword: "la-frase-nueva-y-larga",
      }),
    ).rejects.toThrow("La contraseña actual no es correcta.");
  });

  it("una cuenta de Google puede crear contrasena sin pedir la actual", async () => {
    const email = "gala@gmail.com";
    const { userId } = await auth.loginWithGoogle(db, {
      sub: "google-1",
      email,
      name: "Gala",
      picture: null,
    });

    await account.changePassword(db, { id: userId, email }, {
      newPassword: "ahora-tambien-con-frase",
    });

    const logged = await auth.login(db, { email, password: "ahora-tambien-con-frase" });
    expect(logged.userId).toBe(userId);
    expect((await account.getAccount(db, { id: userId, email })).hasPassword).toBe(true);
  });

  it("getAccount no devuelve el hash de la contrasena", async () => {
    const user = await makeUser();
    expect(await account.getAccount(db, actorOf(user))).not.toHaveProperty("passwordHash");
  });
});

describe("mis tarjetas y actividad", () => {
  it("lista lo asignado en todos los espacios, pero no lo que ya no puede ver", async () => {
    const { owner, member, org, project } = await team();
    const other = await team();
    await db.membership.create({
      data: { orgId: other.org.id, userId: member.id, role: "MEMBER" },
    });
    const secret = await makeProject({ orgId: org.id, visibility: "PRIVATE" });

    await issues.createIssue(db, actorOf(owner), newIssue(project.id, "Del primero", member.id));
    await issues.createIssue(
      db,
      actorOf(other.owner),
      newIssue(other.project.id, "Del segundo", member.id),
    );
    await issues.createIssue(db, actorOf(owner), newIssue(secret.id, "Privada", member.id));

    const titles = (await account.listMyCards(db, actorOf(member))).map((card) => card.title);
    expect(titles.sort()).toEqual(["Del primero", "Del segundo"]);
  });

  it("no lista lo terminado", async () => {
    const { owner, member, project } = await team();
    const issue = await issues.createIssue(
      db,
      actorOf(owner),
      newIssue(project.id, "Ya hecha", member.id),
    );
    const done = await db.workflowState.findFirstOrThrow({
      where: { projectId: project.id, category: "DONE" },
      select: { id: true },
    });
    await db.issue.update({ where: { id: issue.id }, data: { stateId: done.id } });

    expect(await account.listMyCards(db, actorOf(member))).toEqual([]);
  });

  it("tras una expulsion la actividad de ese espacio desaparece, la de la cuenta no", async () => {
    const { owner, member, org, project } = await team();
    await issues.createIssue(db, actorOf(member), newIssue(project.id, "Antes de irse"));
    await account.updateProfile(db, actorOf(member), { name: "Mario Nuevo" });

    await orgs.removeMember(db, actorOf(owner), { orgId: org.id, userId: member.id });

    expect((await account.listMyActivity(db, actorOf(member))).map((row) => row.action)).toEqual([
      "user.profile_updated",
    ]);
  });

  it("la actividad solo trae lo propio", async () => {
    const { owner, member, project } = await team();
    await issues.createIssue(db, actorOf(owner), newIssue(project.id, "De Olga"));

    expect((await account.listMyActivity(db, actorOf(owner))).map((row) => row.action)).toContain(
      "issue.created",
    );
    expect(await account.listMyActivity(db, actorOf(member))).toEqual([]);
  });
});
