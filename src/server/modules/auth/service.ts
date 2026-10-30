import "server-only";

import { AppError, conflict, mapPrismaError } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/password";
import { passwordHashingSlot, rateLimit } from "@/server/rate-limit";
import { normalizeEmail } from "@/lib/identifiers";

import { uniqueOrgSlug } from "../orgs/slug";
import { writeAudit } from "@/server/audit";
import type { DbClient } from "@/server/db";

import { GoogleAuthError, type GoogleProfile } from "./google";
import type { LoginInput, RegisterInput } from "./schema";

const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

export async function register(
  db: DbClient,
  input: RegisterInput,
  meta: RequestMeta = {},
): Promise<{ userId: string; orgId: string | null; orgSlug: string | null }> {
  const email = normalizeEmail(input.email);

  // Por IP Y por correo. La IP sale de x-forwarded-for, que el cliente puede
  // falsificar, asi que sola no limita nada.
  for (const key of [`register:ip:${meta.ip ?? "unknown"}`, `register:email:${email}`]) {
    if (!rateLimit(key, REGISTER_LIMIT, REGISTER_WINDOW_MS).allowed) {
      throw new AppError("RATE_LIMITED", "Demasiados intentos de registro. Prueba mas tarde.");
    }
  }

  // El correo se normaliza AQUI tambien, no solo en el esquema de Zod: un
  // script o un seed que llame al servicio directamente no debe poder crear
  // una segunda cuenta para el mismo correo con otras mayusculas.
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) conflict("Ese correo ya tiene una cuenta.");

  const passwordHash = await passwordHashingSlot(() => hashPassword(input.password));

  // El espacio de trabajo es OPCIONAL, como en Trello: primero existe la
  // cuenta. Quien llega por una invitacion no necesita crear nada, y quien
  // se registra por su cuenta lo crea en el paso siguiente.
  const slug = input.orgName ? await uniqueOrgSlug(db, input.orgName) : null;

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: input.name, passwordHash },
        select: { id: true, email: true },
      });

      const org =
        input.orgName && slug
          ? await tx.organization.create({
              data: {
                name: input.orgName,
                slug,
                memberships: { create: { userId: user.id, role: "OWNER" } },
              },
              select: { id: true, slug: true },
            })
          : null;

      await writeAudit(tx, {
        orgId: org?.id ?? null,
        actorId: user.id,
        actorEmail: user.email,
        action: "user.registered",
        entityType: "USER",
        entityId: user.id,
        entityLabel: user.email,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return { userId: user.id, orgId: org?.id ?? null, orgSlug: org?.slug ?? null };
    });
  } catch (error) {
    // La comprobacion previa cubre el caso normal; esto cubre la carrera
    // entre dos registros simultaneos, donde el indice unico sobre
    // lower(email) es quien decide.
    const mapped = mapPrismaError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function login(
  db: DbClient,
  input: LoginInput,
  meta: RequestMeta = {},
): Promise<{ userId: string }> {
  // Se limita por IP y por correo: solo por IP permite rociar un dominio
  // entero tras un NAT, y solo por correo permite probar la misma contrasena
  // contra miles de cuentas.
  for (const key of [`login:ip:${meta.ip ?? "unknown"}`, `login:email:${normalizeEmail(input.email)}`]) {
    if (!rateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS).allowed) {
      throw new AppError("RATE_LIMITED", "Demasiados intentos. Prueba de nuevo en unos minutos.");
    }
  }

  const user = await db.user.findUnique({
    where: { email: normalizeEmail(input.email) },
    select: { id: true, passwordHash: true },
  });

  const valid = await passwordHashingSlot(() =>
    verifyPassword(input.password, user?.passwordHash ?? null),
  );

  // Mismo mensaje en los dos casos: distinguirlos convierte el login en un
  // oraculo de "existe esta cuenta?".
  if (!user || !valid) {
    throw new AppError("UNAUTHENTICATED", "Correo o contrasena incorrectos.");
  }

  return { userId: user.id };
}

/// Entrar o registrarse con Google.
///
/// La identidad es el `sub` de Google. El correo solo sirve para enlazar la
/// PRIMERA vez una cuenta que ya existia con esa direccion; despues manda el
/// `sub`, y un correo que Google haya reasignado a otra persona no entra.
///
/// Al enlazar una cuenta con contrasena se borra la contrasena, se cierran
/// sus sesiones y se revocan sus invitaciones pendientes. El registro con
/// contrasena no verifica el correo, asi que cualquiera pudo crear antes una
/// cuenta con la direccion de otra persona; si Google la enlazara sin mas,
/// quien la creo seguiria entrando. Desde ese momento entra solo con Google.
// ponytail: lo que esa persona creara (espacios, miembros) se queda; borrarlo
// destruiria los datos de quien se registro de buena fe. El arreglo de fondo
// es verificar el correo al registrarse con contrasena.
export async function loginWithGoogle(
  db: DbClient,
  profile: GoogleProfile,
  meta: RequestMeta = {},
): Promise<{ userId: string }> {
  const email = normalizeEmail(profile.email);

  try {
    return await db.$transaction(async (tx) => {
      const linked = await tx.user.findUnique({
        where: { googleSub: profile.sub },
        select: { id: true },
      });
      if (linked) return { userId: linked.id };

      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, googleSub: true },
      });

      if (existing) {
        if (existing.googleSub) throw new GoogleAuthError("google_conflict");

        await tx.user.update({
          where: { id: existing.id },
          data: { googleSub: profile.sub, passwordHash: null },
        });
        if (existing.passwordHash) {
          await tx.session.deleteMany({ where: { userId: existing.id } });
          await tx.invitation.updateMany({
            where: { invitedById: existing.id, acceptedAt: null, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await writeAudit(tx, {
          orgId: null,
          actorId: existing.id,
          actorEmail: email,
          action: "user.google_linked",
          entityType: "USER",
          entityId: existing.id,
          entityLabel: email,
          diff: { hadPassword: existing.passwordHash !== null },
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        return { userId: existing.id };
      }

      const user = await tx.user.create({
        data: {
          email,
          name: profile.name,
          imageUrl: profile.picture,
          googleSub: profile.sub,
          passwordHash: null,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        orgId: null,
        actorId: user.id,
        actorEmail: email,
        action: "user.registered",
        entityType: "USER",
        entityId: user.id,
        entityLabel: email,
        diff: { method: "google" },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { userId: user.id };
    });
  } catch (error) {
    const mapped = mapPrismaError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

