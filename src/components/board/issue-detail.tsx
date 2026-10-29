"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveIssueAction,
  createCommentAction,
  deleteCommentAction,
  updateIssueAction,
} from "@/app/(app)/actions";
import { Avatar, LabelChip, PriorityBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { can } from "@/server/authz/permissions";
import type { EffectiveRole } from "@/server/authz/roles";
import type { IssuePriority, IssueType } from "@prisma/client";

type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; imageUrl: string | null };
};

type Issue = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: IssueType;
  priority: IssuePriority;
  storyPoints: number | null;
  dueDate: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  state: { id: string; name: string; category: string };
  column: { id: string; name: string } | null;
  reporter: { id: string; name: string; imageUrl: string | null };
  assignee: { id: string; name: string; imageUrl: string | null } | null;
  parent: { id: string; number: number; title: string; type: string } | null;
  children: { id: string; number: number; title: string; type: string }[];
  labels: { label: { id: string; name: string; color: string } }[];
  comments: Comment[];
};

type Props = {
  issue: Issue;
  projectKey: string;
  role: EffectiveRole;
  actorId: string;
  members: { id: string; name: string }[];
};

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

export function IssueDetail({ issue, projectKey, role, actorId, members }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canEdit = can(role, "issue.update");
  const canArchive = can(role, "issue.delete");
  const canComment = can(role, "comment.create");

  function onSave(formData: FormData) {
    setError(null);
    const points = formData.get("storyPoints");
    const assignee = formData.get("assigneeId");

    startTransition(async () => {
      const result = await updateIssueAction({
        issueId: issue.id,
        // La version que se vio al abrir el formulario. Si alguien guardo
        // mientras tanto, el servidor rechaza y avisa en vez de pisar.
        version: issue.version,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || null,
        type: formData.get("type"),
        priority: formData.get("priority"),
        assigneeId: assignee ? String(assignee) : null,
        storyPoints: points ? Number(points) : null,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onComment(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCommentAction({
        issueId: issue.id,
        body: String(formData.get("body") ?? ""),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function onArchive() {
    startTransition(async () => {
      const result = await archiveIssueAction(issue.id);
      if (!result.ok) setError(result.message);
      else router.push(`/p/${projectKey}`);
    });
  }

  function onDeleteComment(commentId: string) {
    startTransition(async () => {
      const result = await deleteCommentAction(commentId);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <article className="rise-in rounded-2xl border border-border bg-surface p-6 lift-1">
        {issue.archivedAt && (
          <p className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-text-muted">
            Este issue esta archivado.
          </p>
        )}

        {editing ? (
          <form action={onSave} className="space-y-4">
            <Field label="Titulo" htmlFor="detail-title">
              <Input name="title" defaultValue={issue.title} required minLength={3} />
            </Field>

            <Field label="Descripcion" htmlFor="detail-description">
              <Textarea name="description" defaultValue={issue.description ?? ""} rows={8} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo" htmlFor="detail-type">
                <Select name="type" defaultValue={issue.type}>
                  <option value="TASK">Tarea</option>
                  <option value="BUG">Bug</option>
                  <option value="STORY">Historia</option>
                  <option value="EPIC">Epica</option>
                </Select>
              </Field>

              <Field label="Prioridad" htmlFor="detail-priority">
                <Select name="priority" defaultValue={issue.priority}>
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </Select>
              </Field>

              <Field label="Asignar a" htmlFor="detail-assignee">
                <Select name="assigneeId" defaultValue={issue.assignee?.id ?? ""}>
                  <option value="">Sin asignar</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Puntos" htmlFor="detail-points">
                <Input
                  name="storyPoints"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={issue.storyPoints ?? ""}
                />
              </Field>
            </div>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando..." : "Guardar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <TypeBadge type={issue.type} />
              <PriorityBadge priority={issue.priority} />
              <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                {issue.state.name}
              </span>
              {issue.storyPoints !== null && (
                <span className="text-xs text-text-muted">{issue.storyPoints} puntos</span>
              )}
              <div className="ml-auto flex gap-2">
                {canEdit && !issue.archivedAt && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    Editar
                  </Button>
                )}
                {canArchive && !issue.archivedAt && (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={onArchive}>
                    Archivar
                  </Button>
                )}
              </div>
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{issue.title}</h1>

            {issue.labels.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1">
                {issue.labels.map(({ label }) => (
                  <li key={label.id}>
                    <LabelChip name={label.name} color={label.color} />
                  </li>
                ))}
              </ul>
            )}

            {issue.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                {issue.description}
              </p>
            ) : (
              <p className="mt-4 text-sm text-text-muted">Sin descripcion.</p>
            )}

            {error && (
              <p className="mt-4 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <dt className="text-text-muted">Reporta</dt>
                <dd className="flex items-center gap-1.5">
                  <Avatar name={issue.reporter.name} size={20} />
                  {issue.reporter.name}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-text-muted">Asignado</dt>
                <dd className="flex items-center gap-1.5">
                  {issue.assignee ? (
                    <>
                      <Avatar name={issue.assignee.name} size={20} />
                      {issue.assignee.name}
                    </>
                  ) : (
                    <span className="text-text-muted">Sin asignar</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-text-muted">Creado</dt>
                <dd>{dateFormat.format(issue.createdAt)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-text-muted">Actualizado</dt>
                <dd>{dateFormat.format(issue.updatedAt)}</dd>
              </div>
            </dl>
          </>
        )}
      </article>

      {(issue.parent || issue.children.length > 0) && (
        <section
          className="rise-in rounded-2xl border border-border bg-surface p-6 lift-1"
          style={{ animationDelay: "80ms" }}
        >
          <h2 className="mb-3 text-sm font-semibold">Jerarquia</h2>
          {issue.parent && (
            <p className="text-sm">
              <span className="text-text-muted">Padre: </span>
              <Link
                href={`/p/${projectKey}/${issue.parent.number}`}
                className="text-accent hover:underline"
              >
                {projectKey}-{issue.parent.number} {issue.parent.title}
              </Link>
            </p>
          )}
          {issue.children.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {issue.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/p/${projectKey}/${child.number}`}
                    className="text-accent hover:underline"
                  >
                    {projectKey}-{child.number}
                  </Link>{" "}
                  {child.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section
        className="rise-in rounded-2xl border border-border bg-surface p-6 lift-1"
        style={{ animationDelay: "160ms" }}
      >
        <h2 className="mb-4 text-sm font-semibold">Comentarios ({issue.comments.length})</h2>

        <ul className="space-y-4">
          {issue.comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar name={comment.author.name} size={28} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span className="font-medium text-text">{comment.author.name}</span>
                  {dateFormat.format(comment.createdAt)}
                  {(comment.author.id === actorId || can(role, "comment.delete.any")) && (
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      disabled={pending}
                      onClick={() => onDeleteComment(comment.id)}
                    >
                      Borrar
                    </button>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
              </div>
            </li>
          ))}
          {issue.comments.length === 0 && (
            <li className="text-sm text-text-muted">Todavia no hay comentarios.</li>
          )}
        </ul>

        {canComment && !issue.archivedAt && (
          <form action={onComment} className="mt-5 space-y-2">
            <Field label="Nuevo comentario" htmlFor="comment-body">
              <Textarea name="body" required maxLength={10000} rows={3} />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Enviando..." : "Comentar"}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
