import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageIntro } from "@/components/page-intro";
import { UniversalInput } from "@/components/universal-input";
import { getProfile } from "@/lib/data/repository";
import { listDocuments, listItems, listLists, listNotices } from "@/lib/data/life";
import { noticeAction, remindDocumentAction } from "@/lib/life-actions";
import { dayItems, upcomingItems } from "@/lib/life/narrate";
import { formatEuro } from "@/lib/life/plan";
import { formatDay, formatLongDate, formatWhen, greeting } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ gezet?: string; draft?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/home");
  if (!profile.onboardedAt) redirect("/welkom");

  const params = await searchParams;
  const [items, documents, lists, notices] = await Promise.all([
    listItems(),
    listDocuments(),
    listLists(),
    listNotices(profile.preferences),
  ]);
  const today = dayItems(items).slice(0, 4);
  const soon = upcomingItems(items);
  const shopping = lists.find((list) => list.title.toLowerCase() === "boodschappen");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro eyebrow={formatLongDate()} title={greeting(new Date(), profile.displayName)} body="Waar kan ik je vandaag mee helpen?" />
      {params.gezet === "1" ? (
        <p role="status" className="mb-4 rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">
          Staat klaar.
        </p>
      ) : null}
      <UniversalInput initialText={params.draft ?? ""} />

      {notices.filter((notice) => notice.status === "unread").length > 0 ? (
        <section className="mt-8 space-y-2" aria-label="Meldingen">
          {notices
            .filter((notice) => notice.status === "unread")
            .slice(0, 2)
            .map((notice) => (
              <div key={notice.sourceKey} className="flex items-start justify-between gap-3 rounded-2xl bg-accent/60 px-4 py-3">
                <div>
                  <p className="font-medium">{notice.title}</p>
                  <p className="text-sm text-muted-foreground">{notice.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {notice.documentId && notice.dueOn ? (
                    <form action={remindDocumentAction}>
                      <input type="hidden" name="id" value={notice.documentId} />
                      <input type="hidden" name="title" value={notice.title} />
                      <input type="hidden" name="dueOn" value={notice.dueOn} />
                      <button className="h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground">Reminder</button>
                    </form>
                  ) : null}
                  <form action={noticeAction}>
                    <input type="hidden" name="sourceKey" value={notice.sourceKey} />
                    <button name="status" value="dismissed" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                      Weg
                    </button>
                  </form>
                </div>
              </div>
            ))}
        </section>
      ) : null}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-2xl">Vandaag</h2>
          <Link href="/vandaag" className="text-sm text-primary">
            Alles
          </Link>
        </div>
        {today.length === 0 ? (
          <p className="text-muted-foreground">Je hebt vandaag niets gepland.</p>
        ) : (
          <ul className="space-y-2">
            {today.map((item) => (
              <li key={item.id} className="rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <p className="text-xs text-muted-foreground">{formatWhen(item.remindAt ?? item.dueAt) ?? "Open taak"}</p>
                <p>{item.title}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {soon.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 font-heading text-2xl">Binnenkort</h2>
          <ul className="space-y-2">
            {soon.map((item) => (
              <li key={item.id} className="rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <p className="text-xs text-muted-foreground">{formatWhen(item.remindAt ?? item.dueAt)}</p>
                <p>{item.title}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-3 font-heading text-2xl">Recent</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {documents.slice(0, 2).map((document) => (
            <Link key={document.id} href={`/documenten/${document.id}`} className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground">{document.category}</p>
              <p className="mt-2 font-medium">{document.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {document.amountCents != null ? formatEuro(document.amountCents) : "Document"}
                {document.dueOn ? ` · ${formatDay(document.dueOn) ?? document.dueOn}` : ""}
              </p>
            </Link>
          ))}
          {shopping ? (
            <Link href={`/lijsten/${shopping.id}`} className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground">Boodschappen</p>
              <p className="mt-2">{shopping.items.filter((item) => !item.done).map((item) => item.title).slice(0, 4).join(" · ") || "Lijst is leeg"}</p>
            </Link>
          ) : null}
          {documents.length === 0 && !shopping ? (
            <p className="text-muted-foreground">Wat je bewaart, verschijnt hier.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
