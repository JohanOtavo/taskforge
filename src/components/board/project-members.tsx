"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addProjectMemberAction,
  inviteMemberAction,
  removeProjectMemberAction,
} from "@/app/(app)/actions";
import { Avatar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { ProjectRole } from "@prisma/client";

type Person = { id: string; name: string; email: string };

type Props = {
  projectId: string;
  orgId: string;
  members: (Person & { role: ProjectRole })[];
  candidates: Person[];
  canManage: boolean;
};

const ROLE_TEXT: Record<ProjectRole, string> = {
  ADMIN: "Administrador",
  MEMBER: "Miembro",
  VIEWER: "Observador",
};

export function ProjectMembers({ projectId, orgId, members, candidates, canManage }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Miembros ({members.length})
      </Button>
    );
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "La operacion ha fallado.");
      else router.refresh();
    });
  }

  /// Invitar por correo al TABLERO. Quien ya tiene cuenta entra en el acto;
  /// quien no, recibe un enlace que le mete en la organizacion y en este
  /// tablero de una vez.
  function onInvite(formData: FormData) {
    setError(null);
    setNotice(null);
    setInviteUrl(null);

    startTransition(async () => {
      const result = await inviteMemberAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data.kind === "added") {
        setNotice(`${result.data.name} ya tenia cuenta y se ha anadido al tablero.`);
      } else {
        // El enlace se muestra SIEMPRE, tambien cuando el correo salio: que el
        // proveedor acepte el envio no garantiza que llegue al buzon (Gmail
        // retiene a veces sin rebote), y quien invita necesita un plan B.
        setInviteUrl(result.data.url);
        setNotice(
          result.data.emailed
            ? `Invitacion enviada por correo a ${result.data.email}. Si no le llega, pasale este enlace:`
            : `Invitacion creada para ${result.data.email}. Pasale este enlace:`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Miembros del tablero</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-success">{notice}</p>}
      {inviteUrl && (
        <code className="block overflow-x-auto rounded-md bg-surface-2 p-2 text-xs">
          {inviteUrl}
        </code>
      )}

      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 py-2">
            <Avatar name={member.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{member.name}</p>
              <p className="truncate text-xs text-text-muted">{member.email}</p>
            </div>
            <span className="text-xs text-text-muted">{ROLE_TEXT[member.role]}</span>
            {canManage && (
              <form action={(data) => run(() => removeProjectMemberAction(data))}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="userId" value={member.id} />
                <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                  Quitar
                </Button>
              </form>
            )}
          </li>
        ))}
        {members.length === 0 && (
          <li className="py-2 text-sm text-text-muted">
            Nadie anadido explicitamente. En un tablero de la organizacion todos pueden verlo.
          </li>
        )}
      </ul>

      {canManage && candidates.length > 0 && (
        <form
          action={(data) => run(() => addProjectMemberAction(data))}
          className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="min-w-48 flex-1">
            <Field label="Anadir del equipo" htmlFor="pm-user">
              <Select name="userId" required>
                {candidates.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.email})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-36">
            <Field label="Rol" htmlFor="pm-role">
              <Select name="role" defaultValue="MEMBER">
                <option value="ADMIN">Administrador</option>
                <option value="MEMBER">Miembro</option>
                <option value="VIEWER">Observador</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            Anadir
          </Button>
        </form>
      )}

      {canManage && (
        <form onSubmit={undefined} action={onInvite} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="projectId" value={projectId} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field
                label="Invitar por correo"
                htmlFor="pm-email"
                hint="Si ya tiene cuenta, entra al instante."
              >
                <Input name="email" type="email" required placeholder="persona@empresa.com" />
              </Field>
            </div>
            <div className="w-36">
              <Field label="Rol en el tablero" htmlFor="pm-invite-role">
                <Select name="projectRole" defaultValue="MEMBER">
                  <option value="ADMIN">Administrador</option>
                  <option value="MEMBER">Miembro</option>
                  <option value="VIEWER">Observador</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "..." : "Invitar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
