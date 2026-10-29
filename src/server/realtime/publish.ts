import "server-only";

import { Prisma } from "@prisma/client";

import type { TxClient } from "../db";
import { BOARD_CHANNEL, type BoardEventType } from "./events";

/// Escribe el evento y despierta a los oyentes, dentro de la MISMA
/// transaccion que la mutacion.
///
/// `pg_notify` es transaccional: la notificacion se entrega al hacer commit,
/// nunca antes. Por eso puede ir dentro de la transaccion sin riesgo de
/// avisar de un cambio que luego se deshace.
///
/// La carga de `NOTIFY` es solo el projectId (hay un limite de 8000 bytes y
/// el pooler puede truncar). Los suscriptores leen los eventos nuevos de
/// `ProjectEvent` por numero de secuencia, asi que el orden y la integridad
/// los garantiza la base de datos, no el canal.
export async function publishBoardEvent(
  db: TxClient,
  input: {
    projectId: string;
    type: BoardEventType;
    entityId: string;
    payload: Prisma.InputJsonValue;
    actorId: string | null;
  },
): Promise<void> {
  await db.projectEvent.create({
    data: {
      projectId: input.projectId,
      type: input.type,
      entityId: input.entityId,
      payload: input.payload,
      actorId: input.actorId,
    },
  });

  await db.$executeRaw(
    Prisma.sql`SELECT pg_notify(${BOARD_CHANNEL}, ${input.projectId})`,
  );
}
