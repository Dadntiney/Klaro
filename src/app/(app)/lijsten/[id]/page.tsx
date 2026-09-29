import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageIntro } from "@/components/page-intro";
import { getList } from "@/lib/data/life";
import { addListItemAction, listCheckAction } from "@/lib/life-actions";

export const metadata: Metadata = { title: "Lijst" };

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title={list.title} />
      <ul className="space-y-2">
        {list.items.map((item) => (
          <li key={item.id}>
            <form action={listCheckAction} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2 ring-1 ring-foreground/10">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="done" value={item.done ? "0" : "1"} />
              <button aria-label={item.done ? "Terugzetten" : "Afvinken"} className="size-11 rounded-full ring-1 ring-border">
                {item.done ? "✓" : ""}
              </button>
              <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.title}</span>
            </form>
          </li>
        ))}
      </ul>
      <form action={addListItemAction} className="mt-4 flex gap-2">
        <input type="hidden" name="listId" value={list.id} />
        <input name="title" aria-label="Item" placeholder="Nog iets" className="h-11 flex-1 rounded-full bg-card px-4 ring-1 ring-border" />
        <button className="h-11 rounded-full px-4 ring-1 ring-border">Toevoegen</button>
      </form>
    </main>
  );
}
