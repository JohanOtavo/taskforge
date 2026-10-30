import Link from "next/link";

import { GoogleSignIn } from "@/components/layout/google-sign-in";
import { safeNext } from "@/lib/safe-next";
import { readGoogleConfig } from "@/server/modules/auth/google";

import { LoginForm } from "./login-form";

/// Codigos que devuelve la vuelta de Google. Solo se muestran textos de esta
/// lista: pintar lo que venga en la URL dejaria a cualquiera escribir
/// mensajes falsos en la pantalla de entrada con un enlace.
const GOOGLE_ERRORS: Record<string, string> = {
  google: "No se pudo entrar con Google. Intentalo de nuevo.",
  google_unverified: "Tu cuenta de Google no tiene el correo verificado.",
  google_conflict: "Ese correo ya esta enlazado a otra cuenta de Google.",
  google_rate: "Demasiados intentos. Prueba de nuevo en unos minutos.",
  google_off: "El acceso con Google no esta disponible.",
};

/// `Object.hasOwn` y no `GOOGLE_ERRORS[code]` a secas: `?error=constructor`
/// devolveria una funcion heredada y la pagina fallaria al pintarla.
function errorText(code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(GOOGLE_ERRORS, code)
    ? GOOGLE_ERRORS[code]
    : undefined;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const error = errorText(params.error);
  const registerHref = next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-text-muted">Accede a tus tableros.</p>

      {error && (
        <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <LoginForm next={next} />
      {readGoogleConfig() && <GoogleSignIn next={next} label="Entrar con Google" />}

      <p className="mt-6 text-center text-sm text-text-muted">
        No tienes cuenta?{" "}
        <Link href={registerHref} className="font-medium text-accent hover:underline">
          Crear cuenta
        </Link>
      </p>
    </>
  );
}
