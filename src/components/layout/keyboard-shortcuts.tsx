"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ACCOUNT_MENU_ID, NOTIFICATIONS_MENU_ID } from "./header-popover";

/// Una tecla sola no puede saltar mientras se escribe, ni pisar Ctrl+N.
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest("input, textarea, select, [contenteditable=true]"));
}

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event)) return;

      if (event.key === "?") router.push("/shortcuts");
      else if (event.key === "n") document.getElementById(NOTIFICATIONS_MENU_ID)?.togglePopover();
      else if (event.key === "m") document.getElementById(ACCOUNT_MENU_ID)?.togglePopover();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
