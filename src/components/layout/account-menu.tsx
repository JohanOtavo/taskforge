"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui/badge";
import type { Theme } from "@/lib/theme";

import { ACCOUNT_MENU_ID, closeOnLinkClick, POPOVER_CLASS } from "./header-popover";
import { ThemePicker } from "./theme-picker";

type Props = {
  user: { name: string; email: string; imageUrl: string | null };
  theme: Theme;
};

const ITEM = "flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-2";
const HEADING = "px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted";

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={ITEM}>
      {children}
    </Link>
  );
}

/// Cerrar la sesion es lo unico que hace "Cambiar cuentas": al volver a entrar
/// con Google se elige cuenta otra vez.
// ponytail: una sola cuenta abierta; varias a la vez exigirian una cookie de
// sesion por cuenta y un selector, si alguien llega a necesitarlo.
function LogoutItem({ children }: { children: ReactNode }) {
  return (
    <form action={logoutAction}>
      <button type="submit" className={ITEM}>
        {children}
      </button>
    </form>
  );
}

export function AccountMenu({ user, theme }: Props) {
  return (
    <>
      <button
        type="button"
        popoverTarget={ACCOUNT_MENU_ID}
        aria-label="Cuenta"
        title="Cuenta"
        className="ml-1 rounded-full hover:opacity-80"
      >
        <Avatar name={user.name} imageUrl={user.imageUrl} size={32} />
      </button>

      <div
        id={ACCOUNT_MENU_ID}
        popover="auto"
        aria-label="Menú de cuenta"
        className={POPOVER_CLASS}
        onClick={closeOnLinkClick}
      >
        <p className={HEADING}>Cuenta</p>
        <div className="flex items-center gap-3 px-4 py-2">
          <Avatar name={user.name} imageUrl={user.imageUrl} size={44} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
        </div>
        <LogoutItem>Cambiar cuentas</LogoutItem>
        <MenuLink href="/account">Gestionar cuenta</MenuLink>

        <hr className="my-2 border-border" />

        <p className={HEADING}>TaskForge</p>
        <MenuLink href="/profile">Perfil y visibilidad</MenuLink>
        <MenuLink href="/activity">Actividad</MenuLink>
        <MenuLink href="/cards">Tarjetas</MenuLink>
        <MenuLink href="/settings">Ajustes</MenuLink>
        <MenuLink href="/labs">
          <span className="flex-1">Laboratorios</span>
          <span className="rounded bg-gradient-to-r from-accent-2 to-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-text">
            Pruebas
          </span>
        </MenuLink>

        <details className="group">
          <summary className={`${ITEM} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <span className="flex-1">Tema</span>
            <span
              aria-hidden="true"
              className="text-text-muted transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="px-4 pb-2 pt-1">
            <ThemePicker theme={theme} />
          </div>
        </details>

        <hr className="my-2 border-border" />

        <MenuLink href="/workspaces/new">Crear Espacio de trabajo</MenuLink>

        <hr className="my-2 border-border" />

        <MenuLink href="/help">Ayuda</MenuLink>
        <MenuLink href="/shortcuts">Accesos directos</MenuLink>

        <hr className="my-2 border-border" />

        <div className="pb-2">
          <LogoutItem>Cerrar sesión</LogoutItem>
        </div>
      </div>
    </>
  );
}
