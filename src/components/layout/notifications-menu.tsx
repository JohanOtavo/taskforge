"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  countUnreadAction,
  loadNotificationsAction,
  markAllNotificationsReadAction,
} from "@/app/(app)/account-actions";
import { cn } from "@/lib/cn";

import { closeOnLinkClick, NOTIFICATIONS_MENU_ID, POPOVER_CLASS } from "./header-popover";

type Item = {
  id: string;
  orgId: string;
  message: string;
  path: string;
  readAt: Date | null;
  createdAt: Date;
};

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

function hrefOf(item: Item): string {
  const params = new URLSearchParams({ org: item.orgId, to: item.path, n: item.id });
  return `/go?${params}`;
}

/// El contador se refresca al navegar y al volver a la pestana, no con un
/// temporizador: en el plan gratuito de Neon una consulta cada minuto con una
/// pestana olvidada mantendria la base despierta y agotaria sus horas.
// ponytail: sin tiempo real; pasar a SSE si avisar al instante llega a importar.
export function NotificationsMenu({ initialUnread }: { initialUnread: number }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function refreshCount() {
      // En segundo plano: sin conexion el contador se queda como esta.
      countUnreadAction()
        .then((result) => {
          if (result.ok) setUnread(result.data);
        })
        .catch(() => undefined);
    }

    refreshCount();
    window.addEventListener("focus", refreshCount);
    return () => window.removeEventListener("focus", refreshCount);
  }, [pathname]);

  function load() {
    setError(null);
    startTransition(async () => {
      // Sin el catch, un fallo de red llegaria a la barrera de errores y se
      // llevaria la pagina entera por abrir un panel.
      const result = await loadNotificationsAction().catch(() => null);
      if (!result?.ok) {
        setError(result?.message ?? "No se han podido cargar. Revisa tu conexión.");
        return;
      }
      setItems(result.data.items);
      setUnread(result.data.unread);
    });
  }

  function markAllRead() {
    setError(null);
    startTransition(async () => {
      const result = await markAllNotificationsReadAction().catch(() => null);
      if (!result?.ok) {
        setError(result?.message ?? "No se han podido marcar. Revisa tu conexión.");
        return;
      }
      setUnread(0);
      setItems((current) =>
        current ? current.map((item) => ({ ...item, readAt: item.readAt ?? new Date() })) : current,
      );
    });
  }

  const label = unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones";

  return (
    <>
      <button
        type="button"
        popoverTarget={NOTIFICATIONS_MENU_ID}
        aria-label={label}
        title={label}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <div
        id={NOTIFICATIONS_MENU_ID}
        popover="auto"
        aria-label="Notificaciones"
        className={POPOVER_CLASS}
        onClick={closeOnLinkClick}
        onToggle={(event) => {
          if (event.newState === "open") load();
        }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          <button
            type="button"
            onClick={markAllRead}
            disabled={pending || unread === 0}
            className="text-xs font-medium text-accent hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            Marcar todo como leído
          </button>
        </div>

        {error && (
          <p className="px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {items === null && !error && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">Cargando…</p>
        )}

        {items?.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">No tienes notificaciones.</p>
        )}

        {items && items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={hrefOf(item)}
                  className={cn("block px-4 py-3 hover:bg-surface-2", !item.readAt && "bg-accent/10")}
                >
                  <span className="block text-sm">{item.message}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                    {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    {!item.readAt && <span className="sr-only">Sin leer.</span>}
                    {dateFormat.format(item.createdAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
