import "server-only";

import { z } from "zod";

import { writeAudit } from "@/server/audit";
import { requireOrgAccess } from "@/server/authz/resolve";
import type { DbClient } from "@/server/db";
import { conflict } from "@/server/errors";

import { LABEL_COLORS } from "./colors";

export { LABEL_COLORS } from "./colors";

export const createLabelSchema = z
  .object({
    orgId: z.string().cuid(),
    name: z.string().trim().min(1).max(40),
    color: z.enum(LABEL_COLORS),
  })
  .strict();

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type Actor = { id: string; email: string };

export async function listLabels(db: DbClient, actor: Actor, orgId: string) {
  await requireOrgAccess(db, actor.id, orgId, "org.read");
  return db.label.findMany({
    where: { orgId },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
}

export async function createLabel(
  db: DbClient,
  actor: Actor,
  input: CreateLabelInput,
): Promise<{ id: string }> {
  await requireOrgAccess(db, actor.id, input.orgId, "org.label.manage");

  const taken = await db.label.findUnique({
    where: { orgId_name: { orgId: input.orgId, name: input.name } },
    select: { id: true },
  });
  if (taken) conflict("Ya existe una etiqueta con ese nombre.");

  return db.$transaction(async (tx) => {
    const label = await tx.label.create({
      data: { orgId: input.orgId, name: input.name, color: input.color },
      select: { id: true },
    });

    await writeAudit(tx, {
      orgId: input.orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "label.created",
      entityType: "LABEL",
      entityId: label.id,
      entityLabel: input.name,
    });

    return label;
  });
}
