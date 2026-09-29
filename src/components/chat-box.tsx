"use client";

import { useActionState } from "react";

import { chatAction, type ActionState } from "@/lib/life-actions";

export function ChatBox({ conversationId }: { conversationId?: string }) {
  const [state, action, pending] = useActionState(chatAction, {} as ActionState);
  return (
    <form action={action} className="rounded-3xl bg-card p-3 ring-1 ring-foreground/10">
      {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
      <label htmlFor="chat" className="sr-only">
        Bericht
      </label>
      <textarea id="chat" name="text" rows={3} placeholder="Wat moet ik vandaag nog doen?" className="w-full resize-none bg-transparent px-2 py-2 outline-none" />
      {state.error ? <p className="px-2 text-sm text-destructive">{state.error}</p> : null}
      <button disabled={pending} className="h-11 rounded-full bg-primary px-5 text-primary-foreground">
        {pending ? "Je gegevens doorzoeken…" : "Vraag"}
      </button>
    </form>
  );
}
