"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { THEME_COOKIE, THEMES } from "@/lib/theme";
import { requireCtx } from "@/server/context";
import { toResult, type Result } from "@/server/errors";
import { parseForm } from "@/server/form";
import {
  changePasswordSchema,
  notificationPrefsSchema,
  updateProfileSchema,
} from "@/server/modules/account/schema";
import * as accountService from "@/server/modules/account/service";
import * as notificationsService from "@/server/modules/notifications/service";
import { requestMeta } from "@/server/request-meta";
import { createSession, destroyOtherSessions } from "@/server/session";

/// Acciones del menu de cuenta. Mismo contrato que actions.ts: validar,
/// resolver contexto y llamar al servicio. El id de la cuenta sale siempre de
/// la sesion: ninguna acepta un usuario desde el cliente.

const THEME_MAX_AGE_S = 60 * 60 * 24 * 365;

const invalid = (message: string): Result<never> => ({ ok: false, code: "VALIDATION", message });

function firstError(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Revisa los campos.";
}

export async function setThemeAction(value: unknown): Promise<Result<null>> {
  const theme = THEMES.find((known) => known === value);
  if (!theme) return invalid("Ese tema no existe.");

  const store = await cookies();
  if (theme === "system") {
    store.delete(THEME_COOKIE);
  } else {
    store.set(THEME_COOKIE, theme, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THEME_MAX_AGE_S,
    });
  }
  // El tema vive en el <html> del layout raiz.
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function loadNotificationsAction() {
  return toResult(async () => {
    const ctx = await requireCtx();
    return notificationsService.listNotifications(ctx.db, ctx.actor);
  });
}

export async function countUnreadAction(): Promise<Result<number>> {
  return toResult(async () => {
    const ctx = await requireCtx();
    return notificationsService.countUnread(ctx.db, ctx.actor);
  });
}

export async function markAllNotificationsReadAction(): Promise<Result<void>> {
  return toResult(async () => {
    const ctx = await requireCtx();
    await notificationsService.markAllNotificationsRead(ctx.db, ctx.actor);
  });
}

export async function updateProfileAction(formData: FormData): Promise<Result<void>> {
  const parsed = parseForm(updateProfileSchema, formData);
  if (!parsed.success) return invalid(firstError(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await accountService.updateProfile(ctx.db, ctx.actor, parsed.data);
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function changePasswordAction(formData: FormData): Promise<Result<void>> {
  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.success) return invalid(firstError(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await accountService.changePassword(ctx.db, ctx.actor, parsed.data);
    // El servicio cierra todas las sesiones, tambien esta: sin una nueva,
    // cambiar la contrasena te echaria de la pantalla en la que estas.
    await createSession(ctx.actor.id, await requestMeta());
  });
  if (result.ok) revalidatePath("/account");
  return result;
}

export async function closeOtherSessionsAction(): Promise<Result<void>> {
  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await destroyOtherSessions(ctx.actor.id);
  });
  if (result.ok) revalidatePath("/account");
  return result;
}

export async function updateNotificationPrefsAction(formData: FormData): Promise<Result<void>> {
  // Una casilla sin marcar no viaja en el formulario: la ausencia es `false`.
  const parsed = notificationPrefsSchema.safeParse({
    notifyAssigned: formData.get("notifyAssigned") === "on",
    notifyComments: formData.get("notifyComments") === "on",
    notifyMembership: formData.get("notifyMembership") === "on",
  });
  if (!parsed.success) return invalid(firstError(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await accountService.updateNotificationPrefs(ctx.db, ctx.actor, parsed.data);
  });
  if (result.ok) revalidatePath("/settings");
  return result;
}
