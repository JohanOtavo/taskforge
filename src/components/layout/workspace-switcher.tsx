"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { switchWorkspaceAction } from "@/app/(app)/actions";
import { Select } from "@/components/ui/field";

type Props = {
  workspaces: { id: string; name: string }[];
  activeId: string;
};

/// Con un solo espacio no hay nada que elegir; mostrar un desplegable de una
/// opcion solo es ruido.
export function WorkspaceSwitcher({ workspaces, activeId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (workspaces.length <= 1) {
    return (
      <span className="hidden rounded-md bg-surface-2 px-2 py-1 text-xs text-text-muted sm:inline">
        {workspaces[0]?.name}
      </span>
    );
  }

  return (
    <Select
      aria-label="Espacio de trabajo"
      className="h-8 w-44 text-xs"
      value={activeId}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          await switchWorkspaceAction(next);
          router.push("/");
          router.refresh();
        });
      }}
    >
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
        </option>
      ))}
    </Select>
  );
}
