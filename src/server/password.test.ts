import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("verifica la contrasena correcta", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rechaza la contrasena incorrecta", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("Correct horse battery staple", hash)).resolves.toBe(false);
  });

  it("usa una sal distinta por hash", async () => {
    const [a, b] = await Promise.all([hashPassword("misma"), hashPassword("misma")]);
    expect(a).not.toBe(b);
  });

  it("guarda los parametros dentro del hash para poder subir el coste", async () => {
    const hash = await hashPassword("x");
    expect(hash.startsWith("scrypt$N=131072$r=8$p=1$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
  });

  it("devuelve false para un usuario sin contrasena (alta por OAuth)", async () => {
    await expect(verifyPassword("cualquiera", null)).resolves.toBe(false);
  });

  it.each([
    ["", "cadena vacia"],
    ["nodigest", "sin separadores"],
    ["bcrypt$N=1$r=8$p=1$c2FsdA==$aGFzaA==", "algoritmo desconocido"],
    ["scrypt$N=131072$r=8$p=1$c2FsdA==", "campos insuficientes"],
    ["scrypt$N=0$r=8$p=1$c2FsdA==$aGFzaA==", "N invalido"],
  ])("rechaza un hash malformado (%s)", async (stored) => {
    await expect(verifyPassword("x", stored)).resolves.toBe(false);
  });

  it("rechaza un hash manipulado con N enorme en vez de intentar calcularlo", async () => {
    // Sin este limite, un hash alterado seria una denegacion de servicio
    // contra el proceso que lo verifica.
    const malicious = "scrypt$N=1073741824$r=8$p=1$c2FsdA==$aGFzaA==";
    const started = Date.now();
    await expect(verifyPassword("x", malicious)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("normaliza unicode: la misma contrasena escrita en NFC y NFD coincide", async () => {
    const nfc = "café";
    const nfd = "café";
    const hash = await hashPassword(nfc);
    await expect(verifyPassword(nfd, hash)).resolves.toBe(true);
  });
});

describe("mapPrismaError", () => {
  it("traduce P2002 a CONFLICT", async () => {
    const { mapPrismaError } = await import("./errors");
    const mapped = mapPrismaError({ code: "P2002", meta: { target: ["email"] } });
    expect(mapped?.code).toBe("CONFLICT");
    // El mensaje no debe filtrar el nombre del indice.
    expect(mapped?.message).not.toContain("P2002");
  });

  it("traduce P2025 a NOT_FOUND y P2034 a CONFLICT", async () => {
    const { mapPrismaError } = await import("./errors");
    expect(mapPrismaError({ code: "P2025" })?.code).toBe("NOT_FOUND");
    expect(mapPrismaError({ code: "P2034" })?.code).toBe("CONFLICT");
  });

  it("devuelve null para lo que no reconoce, en vez de inventar un codigo", async () => {
    const { mapPrismaError } = await import("./errors");
    expect(mapPrismaError(new Error("cualquier cosa"))).toBeNull();
    expect(mapPrismaError({ code: "P9999" })).toBeNull();
    expect(mapPrismaError(null)).toBeNull();
    expect(mapPrismaError("texto")).toBeNull();
  });
});

describe("coste constante ante usuario inexistente", () => {
  it("tarda lo mismo con contrasena incorrecta que sin usuario", async () => {
    // Si verificar contra `null` devolviese false al instante, el login seria
    // un oraculo de enumeracion por tiempo que ningun mensaje identico tapa.
    const hash = await hashPassword("una-frase-larga-de-verdad");

    const timeOf = async (stored: string | null) => {
      const started = performance.now();
      await verifyPassword("otra-frase-distinta", stored);
      return performance.now() - started;
    };

    // Calentamiento: el primer hash desechable se calcula una sola vez.
    await verifyPassword("x", null);

    const conUsuario = await timeOf(hash);
    const sinUsuario = await timeOf(null);

    // Margen amplio: lo que se descarta es la diferencia de dos ordenes de
    // magnitud que habia antes (~1 ms frente a ~300 ms).
    const ratio = Math.max(conUsuario, sinUsuario) / Math.min(conUsuario, sinUsuario);
    expect(ratio).toBeLessThan(5);
  });
});
