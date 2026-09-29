import type { Metadata } from "next";
import Link from "next/link";

import { ChatBox } from "@/components/chat-box";
import { EmptyState, PageIntro } from "@/components/page-intro";
import { listThreads } from "@/lib/data/life";

export const metadata: Metadata = { title: "Assistent" };

export default async function AssistantPage() {
  const threads = await listThreads();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Assistent" body="Vraag wat je vandaag moet doen, of waar iets staat. Ik antwoord alleen uit jouw gegevens." />
      <ChatBox />
      <section className="mt-8">
        {threads.length === 0 ? (
          <EmptyState title="Nog geen gesprekken." body="Probeer: wat moet ik vandaag nog doen?" />
        ) : (
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link href={`/assistent/${thread.id}`} className="block rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                  {thread.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
