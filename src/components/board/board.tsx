"use client";

import {
  DndContext,
  useDroppable,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { can } from "@/server/authz/permissions";

import { IssueCard } from "./issue-card";
import type { BoardColumnData, BoardData } from "./types";
import { useBoardStream } from "./use-board-stream";

type Props = BoardData;

export function Board({ project, columns: initialColumns, role }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const status = useBoardStream(project.id);
  const canMove = can(role, "issue.move");

  // El servidor es la fuente de verdad: cuando el componente de servidor se
  // vuelve a renderizar (por SSE o por revalidacion), el estado local se
  // alinea con el suyo.
  //
  // El ajuste se hace DURANTE el render, no en un efecto: un setState dentro
  // de useEffect provoca un render en cascada y un parpadeo del tablero.
  const [lastServerColumns, setLastServerColumns] = useState(initialColumns);
  if (lastServerColumns !== initialColumns) {
    setLastServerColumns(initialColumns);
    setColumns(initialColumns);
  }

  const sensors = useSensors(
    // 6 px de holgura: sin ella, un clic en el enlace del issue se interpreta
    // como arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function columnOf(issueId: string): BoardColumnData | undefined {
    return columns.find((column) => column.issues.some((issue) => issue.id === issueId));
  }

  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const from = columnOf(activeId);
    // El objetivo puede ser una tarjeta o la columna vacia.
    const to = columnOf(overId) ?? columns.find((column) => column.id === overId);
    if (!from || !to) return;

    const issue = from.issues.find((candidate) => candidate.id === activeId);
    if (!issue) return;

    const target = to.issues.filter((candidate) => candidate.id !== activeId);
    const overIndex = target.findIndex((candidate) => candidate.id === overId);
    const insertAt = overIndex === -1 ? target.length : overIndex;

    // Intencion, no posicion: el servidor calcula la clave entre estos dos
    // vecinos. Una posicion calculada aqui, sobre un estado que puede estar
    // obsoleto, corrompe el orden sin que el servidor lo note.
    const afterId = insertAt > 0 ? target[insertAt - 1].id : null;
    const beforeId = insertAt < target.length ? target[insertAt].id : null;

    setColumns(
      columns.map((column) => {
        if (column.id === from.id && column.id === to.id) {
          const next = [...target];
          next.splice(insertAt, 0, issue);
          return { ...column, issues: next };
        }
        if (column.id === from.id) {
          return { ...column, issues: column.issues.filter((c) => c.id !== activeId) };
        }
        if (column.id === to.id) {
          const next = [...target];
          next.splice(insertAt, 0, issue);
          return { ...column, issues: next };
        }
        return column;
      }),
    );
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}/issues/${activeId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toColumnId: to.id, afterId, beforeId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        // Se recarga desde el servidor en vez de restaurar una instantanea:
        // entre el gesto y el rechazo puede haber llegado trabajo de otra
        // persona, y volver a la foto anterior lo borraria de la pantalla.
        setError(payload?.error ?? "No se ha podido mover la tarjeta.");
        router.refresh();
        return;
      }
    } catch {
      setError("Sin conexion con el servidor. La tarjeta no se ha movido.");
      router.refresh();
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StreamIndicator status={status} />
        {error && (
          <p className="rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <DndContext
        id="taskforge-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event: DragStartEvent) => setDragging(String(event.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              projectKey={project.key}
              canMove={canMove}
              isDragActive={dragging !== null}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  column,
  projectKey,
  canMove,
  isDragActive,
}: {
  column: BoardColumnData;
  projectKey: string;
  canMove: boolean;
  isDragActive: boolean;
}) {
  const overLimit = column.wipLimit !== null && column.issues.length > column.wipLimit;
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      className={cn(
        "scene flex w-72 shrink-0 flex-col rounded-2xl border border-border",
        "bg-surface-2/50 transition-colors duration-200",
        isOver && "border-accent/60 bg-surface-2",
      )}
      aria-label={column.name}
    >
      <header className="flex items-center gap-2 px-3.5 py-3">
        <h2 className="text-sm font-semibold tracking-tight">{column.name}</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
            overLimit ? "bg-danger/15 text-danger" : "bg-surface text-text-muted",
          )}
        >
          {column.issues.length}
          {column.wipLimit !== null && `/${column.wipLimit}`}
        </span>
        {overLimit && (
          <span className="text-[11px] font-medium text-danger">Limite excedido</span>
        )}
      </header>

      <SortableContext
        id={column.id}
        items={column.issues.map((issue) => issue.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={cn(
            "flex min-h-28 flex-1 flex-col gap-2.5 px-2.5 pb-3",
            "rounded-b-2xl transition-colors duration-200",
            isDragActive && "outline-1 outline-dashed outline-border",
            isOver && "outline-accent",
          )}
          data-column-id={column.id}
        >
          {column.issues.map((issue, index) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              projectKey={projectKey}
              draggable={canMove}
              index={index}
            />
          ))}
          {column.issues.length === 0 && (
            <li
              className={cn(
                "rounded-xl border border-dashed border-border px-3 py-7 text-center text-xs",
                "transition-colors duration-200",
                isOver ? "border-accent text-accent" : "text-text-muted",
              )}
            >
              {isOver ? "Suelta aqui" : "Vacia"}
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

const STATUS_TEXT: Record<string, string> = {
  connecting: "Conectando...",
  live: "En vivo",
  offline: "Sin conexion",
};

const STATUS_STYLE: Record<string, string> = {
  connecting: "bg-[var(--label-amber)]",
  live: "bg-success",
  offline: "bg-danger",
};

function StreamIndicator({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted" aria-live="polite">
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          STATUS_STYLE[status],
          status === "live" && "pulse-ring",
        )}
      />
      {STATUS_TEXT[status]}
    </span>
  );
}
