"use client";

import { useState, useTransition, type FormEvent } from "react";

import {
  changePasswordAction,
  closeOtherSessionsAction,
  updateNotificationPrefsAction,
  updateProfileAction,
} from "@/app/(app)/account-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Result } from "@/server/errors";

/// Enviar, mostrar el resultado y evitar el doble clic: lo unico que comparten
/// todos los formularios de la cuenta.
///
/// `onSubmit` y no `action`: React vacia el formulario al acabar una `action`,
/// y una contrasena actual mal escrita borraria tambien la nueva.
function useSubmit(successMessage: string) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(action: () => Promise<Result<unknown>>, onDone?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(successMessage);
      onDone?.();
    });
  }

  function onSubmit(action: (data: FormData) => Promise<Result<unknown>>, resetOnDone = false) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submit(() => action(data), resetOnDone ? () => form.reset() : undefined);
    };
  }

  return { error, notice, pending, submit, onSubmit };
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-success" role="status">
          {notice}
        </p>
      )}
    </>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const { error, notice, pending, onSubmit } = useSubmit("Perfil guardado.");

  return (
    <form onSubmit={onSubmit(updateProfileAction)} className="space-y-4">
      <Field label="Nombre" htmlFor="profile-name" hint="Es como te ve tu equipo.">
        <Input name="name" defaultValue={name} autoComplete="name" required maxLength={120} />
      </Field>
      <Feedback error={error} notice={notice} />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { error, notice, pending, onSubmit } = useSubmit(
    hasPassword
      ? "Contraseña cambiada. Se han cerrado tus demás sesiones."
      : "Contraseña creada. Ya puedes entrar también con ella.",
  );

  return (
    <form onSubmit={onSubmit(changePasswordAction, true)} className="space-y-4">
      {hasPassword && (
        <Field label="Contraseña actual" htmlFor="current-password">
          <Input name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <Field
        label={hasPassword ? "Contraseña nueva" : "Contraseña"}
        htmlFor="new-password"
        hint="Mínimo 12 caracteres. Una frase larga es mejor que un símbolo raro."
      >
        <Input name="newPassword" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <Feedback error={error} notice={notice} />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : hasPassword ? "Cambiar contraseña" : "Crear contraseña"}
      </Button>
    </form>
  );
}

export function CloseSessionsButton() {
  const { error, notice, pending, submit } = useSubmit("Se han cerrado tus demás sesiones.");

  return (
    <div className="space-y-3">
      <Feedback error={error} notice={notice} />
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => submit(closeOtherSessionsAction)}
      >
        {pending ? "Cerrando..." : "Cerrar las demás sesiones"}
      </Button>
    </div>
  );
}

type Prefs = { notifyAssigned: boolean; notifyComments: boolean; notifyMembership: boolean };

const PREF_TEXT: { name: keyof Prefs; label: string }[] = [
  { name: "notifyAssigned", label: "Cuando me asignan una tarjeta" },
  { name: "notifyComments", label: "Cuando comentan en mis tarjetas" },
  { name: "notifyMembership", label: "Cuando me añaden a un equipo o aceptan mi invitación" },
];

export function NotificationPrefsForm({ prefs }: { prefs: Prefs }) {
  const { error, notice, pending, onSubmit } = useSubmit("Preferencias guardadas.");

  return (
    <form onSubmit={onSubmit(updateNotificationPrefsAction)} className="space-y-4">
      <div className="space-y-3">
        {PREF_TEXT.map((pref) => (
          <label key={pref.name} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name={pref.name}
              defaultChecked={prefs[pref.name]}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {pref.label}
          </label>
        ))}
      </div>
      <Feedback error={error} notice={notice} />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
