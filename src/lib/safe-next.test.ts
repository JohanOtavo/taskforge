import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("deja pasar rutas internas", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("/p/WEB?view=board")).toBe("/p/WEB?view=board");
  });

  it("cae en la portada si no hay destino", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("rechaza destinos a otro dominio", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });

  it("rechaza caracteres de control que el navegador borra", () => {
    // El navegador quita tabuladores y saltos de linea de una URL: "/\t/x"
    // acabaria siendo "//x", otro dominio.
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("/\n/evil.example")).toBe("/");
  });
});
