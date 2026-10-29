"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createLabelAction,
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/app/(app)/actions";
import { Avatar, LabelChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LABEL_COLORS } from "@/server/modules/labels/colors";
import type { OrgRole } from "@prisma/client";

type Member = { id: string; name: string; email: string; role: OrgRole };

type Props = {
  orgId: string;
  orgName: string;
  myRole: OrgRole;
  actorId: string;
  members: Member[];
  labels: { id: string; name: string; color: string }[];
  canInvite: boolean;
  canManageLabels: boolean;
};

const ROLE_TEXT: Record<OrgRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  MEMBER: "Miembro",
  VIEWER: "Observador",
};

export function MembersAdmin({
  orgId,
  orgName,
  myRole,
  actorId,
  members,
  labels,
  canInvite,
  canManageLabels,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Solo un propietario puede nombrar o degradar a otro: si un administrador
  // pudiera, se promocionaria a si mismo en dos pasos.
  const assignableRoles: OrgRole[] =
    myRole === "OWNER" ? ["OWNER", "ADMIN", "MEMBER", "VIEWER"] : ["ADMIN", "MEMBER", "VIEWER"];

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "La operacion ha fallado.");
      else router.refresh();
    });
  }

  function onInvite(formData: FormData) {
    setError(null);
    setInviteUrl(null);
    setNotice(null);
    startTransition(async () => {
      const result = await inviteMemberAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Estilo Trello: quien ya tiene cuenta entra en el acto; quien no,
      // recibe un enlace. El MVP no envia correo, asi que no hace falta un
      // patron outbox ni se arriesgan correos fantasma.
      if (result.data.kind === "added") {
        setNotice(`${result.data.name} ya tenia cuenta y se ha anadido al equipo.`);
      } else {
        setInviteUrl(result.data.url);
        setNotice(`Invitacion creada para ${result.data.email}.`);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Equipo</h1>
        <p className="text-sm text-text-muted">{orgName}</p>
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {canInvite && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Invitar</h2>
          <form action={onInvite} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="orgId" value={orgId} />
            <div className="min-w-56 flex-1">
              <Field label="Correo" htmlFor="invite-email">
                <Input name="email" type="email" required />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Rol" htmlFor="invite-role">
                <Select name="role" defaultValue="MEMBER">
                  <option value="ADMIN">Administrador</option>
                  <option value="MEMBER">Miembro</option>
                  <option value="VIEWER">Observador</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Generando..." : "Generar enlace"}
            </Button>
          </form>

          {notice && <p className="mt-3 text-sm text-success">{notice}</p>}

          {inviteUrl && (
            <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
              <p className="mb-2 text-xs text-text-muted">
                Comparte este enlace. Caduca en 7 dias, solo sirve una vez y solo lo puede usar
                esa direccion de correo.
              </p>
              <code className="block overflow-x-auto text-xs">{inviteUrl}</code>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Miembros ({members.length})</h2>
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={member.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="truncate text-xs text-text-muted">{member.email}</p>
              </div>

              {canInvite ? (
                <form
                  action={(formData) => run(() => updateMemberRoleAction(formData))}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="userId" value={member.id} />
                  <Select
                    name="role"
                    defaultValue={member.role}
                    className="h-9 w-40"
                    aria-label={`Rol de ${member.name}`}
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_TEXT[role]}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                    Guardar
                  </Button>
                </form>
              ) : (
                <span className="text-xs text-text-muted">{ROLE_TEXT[member.role]}</span>
              )}

              {canInvite && member.id !== actorId && (
                <form action={(formData) => run(() => removeMemberAction(formData))}>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="userId" value={member.id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                    Expulsar
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Etiquetas</h2>
        <ul className="mb-4 flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={label.id}>
              <LabelChip name={label.name} color={label.color} />
            </li>
          ))}
          {labels.length === 0 && <li className="text-sm text-text-muted">Sin etiquetas.</li>}
        </ul>

        {canManageLabels && (
          <form
            action={(formData) => run(() => createLabelAction(formData))}
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="orgId" value={orgId} />
            <div className="w-48">
              <Field label="Nombre" htmlFor="label-name">
                <Input name="name" required maxLength={40} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Color" htmlFor="label-color">
                <Select name="color" defaultValue="slate">
                  {LABEL_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={pending}>
              Anadir
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
