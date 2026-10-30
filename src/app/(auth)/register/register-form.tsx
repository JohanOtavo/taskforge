"use client";

import { useActionState } from "react";

import { registerAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL: FormState = {};

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(registerAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <Field label="Tu nombre" htmlFor="name" error={state.fieldErrors?.name}>
        <Input name="name" autoComplete="name" required />
      </Field>

      <Field label="Correo" htmlFor="email" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field
        label="Contrasena"
        htmlFor="password"
        hint="Minimo 12 caracteres. Una frase larga es mejor que un simbolo raro."
        error={state.fieldErrors?.password}
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      <Field
        label="Espacio de trabajo (opcional)"
        htmlFor="orgName"
        hint="Dejalo vacio si te han invitado a uno."
        error={state.fieldErrors?.orgName}
      >
        <Input name="orgName" />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando..." : "Crear cuenta"}
      </Button>
    </form>
  );
}
