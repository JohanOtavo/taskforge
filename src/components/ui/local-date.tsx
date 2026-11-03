"use client";

import { useSyncExternalStore } from "react";

const format = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });
const subscribe = () => () => undefined;

/// Fecha en la hora del navegador. El servidor no sabe en que zona esta quien
/// mira, y formatear alli daria otra hora y un error de hidratacion: por eso
/// se deja en blanco hasta llegar al cliente.
export function LocalDate({ date, className }: { date: Date; className?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format.format(date),
    () => "",
  );
  return (
    <time dateTime={date.toISOString()} className={className}>
      {text}
    </time>
  );
}
