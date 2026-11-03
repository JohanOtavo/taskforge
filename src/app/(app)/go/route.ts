import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import { getActor } from "@/server/context";
import { listWorkspaces, setActiveWorkspace } from "@/server/current-org";
import { db } from "@/server/db";
import { markNotificationRead } from "@/server/modules/notifications/service";

/// Abre algo de cualquier espacio de trabajo.
///
/// `/p/TF/12` se resuelve contra el espacio ACTIVO y la clave solo es unica
/// dentro de cada espacio, asi que un aviso o una tarjeta de otro espacio
/// daria 404, o peor, abriria otra tarjeta con el mismo numero. Por eso se
/// cambia antes de espacio.
///
/// Es un GET que escribe, pero solo una preferencia (espacio activo) y el
/// "leido" de un aviso propio: un enlace forzado no consigue nada mas.
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const params = request.nextUrl.searchParams;
  const notificationId = params.get("n");
  if (notificationId) await markNotificationRead(db, actor, notificationId);

  const orgId = params.get("org");
  if (orgId) {
    const workspaces = await listWorkspaces(actor.id);
    // Ya no pertenece a ese espacio: el destino seria un 404.
    if (!workspaces.some((workspace) => workspace.id === orgId)) redirect("/");
    await setActiveWorkspace(orgId);
  }

  redirect(safeNext(params.get("to")));
}
