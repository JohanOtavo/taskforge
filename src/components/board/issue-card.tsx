"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { MessageSquare } from "lucide-react";

import { Avatar, LabelChip, PriorityBadge, TypeBadge } from "@/components/ui/badge";
import { Tilt } from "@/components/ui/tilt";
import { cn } from "@/lib/cn";

import type { BoardIssue } from "./types";

type Props = {
  issue: BoardIssue;
  projectKey: string;
  draggable: boolean;
  /// Para escalonar la entrada: cada tarjeta aparece un poco despues que la
  /// anterior, lo que lee como "la columna se monta" en vez de "todo salta".
  index: number;
};

/// A partir de esta distancia el puntero arrastra en vez de pulsar. Lo comparten
/// el sensor de dnd-kit del tablero y el clic que abre la tarjeta.
export const DRAG_DISTANCE_PX = 6;

export function IssueCard({ issue, projectKey, draggable, index }: Props) {
  const router = useRouter();
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled: !draggable,
  });
  const href = `/p/${projectKey}/${issue.number}`;

  /// Pulsar en cualquier parte abre la tarjeta. Un arrastre tambien acaba en
  /// `click` al soltar, asi que se descarta si el puntero se movio lo bastante
  /// como para que dnd-kit lo tomara por arrastre.
  function onClick(event: React.MouseEvent<HTMLLIElement>) {
    // El enlace de la clave ya navega por su cuenta.
    if ((event.target as Element).closest("a")) return;
    const start = pressedAt.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_DISTANCE_PX) {
      return;
    }
    router.push(href);
  }

  return (
    <li
      ref={setNodeRef}
      className={cn("rise-in", isDragging && "z-20", !draggable && "cursor-pointer")}
      // Fase de captura: `listeners` de dnd-kit ya ocupa onPointerDown.
      onPointerDownCapture={(event) => {
        pressedAt.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={onClick}
      style={{
        // dnd-kit mueve la tarjeta; la inclinacion vive en el hijo para que
        // las dos transformaciones no se pisen.
        transform: CSS.Translate.toString(transform),
        transition,
        // Se corta el escalonado a 10: a partir de ahi la espera se nota.
        animationDelay: `${Math.min(index, 10) * 40}ms`,
      }}
      {...attributes}
      {...listeners}
    >
      <Tilt
        disabled={isDragging}
        data-priority={issue.priority}
        className={cn(
          "slab heat rounded-xl p-3 pt-3.5",
          draggable && "cursor-grab active:cursor-grabbing",
          // Al arrastrar se despega de verdad: sube en Z, gira un poco y
          // proyecta la sombra mas larga de la escala.
          isDragging &&
            "scale-[1.03] rotate-[1.5deg] lift-3 ring-1 ring-accent/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <TypeBadge type={issue.type} />
          <Link
            href={`/p/${projectKey}/${issue.number}`}
            className="font-mono text-[11px] text-text-muted transition-colors hover:text-accent"
            // El enlace no debe iniciar un arrastre.
            onPointerDown={(event) => event.stopPropagation()}
          >
            {projectKey}-{issue.number}
          </Link>
        </div>

        <p className="mt-1.5 text-sm font-medium leading-snug">{issue.title}</p>

        {issue.labels.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {issue.labels.map(({ label }) => (
              <li key={label.id}>
                <LabelChip name={label.name} color={label.color} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2.5 flex items-center gap-3">
          <PriorityBadge priority={issue.priority} />

          {issue.storyPoints !== null && (
            <span
              className="rounded bg-surface-2 px-1.5 text-[11px] text-text-muted"
              title={`${issue.storyPoints} puntos de historia`}
            >
              {issue.storyPoints}
            </span>
          )}

          {issue._count.comments > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <MessageSquare aria-hidden className="h-3 w-3" />
              <span className="sr-only">Comentarios:</span>
              {issue._count.comments}
            </span>
          )}

          {issue.assignee && (
            <span className="ml-auto">
              <Avatar name={issue.assignee.name} size={20} />
            </span>
          )}
        </div>
      </Tilt>
    </li>
  );
}
