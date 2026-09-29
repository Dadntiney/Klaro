import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { searchLibrary } from "@/lib/data/life";

export const metadata: Metadata = { title: "Zoeken" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const result = query ? await searchLibrary(query, null) : null;
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Zoeken" body="Je hoeft niet te weten waar het staat." />
      <form className="mb-6" action="/zoeken">
        <label htmlFor="q" className="sr-only">
          Zoekvraag
        </label>
        <input id="q" name="q" defaultValue={query} placeholder="Waar staat mijn autoverzekering?" className="h-12 w-full rounded-full bg-card px-4 ring-1 ring-border" />
      </form>
      {result ? (
        <section>
          <p className="text-lg">{result.text}</p>
          <ul className="mt-4 space-y-2">
            {result.hits.map((hit) => (
              <li key={hit.id}>
                <Link href={hit.href} className="block rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                  <p className="text-xs text-muted-foreground">{hit.kind}</p>
                  <p>{hit.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-muted-foreground">Vraag bijvoorbeeld: waar staat mijn autoverzekering?</p>
      )}
    </main>
  );
}
