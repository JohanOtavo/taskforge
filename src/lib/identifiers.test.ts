import { describe, expect, it } from "vitest";

import {
  isReservedSlug,
  isValidProjectKey,
  normalizeEmail,
  normalizeProjectKey,
  slugify,
} from "./identifiers";

describe("slugify", () => {
  it.each([
    ["Acme Corp", "acme-corp"],
    ["  Equipo  Diseño  ", "equipo-diseno"],
    ["MAYUSCULAS", "mayusculas"],
    ["a--b__c", "a-b-c"],
    ["---", ""],
    ["Ünïcödé Tëst", "unicode-test"],
  ])("slugify(%j) = %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("recorta a 48 caracteres", () => {
    expect(slugify("a".repeat(100))).toHaveLength(48);
  });
});

describe("isReservedSlug", () => {
  it("rechaza las rutas que la app ya usa", () => {
    for (const slug of ["api", "admin", "settings", "_next"]) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it("acepta un slug normal", () => {
    expect(isReservedSlug("acme-corp")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("colapsa las variantes de mayusculas a la misma cuenta", () => {
    expect(normalizeEmail("  Alice@X.COM ")).toBe("alice@x.com");
    expect(normalizeEmail("alice@x.com")).toBe(normalizeEmail("ALICE@X.com"));
  });
});

describe("project key", () => {
  it("normaliza a mayusculas", () => {
    expect(normalizeProjectKey(" tf ")).toBe("TF");
  });

  it.each([
    ["TF", true],
    ["PROJ1", true],
    ["T", false],
    ["1TF", false],
    ["tf", false],
    ["TOOLONGKEYXX", false],
    ["TF-1", false],
  ])("isValidProjectKey(%j) = %s", (key, expected) => {
    expect(isValidProjectKey(key)).toBe(expected);
  });
});
