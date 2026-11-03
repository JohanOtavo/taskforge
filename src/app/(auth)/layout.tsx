import Link from "next/link";

import { ForgeBackdrop } from "@/components/layout/forge-backdrop";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <ForgeBackdrop />

      <div className="scene relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center font-display text-2xl font-bold tracking-tight text-gradient"
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
