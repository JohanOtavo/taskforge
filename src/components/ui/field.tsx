import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from "react";

import { cn } from "@/lib/cn";

const CONTROL = [
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text",
  "placeholder:text-text-muted disabled:opacity-50",
  "transition-[border-color,box-shadow] duration-150 ease-out",
  "hover:border-text-muted/40",
  // El anillo sustituye al cambio de grosor de borde: un borde que engorda
  // al enfocar mueve el contenido de al lado.
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
].join(" ");

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(CONTROL, "h-10", className)} {...props} />;
}

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactElement<ControlProps>;
};

/// Etiqueta asociada por `htmlFor`, y el control recibe `aria-describedby` y
/// `aria-invalid` por clonacion. Sin esto un lector de pantalla anuncia el
/// campo sin su nombre ni su mensaje de error.
export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: htmlFor,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
