import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageIntro } from "@/components/page-intro";
import { listItems } from "@/lib/data/life";
import { addDays, formatWhen, getZonedParts, pad, sameDay, WEEKDAYS_NL } from "@/lib/time";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ weergave?: string }>;
}) {
  const params = await searchParams;
  const view = params.weergave === "dag" || params.weergave === "maand" ? params.weergave : "week";
  const items = (await listItems()).filter((item) => item.kind === "afspraak" && item.status === "open");
  const today = getZonedParts(new Date());
  const days = view === "dag" ? [today] : view === "week" ? Array.from({ length: 7 }, (_, index) => addDays(today, index - today.weekday + 1)) : monthDays(today);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <PageIntro title="Agenda" body="Een dag, een week of een maand. Zeg gewoon wanneer het is." />
      <div className="mb-6 flex gap-2">
        {(["dag", "week", "maand"] as const).map((option) => (
          <Link
            key={option}
            href={`/agenda?weergave=${option}`}
            aria-current={view === option ? "page" : undefined}
            className={`h-11 rounded-full px-4 leading-[2.75rem] ${view === option ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border"}`}
          >
            {option}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nog geen afspraken." body="Zeg bijvoorbeeld: donderdag om 15:00 tandarts." />
      ) : (
        <div className={view === "maand" ? "grid grid-cols-7 gap-2" : "grid gap-3 md:grid-cols-2"}>
          {days.map((day) => {
            const rows = items.filter((item) => {
              const stamp = item.dueAt ?? item.remindAt;
              return stamp ? sameDay(getZonedParts(new Date(stamp)), day) : false;
            });
            return (
              <section key={`${day.year}-${day.month}-${day.day}`} className="min-h-28 rounded-3xl bg-card p-3 ring-1 ring-foreground/10">
                <p className="text-sm text-muted-foreground">
                  {WEEKDAYS_NL[getZonedParts(new Date(Date.UTC(day.year, day.month - 1, day.day, 12))).weekday] ?? ""} {day.day}/{pad(day.month)}
                </p>
                <ul className="mt-2 space-y-1">
                  {rows.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="text-primary">{formatWhen(item.dueAt ?? item.remindAt)?.split(" ").at(-1)}</span> {item.title}
                      {item.location ? <span className="block text-muted-foreground">{item.location}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function monthDays(today: { year: number; month: number; day: number }) {
  const count = new Date(today.year, today.month, 0).getDate();
  return Array.from({ length: count }, (_, index) => ({ year: today.year, month: today.month, day: index + 1 }));
}
