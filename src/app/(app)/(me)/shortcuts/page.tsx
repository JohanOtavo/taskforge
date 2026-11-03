const SHORTCUTS = [
  { key: "n", text: "Abrir o cerrar las notificaciones" },
  { key: "m", text: "Abrir o cerrar el menú de cuenta" },
  { key: "?", text: "Ver esta página" },
  { key: "Esc", text: "Cerrar el menú abierto" },
];

export default function ShortcutsPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Accesos directos</h1>
        <p className="mt-1 text-sm text-text-muted">
          Funcionan en toda la aplicación, salvo mientras escribes en un campo.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.key} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            {shortcut.text}
            <kbd className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">
              {shortcut.key}
            </kbd>
          </li>
        ))}
      </ul>
    </>
  );
}
