import "server-only";

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/// `promisify` pierde la sobrecarga que acepta opciones, y sin opciones no se
/// puede subir `maxmem`.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

/// Parametros OWASP para scrypt: N=2^17, r=8, p=1 (~128 MiB por hash).
const DEFAULT_N = 131_072;
/// Solo se permite BAJAR el coste, y solo a una potencia de dos entre 2^14 y
/// el valor de OWASP. Una instancia gratuita de 512 MiB no sobrevive a dos
/// hashes de 128 MiB simultaneos, asi que ahi se baja a 2^16 (~64 MiB).
/// Los parametros viajan DENTRO del hash: bajarlo no invalida las
/// contrasenas ya guardadas, y al mover la app a una instancia mayor basta
/// con quitar la variable para que las nuevas vuelvan al coste completo.
const MIN_N = 16_384;
const N = readCost();
const R = 8;

function readCost(): number {
  const raw = Number(process.env.SCRYPT_N);
  if (!Number.isInteger(raw) || raw < MIN_N || raw > DEFAULT_N) return DEFAULT_N;
  // scrypt exige que N sea potencia de dos.
  if ((raw & (raw - 1)) !== 0) return DEFAULT_N;
  return raw;
}
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
/// `crypto.scrypt` LANZA si maxmem (32 MB por defecto) queda por debajo de
/// 128 * N * r. Con N=2^17 hacen falta ~134 MiB, asi que se pide el doble.
const MAX_MEM = 256 * 1024 * 1024;

/// Formato: scrypt$N=..$r=..$p=..$<saltB64>$<hashB64>
/// Los parametros se guardan dentro del hash; sin ellos no se podria subir el
/// coste en el futuro sin invalidar todas las contrasenas existentes.
const PREFIX = "scrypt";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return [
    PREFIX,
    `N=${N}`,
    `r=${R}`,
    `p=${P}`,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/// Hash desechable con los MISMOS parametros, para que verificar contra un
/// usuario inexistente cueste lo mismo que contra uno real. Sin esto, el
/// login responde en ~1 ms para un correo que no existe y en ~300 ms para
/// uno que si: un oraculo de enumeracion que ningun mensaje identico tapa.
let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("contrasena-inexistente-de-relleno");
  return dummyHash;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Se calcula y se descarta: lo que importa es el tiempo, no el valor.
    await verifyPassword(password, await getDummyHash());
    return false;
  }

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const params = parseParams(parts.slice(1, 4));
  if (!params) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
    ...params,
    maxmem: MAX_MEM,
  });

  // timingSafeEqual lanza si las longitudes difieren; la comprobacion previa
  // es obligatoria, y nunca se usa `===` sobre material secreto.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function parseParams(raw: string[]): { N: number; r: number; p: number } | null {
  const map = new Map<string, number>();
  for (const part of raw) {
    const [key, value] = part.split("=");
    const parsed = Number(value);
    if (!key || !Number.isInteger(parsed) || parsed <= 0) return null;
    map.set(key, parsed);
  }
  const n = map.get("N");
  const r = map.get("r");
  const p = map.get("p");
  if (!n || !r || !p) return null;
  // Un hash manipulado con N enorme seria una denegacion de servicio contra
  // el proceso que lo verifica.
  if (n > 1 << 20 || r > 32 || p > 16) return null;
  return { N: n, r, p };
}
