import { z } from "zod";

import { normalizeEmail } from "@/lib/identifiers";

export const orgRole = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

export const inviteMemberSchema = z
  .object({
    orgId: z.string().cuid(),
    email: z.string().trim().email().max(254).transform(normalizeEmail),
    // No se puede invitar directamente como OWNER: la propiedad se transfiere
    // de forma explicita, no se reparte en una invitacion.
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
    // Invitacion directa a un tablero, como en Trello: al aceptar entra en
    // la organizacion Y en ese tablero de una vez.
    projectId: z.string().cuid().optional(),
    projectRole: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
  })
  .strict();

export const createOrganizationSchema = z
  .object({ name: z.string().trim().min(2, "Indica un nombre.").max(120) })
  .strict();

export const projectMemberSchema = z
  .object({
    projectId: z.string().cuid(),
    userId: z.string().cuid(),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
  })
  .strict();

export const removeProjectMemberSchema = z
  .object({ projectId: z.string().cuid(), userId: z.string().cuid() })
  .strict();

export const acceptInviteSchema = z.object({ token: z.string().min(10).max(200) }).strict();

export const updateMemberRoleSchema = z
  .object({
    orgId: z.string().cuid(),
    userId: z.string().cuid(),
    role: orgRole,
  })
  .strict();

export const removeMemberSchema = z
  .object({ orgId: z.string().cuid(), userId: z.string().cuid() })
  .strict();

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type ProjectMemberInput = z.infer<typeof projectMemberSchema>;
export type RemoveProjectMemberInput = z.infer<typeof removeProjectMemberSchema>;
