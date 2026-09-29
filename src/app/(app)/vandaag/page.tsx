import type { Metadata } from "next";

import { EmptyState, PageIntro } from "@/components/page-intro";
import { listItems } from "@/lib/data/life";
import { completeLifeItemAction } from "@/lib/life-actions";
import { dayItems, narrateDay } from "@/lib/life/narrate";
import { formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Vandaag" };

export default async function TodayPage() {
  const items = await listItems();
  const rows = dayItems(items);
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro
        title="Vandaag"
        body={rows.length === 0 ? "Wat je vandaag moet weten of doen." : narrateDay(items)}
      />
      {rows.length === 0 ? (
        <EmptyState title="Je hebt vandaag niets gepland." body="Een zin is genoeg. Klaro zet het op de juiste plek." />
      ) : (
        <ol className="space-y-3">
          {rows.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-3xl bg-card px-4 py-4 ring-1 ring-foreground/10">
              <div>
                <p className="text-sm text-primary">{formatWhen(item.remindAt ?? item.dueAt) ?? "Wanneer je wilt"}</p>
                <p className="font-heading text-2xl tracking-tight">{item.title}</p>
              </div>
              <form action={completeLifeItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button className="h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground">Klaar</button>
              </form>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
