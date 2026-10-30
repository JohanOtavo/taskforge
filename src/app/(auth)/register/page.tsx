import Link from "next/link";

import { GoogleSignIn } from "@/components/layout/google-sign-in";
import { safeNext } from "@/lib/safe-next";
import { readGoogleConfig } from "@/server/modules/auth/google";

import { RegisterForm } from "./register-form";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Crear cuenta</h1>
      <p className="mb-6 text-sm text-text-muted">
        Primero la cuenta. El espacio de trabajo puedes crearlo despues, o entrar a uno por
        invitacion.
      </p>

      <RegisterForm next={next} />
      {readGoogleConfig() && <GoogleSignIn next={next} label="Registrarse con Google" />}

      <p className="mt-6 text-center text-sm text-text-muted">
        Ya tienes cuenta?{" "}
        <Link href={loginHref} className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
