import { z } from "zod";

export const issueType = z.enum(["EPIC", "STORY", "TASK", "BUG"]);
export const issuePriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createIssueSchema = z
  .object({
    projectId: z.string().cuid(),
    title: z.string().trim().min(3, "El titulo debe tener al menos 3 caracteres.").max(240),
    description: z.string().trim().max(20_000).optional(),
    type: issueType.default("TASK"),
    priority: issuePriority.default("MEDIUM"),
    // Opcional: sin columna el issue nace en el backlog.
    columnId: z.string().cuid().optional(),
    assigneeId: z.string().cuid().nullish(),
    parentId: z.string().cuid().nullish(),
    storyPoints: z.number().int().min(0).max(100).nullish(),
    dueDate: z.coerce.date().nullish(),
    labelIds: z.array(z.string().cuid()).max(20).optional(),
  })
  .strict();

export const updateIssueSchema = z
  .object({
    issueId: z.string().cuid(),
    // Concurrencia optimista: el cliente envia la version que vio. Sin esto,
    // dos personas editando la descripcion se pisan sin aviso alguno.
    version: z.number().int().min(0),
    title: z.string().trim().min(3).max(240).optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    type: issueType.optional(),
    priority: issuePriority.optional(),
    stateId: z.string().cuid().optional(),
    assigneeId: z.string().cuid().nullable().optional(),
    parentId: z.string().cuid().nullable().optional(),
    storyPoints: z.number().int().min(0).max(100).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    labelIds: z.array(z.string().cuid()).max(20).optional(),
  })
  .strict();

/// El cliente envia la INTENCION (entre que vecinos cae), no una posicion.
/// Una posicion calculada en el navegador a partir de un estado obsoleto
/// corrompe el orden y el servidor no puede detectarlo.
export const moveIssueSchema = z
  .object({
    issueId: z.string().cuid(),
    toColumnId: z.string().cuid().nullable(),
    afterId: z.string().cuid().nullish(),
    beforeId: z.string().cuid().nullish(),
  })
  .strict()
  // Con los dos vecinos iguales, el indice fraccional no tiene hueco donde
  // caer y lanza. Sin esta comprobacion, cualquier MEMBER puede provocar un
  // 500 a voluntad enviando el mismo id dos veces.
  .refine((input) => !input.afterId || input.afterId !== input.beforeId, {
    message: "Los vecinos de destino no pueden ser el mismo issue.",
    path: ["beforeId"],
  });

export const archiveIssueSchema = z.object({ issueId: z.string().cuid() }).strict();

export const issueFilterSchema = z
  .object({
    projectId: z.string().cuid(),
    // Filtro ESTRUCTURADO desde el primer dia: cuando lleguen los filtros
    // guardados, se serializa este objeto y no hay que reescribir la consulta.
    // Minimo 3 caracteres: un trigrama son 3 letras, asi que por debajo de
    // eso el indice GIN no acota nada y la busqueda recorre la tabla.
    text: z.string().trim().min(3, "Escribe al menos 3 caracteres.").max(200).optional(),
    types: z.array(issueType).optional(),
    priorities: z.array(issuePriority).optional(),
    stateIds: z.array(z.string().cuid()).optional(),
    stateCategories: z.array(z.enum(["TODO", "IN_PROGRESS", "DONE"])).optional(),
    assigneeIds: z.array(z.string().cuid()).optional(),
    unassigned: z.boolean().optional(),
    labelIds: z.array(z.string().cuid()).optional(),
    includeArchived: z.boolean().default(false),
    orderBy: z.enum(["createdAt", "updatedAt", "priority", "number"]).default("updatedAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    cursor: z.string().cuid().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type MoveIssueInput = z.infer<typeof moveIssueSchema>;
export type IssueFilter = z.infer<typeof issueFilterSchema>;
