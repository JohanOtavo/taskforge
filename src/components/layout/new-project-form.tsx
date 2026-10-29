"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createProjectAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function NewProjectForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Nuevo proyecto</Button>;
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createProjectAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.push(`/p/${result.data.key}`);
    });
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <input type="hidden" name="orgId" value={orgId} />

      <Field label="Nombre" htmlFor="project-name">
        <Input name="name" required maxLength={120} />
      </Field>

      <Field
        label="Clave"
        htmlFor="project-key"
        hint="2 a 10 letras o digitos, empezando por letra. Se usara como TF-1, TF-2..."
      >
        <Input name="key" required placeholder="TF" className="font-mono uppercase" />
      </Field>

      <Field label="Visibilidad" htmlFor="project-visibility">
        <Select name="visibility" defaultValue="ORG">
          <option value="ORG">Toda la organizacion</option>
          <option value="PRIVATE">Solo miembros invitados</option>
        </Select>
      </Field>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando..." : "Crear"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
