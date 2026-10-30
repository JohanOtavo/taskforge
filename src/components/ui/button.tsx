import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/// Exportado para dar aspecto de boton a un enlace (<a>) sin anidar un
/// <button> dentro, que no es HTML valido.
export const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
    // transform y opacity son las dos propiedades que el compositor anima
    // sin volver a maquetar; todo lo demas provocaria reflow en cada frame.
    "transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out",
    "active:translate-y-px active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-accent to-[color-mix(in_oklab,var(--accent)_82%,black)] text-accent-text lift-1 hover-lift hover:brightness-110",
        secondary:
          "bg-surface-2 text-text lift-1 hover:bg-border hover-lift",
        ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
        danger: "bg-danger text-white lift-1 hover:brightness-110",
      },
      size: {
        // 36px de alto minimo: un objetivo tactil mas pequeno no se acierta.
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
