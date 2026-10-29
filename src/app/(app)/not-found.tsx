import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <h1 className="text-lg font-semibold">No encontrado</h1>
      <p className="mt-1 text-sm text-text-muted">
        Ese recurso no existe o no tienes acceso.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
        Volver a proyectos
      </Link>
    </div>
  );
}
