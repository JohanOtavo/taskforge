"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import {
  createPhaseAction,
  deletePhaseAction,
  movePhaseAction,
  renamePhaseAction,
} from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { Result } from "@/server/errors";

type Phase = { id: string; name: string; issueCount: number };

export function PhaseManager({ projectId, phases }: { projectId: string; phases: Phase[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<Result<unknown>>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(() => createPhaseAction(data), () => form.reset());
  }

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(() => renamePhaseAction(data));
  }

  function onDelete(phase: Phase) {
    const question =
      phase.issueCount > 0
        ? `¿Borrar la fase "${phase.name}"? Sus ${phase.issueCount} tarjetas se quedan en el tablero, sin fase.`
        : `¿Borrar la fase "${phase.name}"?`;
    if (window.confirm(question)) run(() => deletePhaseAction(phase.id));
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onCreate} className="slab flex flex-wrap items-end gap-3 rounded-xl p-4">
        <input type="hidden" name="projectId" value={projectId} />
        <label className="min-w-48 flex-1 space-y-1.5 text-sm font-medium">
          Nueva fase
          <Input name="name" required maxLength={60} placeholder="Por ejemplo: Diseño" />
        </label>
        <Button type="submit" disabled={pending}>
          Crear fase
        </Button>
      </form>

      {phases.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center text-sm text-text-muted">
          Este tablero aún no tiene fases. Crea la primera para empezar a trabajar por etapas.
        </p>
      ) : (
        <ol className="space-y-2">
          {phases.map((phase, index) => (
            <li key={phase.id} className="slab flex flex-wrap items-center gap-2 rounded-xl p-3">
              <form onSubmit={onRename} className="flex min-w-48 flex-1 items-center gap-2">
                <input type="hidden" name="phaseId" value={phase.id} />
                <Input
                  name="name"
                  defaultValue={phase.name}
                  required
                  maxLength={60}
                  aria-label={`Nombre de la fase ${index + 1}`}
                />
                <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                  Guardar
                </Button>
              </form>
              <span className="text-xs text-text-muted">
                {phase.issueCount} {phase.issueCount === 1 ? "tarjeta" : "tarjetas"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Subir ${phase.name}`}
                disabled={pending || index === 0}
                onClick={() => run(() => movePhaseAction(phase.id, "up"))}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Bajar ${phase.name}`}
                disabled={pending || index === phases.length - 1}
                onClick={() => run(() => movePhaseAction(phase.id, "down"))}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onDelete(phase)}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
