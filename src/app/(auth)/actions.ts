"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/server/db";
import { parseForm } from "@/server/form";
import { toResult } from "@/server/errors";
import { login, register, type RequestMeta } from "@/server/modules/auth/service";
import { loginSchema, registerSchema } from "@/server/modules/auth/schema";
import { createSession, destroySession } from "@/server/session";
import { setActiveWorkspace } from "@/server/current-org";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

/// Una Server Action es un endpoint POST publico: ocultar el boton no
/// autoriza nada. Toda accion valida su entrada y resuelve permisos por su
/// cuenta.
async function requestMeta(): Promise<RequestMeta> {
  const list = await headers();
  return {
    // x-forwarded-for solo es fiable detras de un proxy de confianza. Se usa
    // para limitar intentos, nunca para autorizar.
    ip: list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: list.get("user-agent"),
  };
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
  redirect("/");
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
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
