"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createWorkspaceAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createWorkspaceAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <Field
        label="Nombre del espacio"
        htmlFor="workspace-name"
        hint="El nombre de tu equipo o empresa. Podras cambiarlo despues."
      >
        <Input name="name" required minLength={2} maxLength={120} autoFocus />
      </Field>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando..." : "Crear espacio de trabajo"}
      </Button>
    </form>
  );
}
