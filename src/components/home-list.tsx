import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { completeItemAction } from "@/lib/actions";
import type { KlaroItem } from "@/lib/domain";
import { formatWhen, isPast } from "@/lib/time";

export function HomeList({
  items,
  filter,
}: {
  items: KlaroItem[];
  filter: "alles" | "taken" | "herinneringen";
}) {
  const tasks = items.filter((item) => item.kind === "taak");
  const reminders = items.filter((item) => item.kind === "herinnering");
  const visible =
    filter === "taken" ? tasks : filter === "herinneringen" ? reminders : sortItems(items);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap gap-2 text-sm">
        <FilterLink href="/home" active={filter === "alles"} label={`Alles ${items.length}`} />
        <FilterLink href="/home?filter=taken" active={filter === "taken"} label={`Taken ${tasks.length}`} />
        <FilterLink
          href="/home?filter=herinneringen"
          active={filter === "herinneringen"}
          label={`Herinneringen ${reminders.length}`}
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-muted-foreground">
          {items.length === 0
            ? "Nog niets open. Gooi hierboven iets erin."
            : "Niets in deze lijst."}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {visible.map((item) => {
            const when = item.kind === "herinnering" ? item.remindAt : item.dueAt;
            const label = formatWhen(when);
            const late = isPast(when);
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10"
              >
                <form action={completeItemAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    aria-label={`${item.title} afvinken`}
                    className="mt-0.5 grid size-6 place-items-center rounded-full border border-border text-transparent hover:border-primary hover:text-primary"
                  >
                    <span className="text-xs">✓</span>
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.kind === "herinnering" ? "secondary" : "outline"}>
                      {item.kind}
                    </Badge>
                    {label ? (
                      <span className={late ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                        {late ? `${label} · te laat` : label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5">{item.title}</p>
                  {item.notes ? <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

function sortItems(items: KlaroItem[]) {
  return [...items].sort((left, right) => {
    const leftTime = instant(left);
    const rightTime = instant(right);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function instant(item: KlaroItem) {
  const value = item.kind === "herinnering" ? item.remindAt ?? item.dueAt : item.dueAt ?? item.remindAt;
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
