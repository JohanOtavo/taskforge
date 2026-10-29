import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseForm } from "./form";

const schema = z
  .object({
    email: z.string().email(),
    role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
    note: z.string().optional(),
  })
  .strict();

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseForm", () => {
  it("ignora los campos internos que React anade a las Server Actions", () => {
    // Este es el caso que rompia TODOS los formularios: con
    // Object.fromEntries, `.strict()` rechazaba la peticion por culpa de
    // campos que ni el usuario ni el codigo habian escrito.
    const result = parseForm(
      schema,
      form({
        email: "ana@x.com",
        $ACTION_REF_1: "",
        "$ACTION_1:0": "{...}",
        $ACTION_KEY: "k",
      }),
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("ana@x.com");
  });

  it("aplica los valores por defecto del esquema", () => {
    const result = parseForm(schema, form({ email: "ana@x.com" }));
    expect(result.success && result.data.role).toBe("MEMBER");
  });

  it("trata la cadena vacia como ausencia, para que los opcionales funcionen", () => {
    // Un <select> sin elegir manda "", que no es un valor valido para un
    // campo opcional.
    const result = parseForm(schema, form({ email: "ana@x.com", note: "" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeUndefined();
  });

  it("sigue rechazando un valor invalido", () => {
    expect(parseForm(schema, form({ email: "no-es-un-correo" })).success).toBe(false);
  });

  it("no deja colar una clave que el esquema no declara", () => {
    const result = parseForm(schema, form({ email: "ana@x.com", orgId: "org-ajeno" }));
    expect(result.success).toBe(true);
    if (result.success) expect("orgId" in result.data).toBe(false);
  });
});
