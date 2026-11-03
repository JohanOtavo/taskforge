import Link from "next/link";

import { cn } from "@/lib/cn";

type Props = {
  projectKey: string;
  phases: { id: string; name: string; issueCount: number }[];
  unphasedCount: number;
  totalCount: number;
  /// undefined = todas; null = sin fase; un id = esa fase.
  selected: string | null | undefined;
  canManage: boolean;
};

/// Selector de fase. Va en la URL (?fase=) y no en estado de React: se puede
/// compartir, sobrevive a recargar y el boton de atras funciona.
export function PhaseBar({
  projectKey,
  phases,
  unphasedCount,
  totalCount,
  selected,
  canManage,
}: Props) {
  // Sin fases y sin poder crearlas, la barra solo diria "Todas".
  if (phases.length === 0 && !canManage) return null;

  const base = `/p/${projectKey}`;
  const items = [
    { key: "all", href: base, label: "Todas", count: totalCount, active: selected === undefined },
    ...phases.map((phase) => ({
      key: phase.id,
      href: `${base}?fase=${phase.id}`,
      label: phase.name,
      count: phase.issueCount,
      active: selected === phase.id,
    })),
    ...(phases.length > 0
      ? [
          {
            key: "none",
            href: `${base}?fase=sin`,
            label: "Sin fase",
            count: unphasedCount,
            active: selected === null,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Fases" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex items-center gap-1.5 pb-1">
        {items.map((item) => (
          <li key={item.key} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                item.active
                  ? "border-accent bg-accent font-medium text-accent-text"
                  : "border-border bg-surface/80 text-text-muted hover:border-accent/60 hover:text-text",
              )}
            >
              {item.label}
              <span className="text-xs tabular-nums opacity-80">{item.count}</span>
            </Link>
          </li>
        ))}
        {canManage && (
          <li className="shrink-0">
            <Link
              href={`${base}/phases`}
              className="rounded-full px-3 py-1.5 text-sm text-text-muted hover:text-accent"
            >
              {phases.length > 0 ? "Gestionar fases" : "Crear fases"}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
