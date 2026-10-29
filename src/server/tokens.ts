import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/// 32 bytes = 256 bits de entropia, base64url para que viaje en una cookie o
/// en una URL sin escapes.
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/// SHA-256 del token. La base de datos nunca guarda el token en claro, asi
/// que un volcado de la tabla no permite suplantar sesiones ni aceptar
/// invitaciones ajenas.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
