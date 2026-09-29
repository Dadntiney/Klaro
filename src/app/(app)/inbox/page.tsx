import type { Metadata } from "next";

import { InboxBoard } from "@/components/inbox-board";
import { PageIntro } from "@/components/page-intro";
import { listInbox } from "@/lib/data/life";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const rows = await listInbox();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Inbox" body="Alles wat je hebt ingestuurd, en wat Klaro ervan heeft gemaakt." />
      <InboxBoard rows={rows} query={params.q ?? ""} status={params.status ?? "alles"} />
    </main>
  );
}
