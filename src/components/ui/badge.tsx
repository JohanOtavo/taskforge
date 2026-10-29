import { cn } from "@/lib/cn";
import type { IssuePriority, IssueType } from "@prisma/client";

const LABEL_COLOR_VAR: Record<string, string> = {
  slate: "var(--label-slate)",
  red: "var(--label-red)",
  amber: "var(--label-amber)",
  green: "var(--label-green)",
  teal: "var(--label-teal)",
  blue: "var(--label-blue)",
  violet: "var(--label-violet)",
  pink: "var(--label-pink)",
};

/// El color llega como nombre de una paleta cerrada y se traduce a una
/// variable CSS. Nunca se interpola una cadena del usuario en `style`.
export function LabelChip({ name, color }: { name: string; color: string }) {
  const value = LABEL_COLOR_VAR[color] ?? LABEL_COLOR_VAR.slate;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: value }}
    >
      {name}
    </span>
  );
}

const TYPE_TEXT: Record<IssueType, string> = {
  EPIC: "Epica",
  STORY: "Historia",
  TASK: "Tarea",
  BUG: "Bug",
};

const TYPE_STYLE: Record<IssueType, string> = {
  EPIC: "text-[var(--label-violet)]",
  STORY: "text-[var(--label-green)]",
  TASK: "text-[var(--label-blue)]",
  BUG: "text-[var(--label-red)]",
};

export function TypeBadge({ type }: { type: IssueType }) {
  return (
    <span className={cn("text-[11px] font-semibold uppercase", TYPE_STYLE[type])}>
      {TYPE_TEXT[type]}
    </span>
  );
}

const PRIORITY_TEXT: Record<IssuePriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

/// La prioridad no se comunica solo por color: lleva flecha y texto, porque
/// quien no distingue rojo de verde tambien tiene que poder leerla.
const PRIORITY_MARK: Record<IssuePriority, string> = {
  LOW: "↓",
  MEDIUM: "→",
  HIGH: "↑",
  URGENT: "⇈",
};

const PRIORITY_STYLE: Record<IssuePriority, string> = {
  LOW: "text-text-muted",
  MEDIUM: "text-[var(--label-blue)]",
  HIGH: "text-[var(--label-amber)]",
  URGENT: "text-[var(--label-red)]",
};

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] font-medium", PRIORITY_STYLE[priority])}
      title={`Prioridad ${PRIORITY_TEXT[priority]}`}
    >
      <span aria-hidden>{PRIORITY_MARK[priority]}</span>
      {PRIORITY_TEXT[priority]}
    </span>
  );
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-text-muted"
      style={{ width: size, height: size }}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}
