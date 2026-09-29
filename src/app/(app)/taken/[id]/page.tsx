import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageIntro } from "@/components/page-intro";
import { listItems } from "@/lib/data/life";
import { completeLifeItemAction, subtaskAction } from "@/lib/life-actions";

export const metadata: Metadata = { title: "Taak" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await listItems();
  const task = items.find((item) => item.id === id);
  if (!task) notFound();
  const children = items.filter((item) => item.parentId === id && item.status === "open");
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro eyebrow={task.category ?? "Taak"} title={task.title} body={task.notes ?? undefined} />
      <form action={completeLifeItemAction}>
        <input type="hidden" name="id" value={task.id} />
        <button className="h-11 rounded-full bg-primary px-5 text-primary-foreground">Afvinken</button>
      </form>
      <section className="mt-8">
        <h2 className="font-heading text-2xl">Subtaken</h2>
        <ul className="mt-3 space-y-2">
          {children.map((child) => (
            <li key={child.id}>{child.title}</li>
          ))}
        </ul>
        <form action={subtaskAction} className="mt-4 flex gap-2">
          <input type="hidden" name="parentId" value={task.id} />
          <input name="title" aria-label="Nieuwe subtaak" placeholder="Subtaak" className="h-11 flex-1 rounded-full bg-card px-4 ring-1 ring-border" />
          <button className="h-11 rounded-full px-4 ring-1 ring-border">Toevoegen</button>
        </form>
      </section>
    </main>
  );
}
