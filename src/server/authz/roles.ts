/// Modulo PURO: ninguna importacion de base de datos, de Next ni de React.
/// Por eso se puede probar exhaustivamente con una tabla.

import type { OrgRole, ProjectRole } from "@prisma/client";

/// `NONE` no existe en la base de datos: es el resultado de resolver el rol
/// efectivo de alguien que no tiene acceso.
export type EffectiveRole = "NONE" | "VIEWER" | "MEMBER" | "ADMIN" | "OWNER";

export const RANK: Record<EffectiveRole, number> = {
  NONE: 0,
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function atLeast(role: EffectiveRole, minimum: EffectiveRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export type Visibility = "ORG" | "PRIVATE";

/// Regla TOTAL de resolucion. Las tres ambiguedades que resuelve, de forma
/// explicita:
///  1. Sin pertenencia a la organizacion no hay acceso, punto.
///  2. OWNER/ADMIN de la organizacion colapsan a ADMIN de proyecto y NO son
///     anulables: un admin de proyecto no puede dejar fuera al dueno.
///  3. En un proyecto ORG la fila ProjectMember SUSTITUYE al rol de la
///     organizacion (puede subir o bajar); si no existe, se hereda.
///     En un proyecto PRIVATE la fila es obligatoria.
export function effectiveProjectRole(args: {
  orgRole: OrgRole | null;
  visibility: Visibility;
  projectRole: ProjectRole | null;
}): EffectiveRole {
  const { orgRole, visibility, projectRole } = args;

  if (orgRole === null) return "NONE";
  if (orgRole === "OWNER" || orgRole === "ADMIN") return "ADMIN";
  if (visibility === "PRIVATE") return projectRole ?? "NONE";
  return projectRole ?? orgRole;
}
