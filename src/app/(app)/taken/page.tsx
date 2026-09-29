import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageIntro } from "@/components/page-intro";
import { listItems } from "@/lib/data/life";
import { completeLifeItemAction } from "@/lib/life-actions";
import { formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Taken" };

export default async function TasksPage() {
  const items = (await listItems()).filter((item) => item.kind === "taak" && item.status === "open" && !item.parentId);
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Taken" body="Maak ze met een zin, of vink ze hier af." />
      {items.length === 0 ? (
        <EmptyState title="Je hebt niets openstaan." body="Lekker bezig." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3 ring-1 ring-foreground/10">
              <form action={completeLifeItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button aria-label={`${item.title} afvinken`} className="size-11 rounded-full ring-1 ring-border">
                  ✓
                </button>
              </form>
              <Link href={`/taken/${item.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">
                  {item.priority === "hoog" ? "Belangrijk · " : ""}
                  {formatWhen(item.dueAt) ?? "Geen deadline"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
