import { PriorityBadge, TypeBadge } from "@/components/ui/badge";
import { LocalDate } from "@/components/ui/local-date";
import { requireCtx } from "@/server/context";
import { listMyCards } from "@/server/modules/account/service";

export default async function CardsPage() {
  const ctx = await requireCtx();
  const cards = await listMyCards(ctx.db, ctx.actor);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Tarjetas</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tus tarjetas pendientes en todos tus espacios de trabajo.
        </p>
      </div>

      {cards.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center text-sm text-text-muted">
          No tienes tarjetas pendientes.
        </section>
      ) : (
        <ul className="divide-y divide-border slab rounded-xl">
          {cards.map((card) => {
            const params = new URLSearchParams({
              org: card.orgId,
              to: `/p/${card.projectKey}/${card.number}`,
            });
            return (
              <li key={card.id}>
                {/* <a> y no <Link>: /go redirige y cambia de espacio de trabajo. */}
                <a href={`/go?${params}`} className="block px-5 py-3 hover:bg-surface-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-text-muted">
                      {card.projectKey}-{card.number}
                    </span>
                    <TypeBadge type={card.type} />
                    <PriorityBadge priority={card.priority} />
                  </span>
                  <span className="mt-1 block text-sm font-medium">{card.title}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {card.stateName} · {card.projectName} · {card.orgName}
                    {card.dueDate && (
                      <>
                        {" · Vence "}
                        <LocalDate date={card.dueDate} />
                      </>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
