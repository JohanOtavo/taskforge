/// Paginas personales del menu de cuenta: columna estrecha, porque son texto y
/// formularios, no tableros.
export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl space-y-6">{children}</div>;
}
