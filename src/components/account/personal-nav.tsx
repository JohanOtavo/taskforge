"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/cards", label: "Tarjetas" },
  { href: "/activity", label: "Actividad" },
  { href: "/profile", label: "Perfil y visibilidad" },
  { href: "/account", label: "Cuenta" },
  { href: "/settings", label: "Ajustes" },
  { href: "/help", label: "Ayuda" },
  { href: "/shortcuts", label: "Accesos directos" },
  { href: "/labs", label: "Laboratorios" },
];

/// Barra lateral en escritorio y fila desplazable en movil.
export function PersonalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Tu cuenta" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-surface font-medium text-text lift-1"
                    : "text-text-muted hover:bg-surface/70 hover:text-text",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
