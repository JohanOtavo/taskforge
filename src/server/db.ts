import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";

/// Singleton. Sin esto, el HMR de Next crea un cliente nuevo por cada edicion
/// y agota `max_connections` de Postgres en una tarde de desarrollo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/// Cliente completo: lo reciben los servicios, que son quienes abren la
/// transaccion.
export type DbClient = PrismaClient;

/// Cliente DENTRO de una transaccion interactiva. Todo lo que se ejecuta
/// dentro de una transaccion (auditoria, publicacion de eventos, lectura de
/// vecinos) se tipa asi, y `DbClient` es asignable a este tipo: los tests
/// pueden pasar una transaccion y deshacerla al terminar.
export type TxClient = Prisma.TransactionClient;
