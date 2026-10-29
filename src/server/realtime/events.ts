/// Tipos de evento del tablero. Modulo puro: lo importan tanto el servidor
/// como el cliente.

export const BOARD_CHANNEL = "taskforge_board";

export type BoardEventType =
  | "issue.created"
  | "issue.updated"
  | "issue.moved"
  | "issue.archived"
  | "comment.created"
  | "column.updated";

export type BoardEvent = {
  seq: string;
  type: BoardEventType;
  entityId: string;
  payload: Record<string, unknown>;
  actorId: string | null;
};

/// Si el hueco entre `Last-Event-ID` y el presente supera este numero de
/// eventos, no se reproduce: se pide al cliente que recargue el tablero.
export const MAX_REPLAY_EVENTS = 500;
