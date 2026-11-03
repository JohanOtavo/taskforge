import { PersonalNav } from "@/components/account/personal-nav";

/// Paginas personales del menu de cuenta: una columna de lectura, porque son
/// texto y formularios, no tableros.
export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
      <PersonalNav />
      <div className="min-w-0 max-w-2xl space-y-6">{children}</div>
    </div>
  );
}
