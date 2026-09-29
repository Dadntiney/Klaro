import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChatBox } from "@/components/chat-box";
import { getThread } from "@/lib/data/life";
import { acceptLooseAction, deleteThreadAction } from "@/lib/life-actions";
import type { LifePlan } from "@/lib/life/plan";

export const metadata: Metadata = { title: "Gesprek" };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) notFound();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-heading text-4xl tracking-tight">{thread.title}</h1>
        <form action={deleteThreadAction}>
          <input type="hidden" name="id" value={thread.id} />
          <button className="text-sm text-muted-foreground">Gesprek verwijderen</button>
        </form>
      </div>
      <ol className="space-y-3">
        {thread.messages.map((message) => {
          const plan = message.role === "assistant" ? readPlan(message.context) : null;
          return (
            <li key={message.id} className={message.role === "user" ? "ml-8 rounded-3xl bg-primary/10 px-4 py-3" : "mr-8 rounded-3xl bg-card px-4 py-3 ring-1 ring-foreground/10"}>
              <p>{message.content}</p>
              {plan && plan.intent !== "search" ? (
                <form action={acceptLooseAction} className="mt-3">
                  <input type="hidden" name="plan" value={JSON.stringify(plan)} />
                  <button className="h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground">Ja, doe dit</button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>
      <ChatBox conversationId={thread.id} />
    </main>
  );
}

function readPlan(context: unknown): LifePlan | null {
  if (!context || typeof context !== "object" || !("plan" in context)) return null;
  const plan = (context as { plan?: LifePlan }).plan;
  if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) return null;
  return plan;
}
