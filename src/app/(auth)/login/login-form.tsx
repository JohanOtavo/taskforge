"use client";

import { useActionState } from "react";

import { loginAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL: FormState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <Field label="Correo" htmlFor="email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Contrasena" htmlFor="password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
