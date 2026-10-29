import Link from "next/link";

import { AuthBackdrop } from "@/components/layout/auth-backdrop";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* La escena ocupa el fondo entero y se difumina hacia el centro, para
          que no compita con el formulario. */}
      {/* La mascara vacia SOLO la zona del formulario, para que el fondo no
          compita con los campos. */}
      <AuthBackdrop className="absolute inset-0 hidden opacity-90 [mask-image:radial-gradient(34rem_30rem_at_50%_48%,transparent_42%,black_92%)] xl:block" />

      <div className="scene relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center text-xl font-semibold tracking-tight text-gradient"
        >
          TaskForge
        </Link>

        <div className="card-3d rise-in glass rounded-2xl border border-border p-6 lift-3">
          {children}
        </div>
      </div>
    </main>
  );
}
