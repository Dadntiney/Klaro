import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageIntro } from "@/components/page-intro";
import { listDocuments } from "@/lib/data/life";
import { formatEuro } from "@/lib/life/plan";

export const metadata: Metadata = { title: "Documenten" };

const CATEGORIES = ["alles", "factuur", "verzekering", "contract", "garantie", "ticket", "identiteit", "woning", "auto", "overig"];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string }>;
}) {
  const params = await searchParams;
  const category = CATEGORIES.includes(params.categorie ?? "") ? params.categorie : "alles";
  const documents = (await listDocuments()).filter((document) => category === "alles" || document.category === category);
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <PageIntro title="Documenten" body="Bewaar hier belangrijke documenten. Ik haal automatisch de belangrijkste informatie eruit." />
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {CATEGORIES.map((item) => (
          <Link key={item} href={item === "alles" ? "/documenten" : `/documenten?categorie=${item}`} className="h-11 shrink-0 rounded-full bg-card px-4 leading-[2.75rem] ring-1 ring-border">
            {item}
          </Link>
        ))}
      </div>
      {documents.length === 0 ? (
        <EmptyState title="Nog geen documenten." body="Upload een factuur, polis of ticket. Of zeg: dit is mijn energierekening." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {documents.map((document) => (
            <li key={document.id}>
              <Link href={`/documenten/${document.id}`} className="block rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">{document.category}</p>
                <p className="mt-2 font-heading text-2xl tracking-tight">{document.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {document.amountCents != null ? formatEuro(document.amountCents) : "Geen bedrag"}
                  {document.dueOn ? ` · ${document.dueOn}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
