/// Los fallos esperados (validacion, permisos, conflicto) se DEVUELVEN, no se
/// lanzan: una excepcion en produccion se convierte en un digest opaco y se
/// pierde el mensaje. Solo los fallos de programacion se lanzan.

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: AppErrorCode; message: string; details?: Record<string, unknown> };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = (
  code: AppErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<never> => ({ ok: false, code, message, details });

/// Traduce los errores conocidos de Prisma a codigos de la aplicacion.
///
/// Un P2002 que llegue al cliente como error de Prisma filtra nombres de
/// indices y de columnas, y para quien llama es indistinguible de un fallo
/// interno. Las comprobaciones previas de cada servicio cubren el caso
/// normal; esto es el respaldo para las carreras.
export function mapPrismaError(error: unknown): AppError | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return null;

  switch (code) {
    case "P2002":
      return new AppError("CONFLICT", "Ese valor ya existe.", {
        target: (error as { meta?: { target?: unknown } }).meta?.target,
      });
    case "P2025":
      return new AppError("NOT_FOUND", "El recurso no existe o no tienes acceso.");
    case "P2003":
      return new AppError("VALIDATION", "Referencia invalida.");
    case "P2034":
      // Fallo de serializacion: reintentar es legitimo.
      return new AppError("CONFLICT", "Conflicto de concurrencia. Vuelve a intentarlo.");
    default:
      return null;
  }
}

/// Envuelve un servicio para que una Server Action nunca lance al cliente.
export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    const mapped = error instanceof AppError ? error : mapPrismaError(error);
    if (mapped) {
      return { ok: false, code: mapped.code, message: mapped.message, details: mapped.details };
    }
    // Un error inesperado no debe filtrar su mensaje al navegador.
    console.error("[unexpected]", error);
    return fail("VALIDATION", "Ha ocurrido un error inesperado.");
  }
}

export function notFound(what: string): never {
  throw new AppError("NOT_FOUND", `${what} no existe o no tienes acceso.`);
}

export function forbidden(message = "No tienes permiso para esta accion."): never {
  throw new AppError("FORBIDDEN", message);
}

export function conflict(message: string, details?: Record<string, unknown>): never {
  throw new AppError("CONFLICT", message, details);
}
