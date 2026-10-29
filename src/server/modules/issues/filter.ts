import type { Prisma } from "@prisma/client";

import type { IssueFilter } from "./schema";

/// El `where` no depende de la paginacion, asi que se excluye del tipo.
export type IssueWhereFilter = Omit<IssueFilter, "projectId" | "cursor" | "limit">;

/// Traduce el filtro estructurado a una clausula `where` de Prisma.
///
/// Es una funcion PURA a proposito: se puede probar exhaustivamente sin base
/// de datos, y cuando lleguen los filtros guardados solo hay que persistir el
/// objeto de entrada.
///
/// `projectId` se pasa aparte, resuelto por authz: nunca sale del filtro del
/// cliente.
export function buildIssueWhere(
  projectId: string,
  filter: IssueWhereFilter,
): Prisma.IssueWhereInput {
  const and: Prisma.IssueWhereInput[] = [{ projectId }];

  if (!filter.includeArchived) and.push({ archivedAt: null });

  if (filter.text) {
    const text = filter.text;
    const asNumber = Number(text.replace(/^[A-Za-z]+-/, ""));
    const or: Prisma.IssueWhereInput[] = [
      // `mode: insensitive` usa el indice trigram creado en la migracion.
      { title: { contains: text, mode: "insensitive" } },
    ];
    // "TF-42" o "42" buscan por numero, que es como la gente referencia un
    // issue en una conversacion.
    if (Number.isInteger(asNumber) && asNumber > 0) or.push({ number: asNumber });
    and.push({ OR: or });
  }

  if (filter.types?.length) and.push({ type: { in: filter.types } });
  if (filter.priorities?.length) and.push({ priority: { in: filter.priorities } });
  if (filter.stateIds?.length) and.push({ stateId: { in: filter.stateIds } });
  if (filter.stateCategories?.length) {
    and.push({ state: { category: { in: filter.stateCategories } } });
  }
  if (filter.labelIds?.length) {
    // `some` por etiqueta, no `in`: pedir "bug Y urgente" debe exigir las dos.
    for (const labelId of filter.labelIds) and.push({ labels: { some: { labelId } } });
  }

  const assigneeClauses: Prisma.IssueWhereInput[] = [];
  if (filter.assigneeIds?.length) assigneeClauses.push({ assigneeId: { in: filter.assigneeIds } });
  if (filter.unassigned) assigneeClauses.push({ assigneeId: null });
  if (assigneeClauses.length === 1) and.push(assigneeClauses[0]);
  if (assigneeClauses.length > 1) and.push({ OR: assigneeClauses });

  return { AND: and };
}

/// El orden por prioridad tiene que ser semantico (URGENT primero), no
/// alfabetico. El enum de Postgres ya ordena por posicion de declaracion
/// (LOW < MEDIUM < HIGH < URGENT), asi que "desc" da lo esperado.
export function buildIssueOrderBy(
  filter: Pick<IssueFilter, "orderBy" | "direction">,
): Prisma.IssueOrderByWithRelationInput[] {
  const { orderBy, direction } = filter;
  // Desempate por id: sin el, la paginacion por cursor puede repetir u
  // omitir filas cuando dos tienen la misma clave de orden.
  return [{ [orderBy]: direction } as Prisma.IssueOrderByWithRelationInput, { id: "asc" }];
}
