/// Barrido periodico. Pensado para un cron (una vez al dia basta):
///
///   npm run db:prune
///
/// Se deja como script y no como ruta HTTP a proposito: un endpoint de
/// mantenimiento es una superficie publica mas que hay que autenticar.
import { pruneExpiredSessions, pruneOldNotifications, pruneProjectEvents } from "@/server/realtime/retention";

const events = await pruneProjectEvents();
const sessions = await pruneExpiredSessions();
const notifications = await pruneOldNotifications();

console.log(
  `Eventos borrados: ${events.deleted} (${events.batches} lotes). Sesiones caducadas: ${sessions}. Avisos: ${notifications}.`,
);

process.exit(0);
