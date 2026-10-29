"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL: FormState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-text-muted">Accede a tus tableros.</p>

      <form action={action} className="space-y-4">
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

      <p className="mt-6 text-center text-sm text-text-muted">
        No tienes cuenta?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Crear cuenta
        </Link>
      </p>
    </>
  );
}
