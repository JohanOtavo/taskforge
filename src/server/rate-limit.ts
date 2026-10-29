import "server-only";

/// Limitador de ventana deslizante en memoria.
///
/// ponytail: en memoria y por proceso. Con varias replicas el limite efectivo
/// se multiplica por el numero de replicas. Suficiente para frenar fuerza
/// bruta desde un cliente; si hace falta un limite global, el reemplazo es
/// Redis con la misma firma.
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const LAST_SWEEP = { at: 0 };
const SWEEP_INTERVAL_MS = 60_000;
/// Ventana mas larga en uso. El barrido poda contra ella, asi que nunca borra
/// una entrada que todavia cuenta.
const MAX_WINDOW_MS = 60 * 60 * 1000;

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterMs: 0 };
}

/// Para los tests: reinicia el estado entre casos.
export function resetRateLimits(): void {
  buckets.clear();
  LAST_SWEEP.at = 0;
}

export function rateLimitSize(): number {
  return buckets.size;
}

/// El barrido PODA cada cubo contra la ventana maxima antes de decidir si
/// esta vacio.
///
/// La version anterior solo borraba cubos ya vacios, y un cubo solo se vaciaba
/// al volver a consultar SU clave. Como la clave lleva dentro un correo que
/// elige quien llama, un millon de direcciones distintas dejaba un millon de
/// entradas residentes para siempre: el limitador escrito para frenar fuerza
/// bruta se convertia en la via para agotar la memoria.
function sweep(now: number): void {
  if (now - LAST_SWEEP.at < SWEEP_INTERVAL_MS) return;
  LAST_SWEEP.at = now;

  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((at) => now - at < MAX_WINDOW_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

/// Semaforo de concurrencia.
///
/// scrypt con los parametros de OWASP pide ~128 MiB por hash. Diez logins
/// simultaneos son 1,3 GB y el contenedor muere. Ademas `crypto.scrypt` corre
/// en el threadpool de libuv (4 hilos por defecto), asi que sin limite los
/// hashes bloquean fs/dns de todo el proceso.
export function createSemaphore(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  /// El permiso se TRANSFIERE: quien termina no decrementa si hay alguien
  /// esperando, y quien despierta no incrementa.
  ///
  /// Leer el contador antes de un await e incrementarlo despues permitia que
  /// un recien llegado viese el hueco en el microtask intermedio y pasase
  /// junto al que acababa de ser despertado: tres hashes de 128 MiB a la vez
  /// bajo un semaforo de dos.
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active -= 1;
  };

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active += 1;
    }

    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/// Por defecto 2. En una instancia gratuita de 512 MiB hay que bajarlo a 1:
/// dos hashes al coste de OWASP son 256 MiB y el contenedor muere antes de
/// responder al login.
function readHashingConcurrency(): number {
  const raw = Number(process.env.PASSWORD_HASH_CONCURRENCY);
  if (!Number.isInteger(raw) || raw < 1 || raw > 16) return 2;
  return raw;
}

export const passwordHashingSlot = createSemaphore(readHashingConcurrency());
