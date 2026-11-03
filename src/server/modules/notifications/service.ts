import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";

import { effectiveProjectRole } from "@/server/authz/roles";
import type { DbClient, TxClient } from "@/server/db";

const MAX_LISTED = 30;

/// Que preferencia de la persona controla cada tipo de aviso.
const PREFERENCE: Record<NotificationType, "notifyAssigned" | "notifyComments" | "notifyMembership"> = {
  ISSUE_ASSIGNED: "notifyAssigned",
  ISSUE_COMMENTED: "notifyComments",
  MEMBER_ADDED: "notifyMembership",
  INVITE_ACCEPTED: "notifyMembership",
};

export type NotifyInput = {
  recipientIds: Array<string | null | undefined>;
  actorId: string;
  orgId: string;
  /// Si el aviso habla de un tablero: quien ya no puede verlo no lo recibe,
  /// porque el mensaje lleva el titulo de la tarjeta.
  projectId?: string;
  type: NotificationType;
  /// Lo que sigue al nombre de quien actua: "te asigno TF-12: Arreglar login".
  text: string;
  path: string;
};

/// Se llama DENTRO de la transaccion de la mutacion: si esta se deshace, el
/// aviso de algo que no llego a pasar se deshace con ella.
export async function notify(tx: TxClient, input: NotifyInput): Promise<void> {
  const ids = [...new Set(input.recipientIds)].filter(
    (id): id is string => Boolean(id) && id !== input.actorId,
  );
  if (ids.length === 0) return;

  const preference = PREFERENCE[input.type];
  const memberships = await tx.membership.findMany({
    where: { orgId: input.orgId, userId: { in: ids }, user: { [preference]: true } },
    select: { userId: true, role: true },
  });

  const project = input.projectId
    ? await tx.project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: {
          visibility: true,
          members: { where: { userId: { in: ids } }, select: { userId: true, role: true } },
        },
      })
    : null;

  const recipients = memberships.filter((membership) => {
    if (!project) return true;
    const projectRole =
      project.members.find((member) => member.userId === membership.userId)?.role ?? null;
    return (
      effectiveProjectRole({
        orgRole: membership.role,
        visibility: project.visibility,
        projectRole,
      }) !== "NONE"
    );
  });
  if (recipients.length === 0) return;

  const actor = await tx.user.findUniqueOrThrow({
    where: { id: input.actorId },
    select: { name: true },
  });

  await tx.notification.createMany({
    data: recipients.map((recipient) => ({
      userId: recipient.userId,
      orgId: input.orgId,
      type: input.type,
      message: `${actor.name} ${input.text}`,
      path: input.path,
    })),
  });
}

/// Solo avisos de espacios a los que la persona sigue perteneciendo: a quien
/// expulsan no le quedan titulos de tarjetas ajenas a la vista.
function visibleTo(userId: string): Prisma.NotificationWhereInput {
  return { userId, org: { archivedAt: null, memberships: { some: { userId } } } };
}

export async function listNotifications(db: DbClient, actor: { id: string }) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: visibleTo(actor.id),
      orderBy: { createdAt: "desc" },
      take: MAX_LISTED,
      select: {
        id: true,
        orgId: true,
        message: true,
        path: true,
        readAt: true,
        createdAt: true,
      },
    }),
    countUnread(db, actor),
  ]);
  return { items, unread };
}

export async function countUnread(db: DbClient, actor: { id: string }): Promise<number> {
  return db.notification.count({ where: { ...visibleTo(actor.id), readAt: null } });
}

/// El filtro por `userId` es la autorizacion: el id llega en la URL.
export async function markNotificationRead(
  db: DbClient,
  actor: { id: string },
  notificationId: string,
): Promise<void> {
  await db.notification.updateMany({
    where: { id: notificationId, userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(db: DbClient, actor: { id: string }): Promise<void> {
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}
