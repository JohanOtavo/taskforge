"use server";

import { revalidatePath } from "next/cache";

import { requireCtx } from "@/server/context";
import { setActiveWorkspace } from "@/server/current-org";
import { toResult, type Result } from "@/server/errors";
import { parseForm } from "@/server/form";
import * as commentsService from "@/server/modules/comments/service";
import * as issuesService from "@/server/modules/issues/service";
import * as labelsService from "@/server/modules/labels/service";
import * as orgsService from "@/server/modules/orgs/service";
import * as projectsService from "@/server/modules/projects/service";
import { createCommentSchema, deleteCommentSchema } from "@/server/modules/comments/service";
import {
  archiveIssueSchema,
  createIssueSchema,
  updateIssueSchema,
} from "@/server/modules/issues/schema";
import { createLabelSchema } from "@/server/modules/labels/service";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  projectMemberSchema,
  removeMemberSchema,
  removeProjectMemberSchema,
  updateMemberRoleSchema,
} from "@/server/modules/orgs/schema";
import { createProjectSchema } from "@/server/modules/projects/schema";

/// Cada accion hace exactamente tres cosas: validar, resolver contexto y
/// llamar al servicio. Si no tienen logica propia, no hay nada que probar en
/// ellas: los tests apuntan a los servicios.
///
/// `requireCtx` va DENTRO de `toResult`: lanza UNAUTHENTICATED, y fuera del
/// envoltorio una sesion caducada llegaria al cliente como un digest opaco
/// en vez de como un mensaje que se puede mostrar.
///
/// Los argumentos se validan SIEMPRE, incluso los que en TypeScript son
/// `string`: los tipos se borran al compilar y el argumento de una Server
/// Action llega deserializado del cliente, asi que un objeto Prisma como
/// `{ startsWith: "cm9" }` entraria tal cual en un `where`.

function fieldErrors(error: unknown): Record<string, string> | undefined {
  if (typeof error !== "object" || error === null || !("issues" in error)) return undefined;
  const issues = (error as { issues: Array<{ path: unknown[]; message: string }> }).issues;
  const map: Record<string, string> = {};
  for (const issue of issues) map[String(issue.path[0] ?? "form")] ??= issue.message;
  return map;
}

const invalid = (message: string, details?: Record<string, string>): Result<never> => ({
  ok: false,
  code: "VALIDATION",
  message,
  details,
});

// ------------------------------------------------- espacios de trabajo

export async function createWorkspaceAction(
  formData: FormData,
): Promise<Result<{ orgId: string }>> {
  const parsed = parseForm(createOrganizationSchema, formData);
  if (!parsed.success) return invalid("Indica un nombre.", fieldErrors(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return orgsService.createOrganization(ctx.db, ctx.actor, parsed.data);
  });

  if (result.ok) {
    await setActiveWorkspace(result.data.orgId);
    revalidatePath("/", "layout");
  }
  return result.ok ? { ok: true, data: { orgId: result.data.orgId } } : result;
}

export async function switchWorkspaceAction(orgId: unknown): Promise<Result<null>> {
  if (typeof orgId !== "string") return invalid("Espacio de trabajo invalido.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    // Cambiar de espacio exige seguir perteneciendo a el. La cookie es una
    // preferencia, nunca una credencial.
    const workspaces = await orgsService.listMyOrganizations(ctx.db, ctx.actor);
    if (!workspaces.some((workspace) => workspace.org.id === orgId)) {
      throw new Error("sin acceso");
    }
    return null;
  });

  if (!result.ok) return invalid("No perteneces a ese espacio de trabajo.");

  await setActiveWorkspace(orgId);
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

// ------------------------------------------------------------- proyectos

export async function createProjectAction(formData: FormData): Promise<Result<{ key: string }>> {
  const parsed = parseForm(createProjectSchema, formData);
  if (!parsed.success) return invalid("Revisa los campos.", fieldErrors(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return projectsService.createProject(ctx.db, ctx.actor, parsed.data);
  });

  if (result.ok) revalidatePath("/");
  return result.ok ? { ok: true, data: { key: result.data.key } } : result;
}

// ----------------------------------------------------------------- issues

export async function createIssueAction(input: unknown): Promise<Result<{ key: string }>> {
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) return invalid("Revisa los campos.", fieldErrors(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return issuesService.createIssue(ctx.db, ctx.actor, parsed.data);
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result.ok ? { ok: true, data: { key: result.data.key } } : result;
}

export async function updateIssueAction(input: unknown): Promise<Result<{ version: number }>> {
  const parsed = updateIssueSchema.safeParse(input);
  if (!parsed.success) return invalid("Revisa los campos.", fieldErrors(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return issuesService.updateIssue(ctx.db, ctx.actor, parsed.data);
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result;
}

export async function archiveIssueAction(issueId: unknown): Promise<Result<null>> {
  const parsed = archiveIssueSchema.safeParse({ issueId });
  if (!parsed.success) return invalid("Issue invalido.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await issuesService.archiveIssue(ctx.db, ctx.actor, parsed.data.issueId);
    return null;
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result;
}

// ----------------------------------------------------------- comentarios

export async function createCommentAction(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return invalid("El comentario no puede estar vacio.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return commentsService.createComment(ctx.db, ctx.actor, parsed.data);
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result;
}

export async function deleteCommentAction(commentId: unknown): Promise<Result<null>> {
  const parsed = deleteCommentSchema.safeParse({ commentId });
  if (!parsed.success) return invalid("Comentario invalido.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await commentsService.deleteComment(ctx.db, ctx.actor, parsed.data.commentId);
    return null;
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result;
}

// -------------------------------------------------------------- etiquetas

export async function createLabelAction(formData: FormData): Promise<Result<{ id: string }>> {
  const parsed = parseForm(createLabelSchema, formData);
  if (!parsed.success) return invalid("Revisa el nombre y el color.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return labelsService.createLabel(ctx.db, ctx.actor, parsed.data);
  });

  if (result.ok) revalidatePath("/members");
  return result;
}

// --------------------------------------------------------------- equipo

/// Resultado estilo Trello: si la persona ya tenia cuenta entra en el acto;
/// si no, se devuelve un enlace para que quien invita se lo pase.
export type InviteActionData =
  | { kind: "added"; name: string; email: string }
  | { kind: "invited"; url: string; email: string; expiresAt: string };

export async function inviteMemberAction(
  formData: FormData,
): Promise<Result<InviteActionData>> {
  const parsed = parseForm(inviteMemberSchema, formData);
  if (!parsed.success) return invalid("Revisa el correo y el rol.", fieldErrors(parsed.error));

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    return orgsService.inviteMember(ctx.db, ctx.actor, parsed.data);
  });
  if (!result.ok) return result;

  revalidatePath("/members");
  revalidatePath("/p", "layout");

  if (result.data.kind === "added") {
    return {
      ok: true,
      data: { kind: "added", name: result.data.name, email: result.data.email },
    };
  }

  // APP_URL es obligatoria: caer en la cabecera Host dejaria que el cliente
  // eligiera el dominio del enlace que transporta el token.
  const origin = process.env.APP_URL;
  if (!origin) {
    return invalid("Falta configurar APP_URL para poder generar enlaces de invitacion.");
  }

  return {
    ok: true,
    data: {
      kind: "invited",
      email: parsed.data.email,
      url: `${origin}/invite/${result.data.token}`,
      expiresAt: result.data.expiresAt.toISOString(),
    },
  };
}

export async function updateMemberRoleAction(formData: FormData): Promise<Result<null>> {
  const parsed = parseForm(updateMemberRoleSchema, formData);
  if (!parsed.success) return invalid("Rol invalido.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await orgsService.updateMemberRole(ctx.db, ctx.actor, parsed.data);
    return null;
  });

  if (result.ok) revalidatePath("/members");
  return result;
}

export async function removeMemberAction(formData: FormData): Promise<Result<null>> {
  const parsed = parseForm(removeMemberSchema, formData);
  if (!parsed.success) return invalid("Datos invalidos.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await orgsService.removeMember(ctx.db, ctx.actor, parsed.data);
    return null;
  });

  if (result.ok) revalidatePath("/members");
  return result;
}

// -------------------------------------------------- miembros del tablero

export async function addProjectMemberAction(formData: FormData): Promise<Result<null>> {
  const parsed = parseForm(projectMemberSchema, formData);
  if (!parsed.success) return invalid("Datos invalidos.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await orgsService.addProjectMember(ctx.db, ctx.actor, parsed.data);
    return null;
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result;
}

export async function removeProjectMemberAction(formData: FormData): Promise<Result<null>> {
  const parsed = parseForm(removeProjectMemberSchema, formData);
  if (!parsed.success) return invalid("Datos invalidos.");

  const result = await toResult(async () => {
    const ctx = await requireCtx();
    await orgsService.removeProjectMember(ctx.db, ctx.actor, parsed.data);
    return null;
  });

  if (result.ok) revalidatePath("/p", "layout");
  return result;
}
