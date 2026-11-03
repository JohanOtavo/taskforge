export default function LabsPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Laboratorios</h1>
        <p className="mt-1 text-sm text-text-muted">
          Aquí podrás probar funciones nuevas antes de que estén disponibles para todos.
        </p>
      </div>
      <section className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center text-sm text-text-muted">
        Ahora mismo no hay ninguna función en pruebas.
      </section>
    </>
  );
}
