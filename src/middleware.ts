import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/session-cookie";

/// SOLO redireccion de comodidad.
///
/// El middleware corre en el runtime edge y no puede consultar la base de
/// datos, asi que aqui unicamente se mira si EXISTE la cookie. Una cookie
/// falsificada pasa este filtro y falla despues en `requireCtx`, que es donde
/// esta la autorizacion real. Nunca se debe anadir una comprobacion de
/// permisos aqui y darla por buena.
/// `/privacy` es publica por obligacion: Google exige que la politica de
/// privacidad sea accesible sin cuenta para publicar la app OAuth de Gmail.
const PUBLIC_PATHS = ["/login", "/register", "/invite", "/privacy"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // `next` permite volver a donde se intentaba entrar despues de entrar.
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (hasCookie && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Se excluyen los recursos estaticos y el stream SSE: el stream valida la
  // sesion contra la base de datos por su cuenta.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
