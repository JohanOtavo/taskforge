"use client";

import { useState, useTransition } from "react";

import { setThemeAction } from "@/app/(app)/account-actions";
import { cn } from "@/lib/cn";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

export function ThemePicker({ theme }: { theme: Theme }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(value: Theme) {
    setError(null);
    startTransition(async () => {
      const result = await setThemeAction(value);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div>
      <div role="group" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            aria-pressed={theme === option.value}
            onClick={() => choose(option.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
              theme === option.value
                ? "bg-surface text-text lift-1"
                : "text-text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
