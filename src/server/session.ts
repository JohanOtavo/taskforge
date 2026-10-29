import "server-only";

import { cookies } from "next/headers";

import { db } from "./db";
import { ACTIVE_ORG_COOKIE } from "./current-org";
import { SESSION_COOKIE } from "./session-cookie";
import { hashToken, newToken } from "./tokens";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias
/// Solo se refresca `lastSeenAt` si han pasado 15 minutos: evita un UPDATE en
/// cada peticion.
const TOUCH_INTERVAL_MS = 1000 * 60 * 15;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  imageUrl: string | null;
};

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = newToken();

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/// Devuelve el usuario de la sesion o null. No lanza: las paginas publicas
/// tambien la llaman.
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: { select: { id: true, email: true, name: true, imageUrl: true } },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    // Limpieza oportunista; el barrido periodico se encarga del resto.
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return session.user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  // El espacio activo es una preferencia de ESTA persona: si se queda, quien
  // entre despues en el mismo navegador hereda el espacio del anterior.
  store.delete(ACTIVE_ORG_COOKIE);
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/// Cerrar sesion en todos los dispositivos. Se invoca al cambiar la
/// contrasena: una contrasena rotada con sesiones vivas no esta rotada.
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
