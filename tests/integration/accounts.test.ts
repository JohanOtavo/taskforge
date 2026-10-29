import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetRateLimits } from "@/server/rate-limit";
import * as auth from "@/server/modules/auth/service";
import * as orgs from "@/server/modules/orgs/service";

import { actorOf, makeOrg, makeProject, makeUser, type TestUser } from "../factories";

beforeEach(() => {
  // El limitador vive en memoria del proceso; sin esto un test agota la cuota
  // del siguiente.
  resetRateLimits();
});

describe("registro", () => {
  const input = {
    name: "Ana Rivas",
    email: "ana@taskforge.local",
    password: "una-frase-larga-y-unica",
    orgName: "Acme Corp",
  };

  it("crea usuario, organizacion y pertenencia OWNER a la vez", async () => {
    const result = await auth.register(db, input, { ip: "203.0.113.1" });

    expect(result.orgId).not.toBeNull();
    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: result.userId, orgId: result.orgId! } },
      select: { role: true },
    });
    expect(membership.role).toBe("OWNER");
    expect(result.orgSlug).toBe("acme-corp");
  });

  it("deja registrarse SIN organizacion, como en Trello", async () => {
    // Quien llega por una invitacion no debe tener que inventarse un
    // espacio de trabajo para poder aceptarla.
    const result = await auth.register(
      db,
      { name: input.name, email: input.email, password: input.password },
      { ip: "203.0.113.9" },
    );

    expect(result.orgId).toBeNull();
    expect(result.orgSlug).toBeNull();
    expect(await db.organization.count()).toBe(0);
    expect(await db.user.count({ where: { id: result.userId } })).toBe(1);
  });

  it("no guarda la contrasena en claro", async () => {
    const result = await auth.register(db, input, { ip: "203.0.113.2" });
    const user = await db.user.findUniqueOrThrow({
      where: { id: result.userId },
      select: { passwordHash: true },
    });
    expect(user.passwordHash).not.toContain(input.password);
    expect(user.passwordHash?.startsWith("scrypt$")).toBe(true);
  });

  it("rechaza un correo ya registrado", async () => {
    await auth.register(db, input, { ip: "203.0.113.3" });
    await expect(auth.register(db, input, { ip: "203.0.113.3" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("trata las variantes de mayusculas como la misma cuenta", async () => {
    await auth.register(db, input, { ip: "203.0.113.4" });
    await expect(
      auth.register(db, { ...input, email: "ANA@TaskForge.local" }, { ip: "203.0.113.4" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("evita que un slug reservado colisione con una ruta de la app", async () => {
    const result = await auth.register(
      db,
      { ...input, email: "otra@taskforge.local", orgName: "Settings" },
      { ip: "203.0.113.5" },
    );
    expect(result.orgSlug).toBe("settings-org");
  });
});

describe("inicio de sesion", () => {
  const input = {
    name: "Luis Prado",
    email: "luis@taskforge.local",
    password: "otra-frase-larga-distinta",
    orgName: "Beta",
  };

  it("acepta credenciales correctas", async () => {
    const registered = await auth.register(db, input, { ip: "198.51.100.1" });
    const result = await auth.login(
      db,
      { email: input.email, password: input.password },
      { ip: "198.51.100.1" },
    );
    expect(result.userId).toBe(registered.userId);
  });

  it("da el mismo mensaje para usuario inexistente y contrasena incorrecta", async () => {
    await auth.register(db, input, { ip: "198.51.100.2" });

    const wrongPassword = auth
      .login(db, { email: input.email, password: "incorrecta-pero-larga" }, { ip: "198.51.100.2" })
      .catch((error: Error) => error.message);
    const noSuchUser = auth
      .login(db, { email: "nadie@taskforge.local", password: "incorrecta-pero-larga" }, { ip: "198.51.100.2" })
      .catch((error: Error) => error.message);

    // Distinguirlos convertiria el login en un oraculo de cuentas existentes.
    expect(await wrongPassword).toBe(await noSuchUser);
  });

  it("limita los intentos por correo", async () => {
    await auth.register(db, input, { ip: "198.51.100.3" });

    const attempt = (ip: string) =>
      auth.login(db, { email: input.email, password: "incorrecta-pero-larga" }, { ip });

    // Nueve intentos fallidos desde IPs distintas: el limite por correo salta
    // igualmente, asi que rociar desde varias IPs no sirve.
    const codes: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      codes.push(await attempt(`198.51.100.${100 + i}`).catch((e) => e.code));
    }
    expect(codes).toContain("RATE_LIMITED");
  });
});
describe("invitar por correo, estilo Trello", () => {
  let owner: TestUser;
  let org: { id: string };

  beforeEach(async () => {
    owner = await makeUser({ email: "owner@taskforge.local" });
    org = await makeOrg([{ user: owner, role: "OWNER" }]);
  });

  const invite = (email: string, extra: Record<string, unknown> = {}) =>
    orgs.inviteMember(db, actorOf(owner), {
      orgId: org.id,
      email,
      role: "MEMBER",
      ...extra,
    });

  it("si la persona YA tiene cuenta, entra en el acto sin enlace", async () => {
    const existente = await makeUser({ email: "existente@taskforge.local" });

    const outcome = await invite(existente.email);

    expect(outcome.kind).toBe("added");
    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: existente.id, orgId: org.id } },
      select: { role: true },
    });
    expect(membership.role).toBe("MEMBER");
    // No se crea invitacion pendiente: no hay nada que caducar ni revocar.
    expect(await db.invitation.count()).toBe(0);
  });

  it("si NO tiene cuenta, genera un enlace de un solo uso", async () => {
    const outcome = await invite("nueva@taskforge.local");

    expect(outcome.kind).toBe("invited");
    if (outcome.kind !== "invited") throw new Error("inesperado");

    const stored = await db.invitation.findUniqueOrThrow({
      where: { id: outcome.invitationId },
      select: { tokenHash: true, email: true },
    });
    // La base de datos guarda el hash, nunca el token.
    expect(stored.tokenHash).not.toBe(outcome.token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.email).toBe("nueva@taskforge.local");
  });

  it("no deja invitar dos veces a quien ya pertenece", async () => {
    const existente = await makeUser({ email: "repetida@taskforge.local" });
    await invite(existente.email);

    await expect(invite(existente.email)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("invita a un tablero: al aceptar entra en la organizacion y en el tablero", async () => {
    const project = await makeProject({ orgId: org.id, key: "TRL" });
    const outcome = await invite("tablero@taskforge.local", {
      projectId: project.id,
      projectRole: "ADMIN",
    });
    if (outcome.kind !== "invited") throw new Error("inesperado");

    const invitada = await makeUser({ email: "tablero@taskforge.local" });
    const accepted = await orgs.acceptInvite(db, actorOf(invitada), { token: outcome.token });

    expect(accepted.projectKey).toBe("TRL");
    const projectMember = await db.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: project.id, userId: invitada.id } },
      select: { role: true },
    });
    expect(projectMember.role).toBe("ADMIN");
  });

  it("a quien ya tiene cuenta se le anade al tablero en el acto", async () => {
    const project = await makeProject({ orgId: org.id, key: "TRM" });
    const existente = await makeUser({ email: "ya-esta@taskforge.local" });

    const outcome = await invite(existente.email, {
      projectId: project.id,
      projectRole: "VIEWER",
    });

    expect(outcome.kind).toBe("added");
    const projectMember = await db.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: project.id, userId: existente.id } },
      select: { role: true },
    });
    expect(projectMember.role).toBe("VIEWER");
  });

  it("anadir a un tablero no cambia el rol que ya tenia en la organizacion", async () => {
    const project = await makeProject({ orgId: org.id, key: "TRN" });
    const admin = await makeUser({ email: "admin-org@taskforge.local" });
    await db.membership.create({ data: { orgId: org.id, userId: admin.id, role: "ADMIN" } });

    await invite(admin.email, { projectId: project.id, projectRole: "VIEWER" });

    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: admin.id, orgId: org.id } },
      select: { role: true },
    });
    expect(membership.role).toBe("ADMIN");
  });
});

describe("aceptar invitaciones", () => {
  let owner: TestUser;
  let org: { id: string };
  const EMAIL = "invitada@taskforge.local";

  beforeEach(async () => {
    owner = await makeUser({ email: "owner@taskforge.local" });
    org = await makeOrg([{ user: owner, role: "OWNER" }]);
  });

  async function pendingInvite(email = EMAIL, role: "ADMIN" | "MEMBER" | "VIEWER" = "MEMBER") {
    const outcome = await orgs.inviteMember(db, actorOf(owner), { orgId: org.id, email, role });
    if (outcome.kind !== "invited") throw new Error("se esperaba una invitacion pendiente");
    return outcome;
  }

  it("crea la pertenencia al aceptar", async () => {
    const { token } = await pendingInvite();
    const invitada = await makeUser({ email: EMAIL });

    await orgs.acceptInvite(db, actorOf(invitada), { token });

    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: invitada.id, orgId: org.id } },
      select: { role: true },
    });
    expect(membership.role).toBe("MEMBER");
  });

  it("no deja aceptar una invitacion dirigida a otro correo", async () => {
    const { token } = await pendingInvite();
    const intruso = await makeUser({ email: "intruso@taskforge.local" });

    // Con el enlace en la mano, entrar con otra identidad seria escalada.
    await expect(orgs.acceptInvite(db, actorOf(intruso), { token })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("es de un solo uso", async () => {
    const { token } = await pendingInvite();
    const invitada = await makeUser({ email: EMAIL });

    await orgs.acceptInvite(db, actorOf(invitada), { token });
    await expect(orgs.acceptInvite(db, actorOf(invitada), { token })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("revoca la invitacion pendiente anterior al emitir una nueva", async () => {
    const first = await pendingInvite(EMAIL, "VIEWER");
    await pendingInvite(EMAIL, "ADMIN");
    const invitada = await makeUser({ email: EMAIL });

    // El token antiguo deja de valer: un solo camino de entrada vivo.
    await expect(
      orgs.acceptInvite(db, actorOf(invitada), { token: first.token }),
    ).rejects.toBeDefined();
  });

  it("rechaza una invitacion caducada", async () => {
    const { token, invitationId } = await pendingInvite();
    const invitada = await makeUser({ email: EMAIL });
    // Se envejece la invitacion ENTERA, no solo su caducidad: el CHECK
    // Invitation_expires_after_created impide que una invitacion caduque
    // antes de existir, y una invitacion real caduca por ser vieja.
    const creada = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await db.invitation.update({
      where: { id: invitationId },
      data: {
        createdAt: creada,
        expiresAt: new Date(creada.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(orgs.acceptInvite(db, actorOf(invitada), { token })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rechaza un token inventado", async () => {
    const invitada = await makeUser({ email: EMAIL });
    await expect(
      orgs.acceptInvite(db, actorOf(invitada), { token: "token-que-no-existe-xxxxx" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deja de valer si a quien invito le han quitado el permiso de invitar", async () => {
    const admin = await makeUser({ email: "admin-saliente@taskforge.local" });
    await db.membership.create({ data: { orgId: org.id, userId: admin.id, role: "ADMIN" } });

    const outcome = await orgs.inviteMember(db, actorOf(admin), {
      orgId: org.id,
      email: EMAIL,
      role: "ADMIN",
    });
    if (outcome.kind !== "invited") throw new Error("inesperado");

    // Expulsan al administrador. Su enlace no debe seguir siendo una puerta
    // abierta durante siete dias.
    await orgs.removeMember(db, actorOf(owner), { orgId: org.id, userId: admin.id });

    const invitada = await makeUser({ email: EMAIL });
    await expect(
      orgs.acceptInvite(db, actorOf(invitada), { token: outcome.token }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("invariante de propiedad", () => {
  it("no deja degradar al ultimo propietario", async () => {
    const owner = await makeUser({ email: "solo-owner@taskforge.local" });
    const org = await makeOrg([{ user: owner, role: "OWNER" }]);

    await expect(
      orgs.updateMemberRole(db, actorOf(owner), {
        orgId: org.id,
        userId: owner.id,
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("no deja expulsar al ultimo propietario", async () => {
    const owner = await makeUser({ email: "ultimo@taskforge.local" });
    const org = await makeOrg([{ user: owner, role: "OWNER" }]);

    await expect(
      orgs.removeMember(db, actorOf(owner), { orgId: org.id, userId: owner.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deja degradar a un propietario si queda otro", async () => {
    const a = await makeUser({ email: "owner-a@taskforge.local" });
    const b = await makeUser({ email: "owner-b@taskforge.local" });
    const org = await makeOrg([
      { user: a, role: "OWNER" },
      { user: b, role: "OWNER" },
    ]);

    await orgs.updateMemberRole(db, actorOf(a), { orgId: org.id, userId: b.id, role: "ADMIN" });
    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: b.id, orgId: org.id } },
      select: { role: true },
    });
    expect(membership.role).toBe("ADMIN");
  });

  it("un ADMIN no puede nombrar propietarios", async () => {
    const owner = await makeUser({ email: "dueno@taskforge.local" });
    const admin = await makeUser({ email: "admin@taskforge.local" });
    const org = await makeOrg([
      { user: owner, role: "OWNER" },
      { user: admin, role: "ADMIN" },
    ]);

    // Si pudiera, se promocionaria a si mismo en dos pasos.
    await expect(
      orgs.updateMemberRole(db, actorOf(admin), {
        orgId: org.id,
        userId: admin.id,
        role: "OWNER",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("al expulsar a alguien se retira tambien de los proyectos de la organizacion", async () => {
    const owner = await makeUser({ email: "jefe@taskforge.local" });
    const member = await makeUser({ email: "equipo@taskforge.local" });
    const org = await makeOrg([
      { user: owner, role: "OWNER" },
      { user: member, role: "MEMBER" },
    ]);
    const project = await makeProject({
      orgId: org.id,
      key: "RM",
      members: [{ user: member, role: "ADMIN" }],
    });

    await orgs.removeMember(db, actorOf(owner), { orgId: org.id, userId: member.id });

    expect(
      await db.projectMember.count({ where: { projectId: project.id, userId: member.id } }),
    ).toBe(0);
  });
});

describe("carrera del ultimo propietario", () => {
  it("dos propietarios degradandose a la vez no dejan la organizacion sin ninguno", async () => {
    // Comprobarlo fuera de la transaccion era una carrera: ambos leian
    // "quedan 2", ambos pasaban, y sin OWNER la organizacion es
    // irrecuperable desde la interfaz (solo un OWNER puede nombrar otro).
    const a = await makeUser({ email: "owner-a@taskforge.local" });
    const b = await makeUser({ email: "owner-b@taskforge.local" });
    const org = await makeOrg([
      { user: a, role: "OWNER" },
      { user: b, role: "OWNER" },
    ]);

    const resultados = await Promise.allSettled([
      orgs.updateMemberRole(db, actorOf(a), { orgId: org.id, userId: b.id, role: "MEMBER" }),
      orgs.updateMemberRole(db, actorOf(b), { orgId: org.id, userId: a.id, role: "MEMBER" }),
    ]);

    const owners = await db.membership.count({ where: { orgId: org.id, role: "OWNER" } });
    expect(owners).toBeGreaterThanOrEqual(1);
    // Al menos una de las dos tiene que haber prosperado.
    expect(resultados.some((r) => r.status === "fulfilled")).toBe(true);
  });

  it("expulsiones simultaneas tampoco dejan la organizacion sin propietario", async () => {
    const a = await makeUser({ email: "dueno-a@taskforge.local" });
    const b = await makeUser({ email: "dueno-b@taskforge.local" });
    const org = await makeOrg([
      { user: a, role: "OWNER" },
      { user: b, role: "OWNER" },
    ]);

    await Promise.allSettled([
      orgs.removeMember(db, actorOf(a), { orgId: org.id, userId: b.id }),
      orgs.removeMember(db, actorOf(b), { orgId: org.id, userId: a.id }),
    ]);

    expect(await db.membership.count({ where: { orgId: org.id, role: "OWNER" } })).toBeGreaterThanOrEqual(1);
  });
});
