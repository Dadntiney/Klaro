import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageIntro } from "@/components/page-intro";
import { listLists } from "@/lib/data/life";

export const metadata: Metadata = { title: "Lijsten" };

export default async function ListsPage() {
  const lists = await listLists();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Lijsten" body="Boodschappen, vakantie, huis. Zeg wat erop moet." />
      {lists.length === 0 ? (
        <EmptyState title="Nog geen lijsten." body="Zeg bijvoorbeeld: voeg melk, eieren en brood toe." />
      ) : (
        <ul className="grid gap-3">
          {lists.map((list) => (
            <li key={list.id}>
              <Link href={`/lijsten/${list.id}`} className="block rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
                <p className="font-heading text-2xl">{list.title}</p>
                <p className="text-sm text-muted-foreground">{list.openCount} open</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
