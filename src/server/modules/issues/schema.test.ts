import { describe, expect, it } from "vitest";

import { registerSchema, loginSchema } from "../auth/schema";
import { inviteMemberSchema } from "../orgs/schema";
import { createProjectSchema } from "../projects/schema";
import { createIssueSchema, issueFilterSchema, moveIssueSchema, updateIssueSchema } from "./schema";

/// Los esquemas son el limite de confianza. Lo que mas importa aqui es
/// `.strict()`: descartar claves desconocidas es lo que impide una asignacion
/// masiva de `orgId`, `role` o `version`.

const CUID = "clz1234567890abcdefghijk";

describe("rechazo de claves desconocidas", () => {
  it("createIssueSchema no acepta orgId inyectado", () => {
    const result = createIssueSchema.safeParse({
      projectId: CUID,
      title: "titulo valido",
      orgId: "org-de-otro",
    });
    expect(result.success).toBe(false);
  });

  it("updateIssueSchema no acepta reporterId ni version falsificada por otra clave", () => {
    const result = updateIssueSchema.safeParse({
      issueId: CUID,
      version: 0,
      reporterId: CUID,
    });
    expect(result.success).toBe(false);
  });

  it("createProjectSchema no acepta issueCounter", () => {
    const result = createProjectSchema.safeParse({
      orgId: CUID,
      name: "Proyecto",
      key: "TF",
      issueCounter: 9999,
    });
    expect(result.success).toBe(false);
  });

  it("moveIssueSchema no acepta una posicion calculada por el cliente", () => {
    // El cliente manda intencion (afterId/beforeId), nunca una posicion.
    const result = moveIssueSchema.safeParse({
      issueId: CUID,
      toColumnId: CUID,
      position: "a0",
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizacion", () => {
  it("registerSchema pasa el correo a minusculas y recorta espacios", () => {
    const parsed = registerSchema.parse({
      name: "  Ana Rivas ",
      email: "  Ana@TaskForge.LOCAL ",
      password: "una-frase-larga-valida",
      orgName: " Acme ",
    });
    expect(parsed.email).toBe("ana@taskforge.local");
    expect(parsed.name).toBe("Ana Rivas");
    expect(parsed.orgName).toBe("Acme");
  });

  it("createProjectSchema pasa la clave a mayusculas", () => {
    const parsed = createProjectSchema.parse({ orgId: CUID, name: "Proyecto", key: " tf " });
    expect(parsed.key).toBe("TF");
  });

  it("loginSchema normaliza el correo igual que el registro", () => {
    const parsed = loginSchema.parse({ email: "ANA@X.COM", password: "x" });
    expect(parsed.email).toBe("ana@x.com");
  });
});

describe("limites", () => {
  it("exige al menos 12 caracteres de contrasena", () => {
    const short = registerSchema.safeParse({
      name: "Ana",
      email: "ana@x.com",
      password: "corta123",
      orgName: "Acme",
    });
    expect(short.success).toBe(false);
  });

  it("limita la contrasena por arriba: scrypt sobre 1 MB seria una DoS gratis", () => {
    const huge = registerSchema.safeParse({
      name: "Ana",
      email: "ana@x.com",
      password: "a".repeat(5000),
      orgName: "Acme",
    });
    expect(huge.success).toBe(false);
  });

  it("rechaza una clave de proyecto con formato invalido", () => {
    for (const key of ["t", "1TF", "TF-1", "DEMASIADOLARGA"]) {
      expect(createProjectSchema.safeParse({ orgId: CUID, name: "P", key }).success).toBe(false);
    }
  });

  it("no deja invitar directamente como OWNER", () => {
    // La propiedad se transfiere de forma explicita, no se reparte.
    const result = inviteMemberSchema.safeParse({
      orgId: CUID,
      email: "x@y.com",
      role: "OWNER",
    });
    expect(result.success).toBe(false);
  });

  it("acota el tamano de pagina del listado", () => {
    expect(issueFilterSchema.safeParse({ projectId: CUID, limit: 5000 }).success).toBe(false);
    expect(issueFilterSchema.parse({ projectId: CUID }).limit).toBe(50);
  });

  it("aplica valores por defecto coherentes al filtro", () => {
    const parsed = issueFilterSchema.parse({ projectId: CUID });
    expect(parsed).toMatchObject({
      includeArchived: false,
      orderBy: "updatedAt",
      direction: "desc",
      limit: 50,
    });
  });
});
