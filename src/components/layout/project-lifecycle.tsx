"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveProjectAction,
  deleteProjectAction,
  restoreProjectAction,
} from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import type { Result } from "@/server/errors";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<Result<unknown>>, after: () => void = () => router.refresh()) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message);
      else after();
    });
  }

  return { error, pending, run, router };
}

/// En la cabecera del tablero. Archivar es reversible, asi que basta un aviso.
export function ArchiveProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const { error, pending, run, router } = useRun();

  function onArchive() {
    const ok = window.confirm(
      `¿Archivar "${name}"? Desaparecerá de la portada con todas sus tarjetas. Podrás restaurarlo desde "Proyectos archivados".`,
    );
    if (ok) run(() => archiveProjectAction(projectId), () => router.push("/"));
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
      <Button variant="ghost" size="sm" disabled={pending} onClick={onArchive}>
        {pending ? "Archivando..." : "Archivar proyecto"}
      </Button>
    </span>
  );
}

type ArchivedProject = {
  id: string;
  key: string;
  name: string;
  canRestore: boolean;
  canDelete: boolean;
};

export function ArchivedProjectActions({ project }: { project: ArchivedProject }) {
  const { error, pending, run } = useRun();

  function onDelete() {
    // Escribir la clave obliga a leer que proyecto se borra; el servidor lo
    // vuelve a comprobar.
    const typed = window.prompt(
      `Eliminar "${project.name}" borra para siempre sus tarjetas, comentarios y fases. No se puede deshacer.\n\nEscribe ${project.key} para confirmar:`,
    );
    if (typed === null) return;
    run(() => deleteProjectAction(project.id, typed));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
      {project.canRestore && (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => restoreProjectAction(project.id))}
        >
          Restaurar
        </Button>
      )}
      {project.canDelete && (
        <Button variant="danger" size="sm" disabled={pending} onClick={onDelete}>
          Eliminar
        </Button>
      )}
    </div>
  );
}
