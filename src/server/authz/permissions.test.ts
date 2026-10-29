import { describe, expect, it } from "vitest";

import { ALL_PERMISSIONS, can, MIN_ROLE, type Permission } from "./permissions";
import { effectiveProjectRole, RANK, type EffectiveRole } from "./roles";

const ROLES: EffectiveRole[] = ["NONE", "VIEWER", "MEMBER", "ADMIN", "OWNER"];

describe("can", () => {
  it("NONE no puede nada", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can("NONE", permission)).toBe(false);
    }
  });

  it("OWNER puede todo", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can("OWNER", permission)).toBe(true);
    }
  });

  it("es monotono: un rol superior nunca pierde un permiso", () => {
    for (const permission of ALL_PERMISSIONS) {
      let seenAllowed = false;
      for (const role of ROLES) {
        const allowed = can(role, permission);
        if (allowed) seenAllowed = true;
        // Si un rol inferior ya lo tenia, uno superior no puede perderlo.
        if (seenAllowed) expect(allowed).toBe(true);
      }
    }
  });

  it("VIEWER solo lee", () => {
    const allowed = ALL_PERMISSIONS.filter((p) => can("VIEWER", p));
    expect(allowed.sort()).toEqual(
      (["comment.read", "issue.read", "org.read", "project.read"] as Permission[]).sort(),
    );
  });

  it("MEMBER no puede borrar un issue ni gestionar miembros", () => {
    expect(can("MEMBER", "issue.create")).toBe(true);
    expect(can("MEMBER", "issue.delete")).toBe(false);
    expect(can("MEMBER", "org.member.invite")).toBe(false);
    expect(can("MEMBER", "project.delete")).toBe(false);
  });

  it("solo OWNER borra la organizacion", () => {
    expect(can("ADMIN", "org.delete")).toBe(false);
    expect(can("OWNER", "org.delete")).toBe(true);
  });

  it("todo permiso declarado tiene un rol minimo valido", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(RANK[MIN_ROLE[permission]]).toBeGreaterThan(0);
    }
  });
});

describe("effectiveProjectRole", () => {
  it("sin pertenencia a la organizacion no hay acceso", () => {
    expect(
      effectiveProjectRole({ orgRole: null, visibility: "ORG", projectRole: "ADMIN" }),
    ).toBe("NONE");
    expect(
      effectiveProjectRole({ orgRole: null, visibility: "PRIVATE", projectRole: "ADMIN" }),
    ).toBe("NONE");
  });

  it("OWNER de la organizacion no es anulable por un rol de proyecto", () => {
    expect(
      effectiveProjectRole({ orgRole: "OWNER", visibility: "ORG", projectRole: "VIEWER" }),
    ).toBe("ADMIN");
    expect(
      effectiveProjectRole({ orgRole: "OWNER", visibility: "PRIVATE", projectRole: null }),
    ).toBe("ADMIN");
  });

  it("ADMIN de la organizacion tampoco es anulable", () => {
    expect(
      effectiveProjectRole({ orgRole: "ADMIN", visibility: "PRIVATE", projectRole: "VIEWER" }),
    ).toBe("ADMIN");
  });

  it("en un proyecto ORG el rol de proyecto sustituye al de la organizacion", () => {
    // Sube.
    expect(
      effectiveProjectRole({ orgRole: "VIEWER", visibility: "ORG", projectRole: "ADMIN" }),
    ).toBe("ADMIN");
    // Y tambien baja.
    expect(
      effectiveProjectRole({ orgRole: "MEMBER", visibility: "ORG", projectRole: "VIEWER" }),
    ).toBe("VIEWER");
  });

  it("en un proyecto ORG sin fila de proyecto se hereda el rol de la organizacion", () => {
    expect(
      effectiveProjectRole({ orgRole: "MEMBER", visibility: "ORG", projectRole: null }),
    ).toBe("MEMBER");
  });

  it("un proyecto PRIVATE exige pertenencia explicita", () => {
    expect(
      effectiveProjectRole({ orgRole: "MEMBER", visibility: "PRIVATE", projectRole: null }),
    ).toBe("NONE");
    expect(
      effectiveProjectRole({ orgRole: "MEMBER", visibility: "PRIVATE", projectRole: "MEMBER" }),
    ).toBe("MEMBER");
  });

  it("es total: toda combinacion devuelve un rol conocido", () => {
    const orgRoles = [null, "OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
    const projectRoles = [null, "ADMIN", "MEMBER", "VIEWER"] as const;

    for (const orgRole of orgRoles) {
      for (const visibility of ["ORG", "PRIVATE"] as const) {
        for (const projectRole of projectRoles) {
          const role = effectiveProjectRole({ orgRole, visibility, projectRole });
          expect(ROLES).toContain(role);
        }
      }
    }
  });
});
