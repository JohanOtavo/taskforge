import { CreateWorkspaceForm } from "@/components/layout/create-workspace-form";

export default function NewWorkspacePage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Crear Espacio de trabajo</h1>
        <p className="mt-1 text-sm text-text-muted">
          Un espacio agrupa a un equipo y sus proyectos. Puedes pertenecer a varios y cambiar entre
          ellos desde la cabecera.
        </p>
      </div>
      <CreateWorkspaceForm />
    </>
  );
}
