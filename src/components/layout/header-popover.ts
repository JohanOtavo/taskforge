export const ACCOUNT_MENU_ID = "account-menu";
export const NOTIFICATIONS_MENU_ID = "notifications-menu";

/// Paneles de la cabecera con la Popover API del navegador: dan gratis el
/// cierre al pulsar fuera o con Escape, la capa superior y devolver el foco
/// al boton. `right` alinea con el borde del contenido de la cabecera, que es
/// `max-w-7xl` (80rem) centrado con `px-4`.
export const POPOVER_CLASS = [
  "fixed inset-auto top-14 right-[max(1rem,calc((100vw-80rem)/2+1rem))] m-0",
  "w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-4.5rem)] overflow-y-auto",
  "rounded-xl border border-border bg-surface text-text lift-3",
].join(" ");

/// Al navegar el panel sigue abierto porque la cabecera no se vuelve a montar.
export function closeOnLinkClick(event: React.MouseEvent<HTMLElement>): void {
  if ((event.target as Element).closest("a")) event.currentTarget.hidePopover();
}
