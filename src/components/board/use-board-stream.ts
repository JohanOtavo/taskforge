"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type StreamStatus = "connecting" | "live" | "offline";

/// Suscripcion al stream del tablero.
///
/// Al recibir un evento se refresca el componente de servidor en vez de
/// aplicar el parche a mano: el servidor ya sabe leer el tablero y mantener
/// dos implementaciones del mismo estado (una en el servidor y otra en el
/// cliente) es la receta para que divergan.
///
/// `EventSource` reenvia `Last-Event-ID` por su cuenta al reconectar, asi que
/// la reproduccion de lo perdido no necesita codigo aqui: la hace el servidor.
export function useBoardStream(projectId: string): StreamStatus {
  const router = useRouter();
  const [status, setStatus] = useState<StreamStatus>("connecting");
  // El refresco se agrupa: un movimiento genera varios eventos seguidos.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/projects/${projectId}/stream`);

    const scheduleRefresh = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), 150);
    };

    source.addEventListener("open", () => setStatus("live"));

    source.addEventListener("board", () => {
      setStatus("live");
      // Se refresca SIEMPRE, incluso con eventos propios. Filtrar por actor
      // dejaba una segunda pestana del mismo usuario congelada con el
      // indicador en verde: el cambio lo hizo "el", pero no esta pestana.
      // El refresco esta agrupado, asi que el coste es un render extra.
      scheduleRefresh();
    });

    // El servidor avisa de que el hueco era demasiado grande para
    // reproducirlo. Recargar es mas fiable que aplicar miles de parches.
    source.addEventListener("resync", () => {
      setStatus("live");
      scheduleRefresh();
    });

    source.addEventListener("error", () => {
      // EventSource reintenta solo; esto es solo para el indicador.
      setStatus(source.readyState === EventSource.CLOSED ? "offline" : "connecting");
    });

    return () => {
      if (pending.current) clearTimeout(pending.current);
      source.close();
    };
  }, [projectId, router]);

  return status;
}
