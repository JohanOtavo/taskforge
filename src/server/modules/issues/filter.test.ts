import { describe, expect, it } from "vitest";

import { buildIssueOrderBy, buildIssueWhere } from "./filter";
import type { IssueFilter } from "./schema";

const base: Omit<IssueFilter, "projectId"> = {
  includeArchived: false,
  orderBy: "updatedAt",
  direction: "desc",
  limit: 50,
};

function clauses(filter: Partial<Omit<IssueFilter, "projectId">> = {}) {
  const where = buildIssueWhere("prj_1", { ...base, ...filter });
  return (where.AND ?? []) as Record<string, unknown>[];
}

describe("buildIssueWhere", () => {
  it("siempre acota al proyecto resuelto por authz", () => {
    expect(clauses()[0]).toEqual({ projectId: "prj_1" });
  });

  it("excluye archivados por defecto", () => {
    expect(clauses()).toContainEqual({ archivedAt: null });
  });

  it("incluye archivados cuando se pide", () => {
    expect(clauses({ includeArchived: true })).not.toContainEqual({ archivedAt: null });
  });

  it("busca por titulo", () => {
    expect(clauses({ text: "login" })).toContainEqual({
      OR: [{ title: { contains: "login", mode: "insensitive" } }],
    });
  });

  it("entiende TF-42 como busqueda por numero", () => {
    const found = clauses({ text: "TF-42" }).find((c) => "OR" in c);
    expect(found).toEqual({
      OR: [{ title: { contains: "TF-42", mode: "insensitive" } }, { number: 42 }],
    });
  });

  it("entiende un numero suelto", () => {
    const found = clauses({ text: "42" }).find((c) => "OR" in c);
    expect(found).toMatchObject({ OR: [expect.anything(), { number: 42 }] });
  });

  it("no inventa un filtro por numero con texto no numerico", () => {
    const found = clauses({ text: "bug" }).find((c) => "OR" in c);
    expect(found).toEqual({ OR: [{ title: { contains: "bug", mode: "insensitive" } }] });
  });

  it("ignora los arrays vacios en vez de filtrar por nada", () => {
    const result = clauses({ types: [], priorities: [], labelIds: [], stateIds: [] });
    expect(result).toHaveLength(2);
  });

  it("filtra por tipo y prioridad", () => {
    const result = clauses({ types: ["BUG"], priorities: ["URGENT", "HIGH"] });
    expect(result).toContainEqual({ type: { in: ["BUG"] } });
    expect(result).toContainEqual({ priority: { in: ["URGENT", "HIGH"] } });
  });

  it("filtra por categoria de estado y no por posicion de columna", () => {
    expect(clauses({ stateCategories: ["DONE"] })).toContainEqual({
      state: { category: { in: ["DONE"] } },
    });
  });

  it("exige TODAS las etiquetas pedidas, no cualquiera de ellas", () => {
    const result = clauses({ labelIds: ["lbl_1", "lbl_2"] });
    expect(result).toContainEqual({ labels: { some: { labelId: "lbl_1" } } });
    expect(result).toContainEqual({ labels: { some: { labelId: "lbl_2" } } });
  });

  it("combina asignado y sin asignar con OR", () => {
    expect(clauses({ assigneeIds: ["usr_1"], unassigned: true })).toContainEqual({
      OR: [{ assigneeId: { in: ["usr_1"] } }, { assigneeId: null }],
    });
  });

  it("no envuelve en OR un solo criterio de asignacion", () => {
    expect(clauses({ unassigned: true })).toContainEqual({ assigneeId: null });
    expect(clauses({ assigneeIds: ["usr_1"] })).toContainEqual({
      assigneeId: { in: ["usr_1"] },
    });
  });
});

describe("buildIssueOrderBy", () => {
  it("desempata siempre por id para que el cursor sea estable", () => {
    expect(buildIssueOrderBy({ orderBy: "updatedAt", direction: "desc" })).toEqual([
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("respeta el campo y la direccion pedidos", () => {
    expect(buildIssueOrderBy({ orderBy: "priority", direction: "asc" })).toEqual([
      { priority: "asc" },
      { id: "asc" },
    ]);
  });
});
