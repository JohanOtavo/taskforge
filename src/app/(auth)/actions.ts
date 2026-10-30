"use server";

import { redirect } from "next/navigation";

import { safeNext } from "@/lib/safe-next";
import { db } from "@/server/db";
import { parseForm } from "@/server/form";
import { toResult } from "@/server/errors";
import { login, register } from "@/server/modules/auth/service";
import { loginSchema, registerSchema } from "@/server/modules/auth/schema";
import { requestMeta } from "@/server/request-meta";
import { createSession, destroySession } from "@/server/session";
import { setActiveWorkspace } from "@/server/current-org";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

/// Una Server Action es un endpoint POST publico: ocultar el boton no
/// autoriza nada. Toda accion valida su entrada y resuelve permisos por su
/// cuenta.

/// A donde volver despues de entrar (por ejemplo, a una invitacion).
function nextOf(formData: FormData): string {
  const value = formData.get("next");
  return safeNext(typeof value === "string" ? value : null);
}

function zodFieldErrors(error: unknown): Record<string, string> | undefined {
  if (typeof error !== "object" || error === null || !("issues" in error)) return undefined;
  const issues = (error as { issues: Array<{ path: unknown[]; message: string }> }).issues;
  const map: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    map[key] ??= issue.message;
  }
  return map;
}

export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(registerSchema, formData);
  if (!parsed.success) {
    return { error: "Revisa los campos marcados.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const meta = await requestMeta();
  const result = await toResult(() => register(db, parsed.data, meta));
  if (!result.ok) return { error: result.message };

  await createSession(result.data.userId, meta);
  if (result.data.orgId) await setActiveWorkspace(result.data.orgId);
  redirect(nextOf(formData));
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) {
    return { error: "Introduce tu correo y tu contrasena." };
  }

  const meta = await requestMeta();
  const result = await toResult(() => login(db, parsed.data, meta));
  if (!result.ok) return { error: result.message };

  await createSession(result.data.userId, meta);
  redirect(nextOf(formData));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
