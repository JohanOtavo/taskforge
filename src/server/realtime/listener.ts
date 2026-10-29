import "server-only";

import { Client } from "pg";

import { BOARD_CHANNEL } from "./events";

/// UN solo cliente `pg` por proceso, escuchando UN solo canal.
///
/// La alternativa obvia (un `LISTEN` por peticion SSE) agota Postgres: 100
/// usuarios conectados son 100 conexiones fijas, mas el pool de Prisma, por
/// replica, contra un `max_connections` de 100 por defecto. Aqui el reparto a
/// los suscriptores es en memoria y cuesta cero conexiones.
///
/// La conexion usa DATABASE_URL_DIRECT: LISTEN/NOTIFY no funciona a traves de
/// un pooler en modo transaccion (PgBouncer transaction, Supabase 6543, Neon
/// -pooler). La conexion se entrega a otro cliente entre sentencias y las
/// notificaciones se pierden sin error alguno.

type Subscriber = {
  projectId: string;
  onWake: () => void;
  onResync: () => void;
};

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;
/// Sin nadie mirando ningun tablero, la conexion del oyente se cierra. Una
/// base de datos serverless (Neon, Aurora Serverless) no suspende su computo
/// mientras haya UNA conexion abierta, asi que un oyente eterno gasta la
/// cuota gratuita las 24 horas aunque nadie use la aplicacion. El margen
/// evita abrir y cerrar la conexion en cada recarga de pagina.
const IDLE_CLOSE_MS = 60_000;

class BoardListener {
  private client: Client | null = null;
  private attempts = 0;
  private closed = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly byProject = new Map<string, Set<Subscriber>>();

  subscribe(subscriber: Subscriber): () => void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    let set = this.byProject.get(subscriber.projectId);
    if (!set) {
      set = new Set();
      this.byProject.set(subscriber.projectId, set);
    }
    set.add(subscriber);

    void this.ensureConnected();

    return () => {
      const current = this.byProject.get(subscriber.projectId);
      if (!current) return;
      current.delete(subscriber);
      if (current.size === 0) this.byProject.delete(subscriber.projectId);
      if (this.byProject.size === 0) this.scheduleIdleClose();
    };
  }

  private scheduleIdleClose(): void {
    if (this.idleTimer || !this.client) return;

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      // Alguien volvio a suscribirse mientras corria el temporizador.
      if (this.byProject.size > 0 || !this.client) return;
      const previous = this.client;
      this.client = null;
      // Sin quitar los manejadores, el `end` provocado aqui entraria en
      // handleDisconnect y programaria una reconexion que nadie necesita.
      previous.removeAllListeners();
      void previous.end().catch(() => undefined);
    }, IDLE_CLOSE_MS);
    this.idleTimer.unref?.();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client || this.closed) return;

    const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
    if (!connectionString) {
      console.error("[realtime] falta DATABASE_URL_DIRECT; el tiempo real queda inactivo");
      return;
    }

    const client = new Client({ connectionString, application_name: "taskforge-listener" });
    this.client = client;

    client.on("notification", (message) => {
      if (message.channel !== BOARD_CHANNEL || !message.payload) return;
      const set = this.byProject.get(message.payload);
      if (!set) return;
      for (const subscriber of set) subscriber.onWake();
    });

    // Un oyente muerto falla EN SILENCIO: el tablero simplemente deja de
    // actualizarse. Neon y Aurora suspenden conexiones inactivas, asi que
    // esto pasa en produccion, no en teoria.
    client.on("error", (error) => {
      console.error("[realtime] error en el oyente", error);
      this.handleDisconnect();
    });
    client.on("end", () => this.handleDisconnect());

    try {
      await client.connect();
      await client.query(`LISTEN ${BOARD_CHANNEL}`);
      this.attempts = 0;
      // Tras reconectar se pudieron perder notificaciones; los suscriptores
      // comparan su cursor contra la base de datos y recuperan lo que falte.
      for (const set of this.byProject.values()) {
        for (const subscriber of set) subscriber.onResync();
      }
    } catch (error) {
      console.error("[realtime] fallo al conectar el oyente", error);
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    if (this.closed) return;
    if (this.client) {
      const previous = this.client;
      this.client = null;
      previous.removeAllListeners();
      void previous.end().catch(() => undefined);
    }

    if (this.byProject.size === 0) return;

    this.attempts += 1;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.attempts - 1), RECONNECT_MAX_MS);
    setTimeout(() => void this.ensureConnected(), delay).unref?.();
  }
}

/// Cacheado en globalThis: sin esto el HMR de Next crea un oyente nuevo en
/// cada edicion y los antiguos siguen con su conexion abierta.
const globalForListener = globalThis as unknown as { boardListener?: BoardListener };

export const boardListener = (globalForListener.boardListener ??= new BoardListener());
