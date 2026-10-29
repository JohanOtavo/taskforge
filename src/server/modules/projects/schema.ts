import { z } from "zod";

import { isValidProjectKey, normalizeProjectKey } from "@/lib/identifiers";

export const createProjectSchema = z
  .object({
    orgId: z.string().cuid(),
    name: z.string().trim().min(2, "Indica el nombre del proyecto.").max(120),
    key: z
      .string()
      .trim()
      .transform(normalizeProjectKey)
      .refine(isValidProjectKey, "La clave debe ser de 2 a 10 letras o digitos y empezar por letra."),
    description: z.string().trim().max(2000).optional(),
    visibility: z.enum(["ORG", "PRIVATE"]).default("ORG"),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    projectId: z.string().cuid(),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(["ORG", "PRIVATE"]).optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/// Flujo por defecto. Lo importante es `category`: es lo que se consulta para
/// saber si algo esta hecho, nunca la posicion de la columna.
export const DEFAULT_WORKFLOW = [
  { name: "Por hacer", category: "TODO" },
  { name: "En curso", category: "IN_PROGRESS" },
  { name: "En revision", category: "IN_PROGRESS" },
  { name: "Hecho", category: "DONE" },
] as const;
