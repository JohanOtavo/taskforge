import "server-only";

import { z } from "zod";

import { writeAudit } from "@/server/audit";
import { requireIssueAccess } from "@/server/authz/resolve";
import { can } from "@/server/authz/permissions";
import type { DbClient } from "@/server/db";
import { forbidden, notFound } from "@/server/errors";
import { publishBoardEvent } from "@/server/realtime/publish";

export const createCommentSchema = z
  .object({
    issueId: z.string().cuid(),
    body: z.string().trim().min(1, "El comentario no puede estar vacio.").max(10_000),
  })
  .strict();

export const deleteCommentSchema = z.object({ commentId: z.string().cuid() }).strict();

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export type Actor = { id: string; email: string };

export async function createComment(
  db: DbClient,
  actor: Actor,
  input: CreateCommentInput,
): Promise<{ id: string }> {
  const scope = await requireIssueAccess(db, actor.id, input.issueId, "comment.create");

  return db.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        // orgId se toma del ambito resuelto, nunca del cliente.
        orgId: scope.orgId,
        issueId: input.issueId,
        authorId: actor.id,
        body: input.body,
      },
      select: { id: true },
    });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "comment.created",
      entityType: "COMMENT",
      entityId: comment.id,
      entityLabel: `${scope.projectKey}-${scope.issueNumber}`,
    });

    await publishBoardEvent(tx, {
      projectId: scope.projectId,
      type: "comment.created",
      entityId: input.issueId,
      payload: { commentId: comment.id },
      actorId: actor.id,
    });

    return comment;
  });
}

/// Borrado logico: borrar de verdad rompe los enlaces profundos de las
/// notificaciones y el hilo queda con huecos sin explicacion.
export async function deleteComment(
  db: DbClient,
  actor: Actor,
  commentId: string,
): Promise<void> {
  const comment = await db.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, authorId: true, issueId: true },
  });
  if (!comment) notFound("El comentario");

  // Leer el propio comentario basta para borrar el propio; borrar el de otra
  // persona exige el permiso explicito.
  const permission = comment.authorId === actor.id ? "comment.read" : "comment.delete.any";
  const scope = await requireIssueAccess(db, actor.id, comment.issueId, permission);

  if (comment.authorId !== actor.id && !can(scope.role, "comment.delete.any")) {
    forbidden("No puedes borrar comentarios de otras personas.");
  }

  await db.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      orgId: scope.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "comment.deleted",
      entityType: "COMMENT",
      entityId: commentId,
      entityLabel: `${scope.projectKey}-${scope.issueNumber}`,
      diff: { ownComment: comment.authorId === actor.id },
    });
  });
}
