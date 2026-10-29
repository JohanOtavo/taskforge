/// Modulo PURO. Los permisos tienen nombre; los roles NO se comparan en
/// linea. Sin esta tabla, `role === "ADMIN" || role === "OWNER"` acaba
/// repartido por 40 sitios y uno de ellos se olvida.

import { atLeast, type EffectiveRole } from "./roles";

export type Permission =
  // organizacion
  | "org.read"
  | "org.update"
  | "org.delete"
  | "org.member.invite"
  | "org.member.update"
  | "org.member.remove"
  | "org.audit.read"
  | "org.label.manage"
  // proyecto
  | "project.read"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.member.manage"
  | "project.column.manage"
  // issue
  | "issue.read"
  | "issue.create"
  | "issue.update"
  | "issue.move"
  | "issue.assign"
  | "issue.delete"
  // comentario
  | "comment.read"
  | "comment.create"
  | "comment.delete.any";

/// Rol minimo exigido por permiso.
export const MIN_ROLE: Record<Permission, EffectiveRole> = {
  "org.read": "VIEWER",
  "org.update": "ADMIN",
  "org.delete": "OWNER",
  "org.member.invite": "ADMIN",
  "org.member.update": "ADMIN",
  "org.member.remove": "ADMIN",
  "org.audit.read": "ADMIN",
  "org.label.manage": "MEMBER",

  "project.read": "VIEWER",
  "project.create": "MEMBER",
  "project.update": "ADMIN",
  "project.delete": "ADMIN",
  "project.member.manage": "ADMIN",
  "project.column.manage": "ADMIN",

  "issue.read": "VIEWER",
  "issue.create": "MEMBER",
  "issue.update": "MEMBER",
  "issue.move": "MEMBER",
  "issue.assign": "MEMBER",
  "issue.delete": "ADMIN",

  "comment.read": "VIEWER",
  "comment.create": "MEMBER",
  "comment.delete.any": "ADMIN",
};

export function can(role: EffectiveRole, permission: Permission): boolean {
  return atLeast(role, MIN_ROLE[permission]);
}

export const ALL_PERMISSIONS = Object.keys(MIN_ROLE) as Permission[];
