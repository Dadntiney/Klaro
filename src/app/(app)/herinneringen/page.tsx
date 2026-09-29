import type { Metadata } from "next";

import { EmptyState, PageIntro } from "@/components/page-intro";
import { listItems } from "@/lib/data/life";
import { completeLifeItemAction, dismissItemAction, snoozeAction } from "@/lib/life-actions";
import { formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Herinneringen" };

export default async function RemindersPage() {
  const now = new Date().getTime();
  const items = (await listItems()).filter((item) => {
    if (item.kind !== "herinnering" || item.status !== "open") return false;
    if (item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now) return false;
    return true;
  });
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Herinneringen" body="Eenmalig of terugkerend. Jij zegt wanneer, Klaro onthoudt het." />
      {items.length === 0 ? (
        <EmptyState title="Geen open herinneringen." body="Zeg bijvoorbeeld: herinner me vrijdag om de auto naar de garage te brengen." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="font-heading text-2xl tracking-tight">{item.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatWhen(item.remindAt) ?? "Zonder tijdstip"}
                {item.recurrence ? ` · ${item.recurrence}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={completeLifeItemAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground">Klaar</button>
                </form>
                <form action={snoozeAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button name="amount" value="hour" className="h-11 rounded-full px-4 text-sm ring-1 ring-border">
                    Snooze 1 uur
                  </button>
                </form>
                <form action={snoozeAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button name="amount" value="tomorrow" className="h-11 rounded-full px-4 text-sm ring-1 ring-border">
                    Morgen
                  </button>
                </form>
                <form action={dismissItemAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="h-11 rounded-full px-4 text-sm text-muted-foreground">Weg</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
