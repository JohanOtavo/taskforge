"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createIssueAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { LabelChip } from "@/components/ui/badge";

type Props = {
  projectId: string;
  columns: { id: string; name: string }[];
  members: { id: string; name: string; email: string }[];
  labels: { id: string; name: string; color: string }[];
};

export function NewIssueForm({ projectId, columns, members, labels }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  if (!open) return <Button onClick={() => setOpen(true)}>Nuevo issue</Button>;

  function onSubmit(formData: FormData) {
    setError(null);
    const storyPoints = formData.get("storyPoints");
    const assigneeId = formData.get("assigneeId");

    startTransition(async () => {
      const result = await createIssueAction({
        projectId,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || undefined,
        type: formData.get("type"),
        priority: formData.get("priority"),
        columnId: String(formData.get("columnId") ?? "") || undefined,
        assigneeId: assigneeId ? String(assigneeId) : null,
        storyPoints: storyPoints ? Number(storyPoints) : null,
        labelIds: selectedLabels,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setSelectedLabels([]);
      router.refresh();
    });
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <Field label="Titulo" htmlFor="issue-title">
        <Input name="title" required minLength={3} maxLength={240} />
      </Field>

      <Field label="Descripcion" htmlFor="issue-description">
        <Textarea name="description" maxLength={20000} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="issue-type">
          <Select name="type" defaultValue="TASK">
            <option value="TASK">Tarea</option>
            <option value="BUG">Bug</option>
            <option value="STORY">Historia</option>
            <option value="EPIC">Epica</option>
          </Select>
        </Field>

        <Field label="Prioridad" htmlFor="issue-priority">
          <Select name="priority" defaultValue="MEDIUM">
            <option value="LOW">Baja</option>
            <option value="MEDIUM">Media</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </Select>
        </Field>

        <Field label="Columna" htmlFor="issue-column">
          <Select name="columnId" defaultValue={columns[0]?.id ?? ""}>
            <option value="">Backlog</option>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Asignar a" htmlFor="issue-assignee">
          <Select name="assigneeId" defaultValue="">
            <option value="">Sin asignar</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Puntos" htmlFor="issue-points">
          <Input name="storyPoints" type="number" min={0} max={100} />
        </Field>
      </div>

      {labels.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Etiquetas</legend>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
              const checked = selectedLabels.includes(label.id);
              return (
                <label
                  key={label.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setSelectedLabels((current) =>
                        event.target.checked
                          ? [...current, label.id]
                          : current.filter((id) => id !== label.id),
                      )
                    }
                  />
                  <LabelChip name={label.name} color={label.color} />
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando..." : "Crear issue"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
