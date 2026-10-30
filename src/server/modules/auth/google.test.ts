import { describe, expect, it } from "vitest";

import { GoogleAuthError, parseIdToken } from "./google";

const CLIENT_ID = "123.apps.googleusercontent.com";
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

/// Un id_token sin firma valida: `parseIdToken` no la comprueba porque el
/// token llega directo de Google por TLS (ver el comentario en google.ts).
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.firma`;
}

const valid = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: NOW / 1000 + 300,
  sub: "1098765",
  email: "Ana.Rivas@Gmail.com",
  email_verified: true,
  name: "Ana Rivas",
  picture: "https://lh3.googleusercontent.com/a/foto",
};

describe("parseIdToken", () => {
  it("devuelve el perfil de un token valido", () => {
    expect(parseIdToken(idToken(valid), CLIENT_ID, NOW)).toEqual({
      sub: "1098765",
      email: "Ana.Rivas@Gmail.com",
      name: "Ana Rivas",
      picture: "https://lh3.googleusercontent.com/a/foto",
    });
  });

  it("rechaza un token emitido para otra aplicacion", () => {
    expect(() => parseIdToken(idToken({ ...valid, aud: "otra" }), CLIENT_ID, NOW)).toThrow();
  });

  it("rechaza un emisor que no es Google", () => {
    expect(() =>
      parseIdToken(idToken({ ...valid, iss: "https://evil.example" }), CLIENT_ID, NOW),
    ).toThrow();
  });

  it("rechaza un token caducado", () => {
    expect(() => parseIdToken(idToken({ ...valid, exp: NOW / 1000 - 1 }), CLIENT_ID, NOW)).toThrow();
  });

  it("rechaza un correo que Google no ha verificado", () => {
    // El correo es la identidad: sin verificar, cualquiera podria crear una
    // cuenta de Google con la direccion de otra persona y entrar en la suya.
    const unverified = idToken({ ...valid, email_verified: false });
    expect(() => parseIdToken(unverified, CLIENT_ID, NOW)).toThrow(GoogleAuthError);
  });

  it("usa la parte local del correo si Google no da nombre", () => {
    const profile = parseIdToken(idToken({ ...valid, name: "  " }), CLIENT_ID, NOW);
    expect(profile.name).toBe("Ana.Rivas");
  });

  it("descarta una foto que no va por https", () => {
    const profile = parseIdToken(idToken({ ...valid, picture: "javascript:alert(1)" }), CLIENT_ID, NOW);
    expect(profile.picture).toBeNull();
  });

  it("rechaza un token mal formado", () => {
    expect(() => parseIdToken("no-es-un-jwt", CLIENT_ID, NOW)).toThrow();
  });
});
