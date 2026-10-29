import { describe, expect, it } from "vitest";

import { compareByPosition, FIRST_KEY, keyBetween, keysBetween } from "./ordering";

describe("keyBetween", () => {
  it("genera una clave entre dos vecinas", () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);

    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it("sobrevive a 500 inserciones en el mismo borde sin colisionar", () => {
    // Este es el caso exacto que mata al ordenamiento por punto medio en
    // double: arrastrar siempre al principio de la columna.
    const last = keyBetween(null, null);
    const keys = new Set<string>([last]);
    let first = last;

    for (let i = 0; i < 500; i += 1) {
      first = keyBetween(null, first);
      expect(keys.has(first)).toBe(false);
      keys.add(first);
    }

    expect(keys.size).toBe(501);
    expect(first < last).toBe(true);
  });

  it("mantiene el orden al insertar repetidamente en el hueco central", () => {
    let low = keyBetween(null, null);
    let high = keyBetween(low, null);

    for (let i = 0; i < 200; i += 1) {
      const middle = keyBetween(low, high);
      expect(low < middle).toBe(true);
      expect(middle < high).toBe(true);
      if (i % 2 === 0) low = middle;
      else high = middle;
    }
  });
});

describe("keysBetween", () => {
  it("genera n claves ordenadas", () => {
    const keys = keysBetween(null, null, 5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("compareByPosition", () => {
  it("ordena por posicion", () => {
    const rows = [
      { id: "b", position: "a2" },
      { id: "a", position: "a1" },
    ];
    expect(rows.sort(compareByPosition).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("desempata por id cuando las posiciones coinciden", () => {
    const rows = [
      { id: "z", position: "a1" },
      { id: "a", position: "a1" },
    ];
    expect(rows.sort(compareByPosition).map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("es determinista y no da un orden distinto en cada ejecucion", () => {
    const build = () => [
      { id: "c", position: "a1" },
      { id: "a", position: "a1" },
      { id: "b", position: "a1" },
    ];
    const first = build().sort(compareByPosition).map((r) => r.id);
    const second = build().sort(compareByPosition).map((r) => r.id);
    expect(first).toEqual(second);
  });
});

describe("FIRST_KEY", () => {
  it("es una clave valida no vacia", () => {
    expect(FIRST_KEY.length).toBeGreaterThan(0);
  });
});
