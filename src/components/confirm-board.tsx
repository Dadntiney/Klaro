"use client";

import { useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmCaptureAction, dismissCaptureAction, type FormState } from "@/lib/actions";
import type { KlaroItem } from "@/lib/domain";
import { toDateTimeLocal } from "@/lib/time";

type Draft = {
  key: string;
  id?: string;
  kind: "taak" | "herinnering";
  title: string;
  notes: string;
  when: string;
};

const initialState: FormState = {};

export function ConfirmBoard({
  captureId,
  rawText,
  summary,
  note,
  items,
}: {
  captureId: string;
  rawText: string;
  summary: string | null;
  note: string | null;
  items: KlaroItem[];
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    items.length > 0
      ? items.map((item) => ({
          key: item.id,
          id: item.id,
          kind: item.kind,
          title: item.title,
          notes: item.notes ?? "",
          when: toDateTimeLocal(item.kind === "herinnering" ? item.remindAt : item.dueAt),
        }))
      : [blankDraft()],
  );
  const [state, formAction, pending] = useActionState(confirmCaptureAction, initialState);
  const canSubmit = drafts.some((draft) => draft.title.trim().length > 0);

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-4xl tracking-tight">Klopt dit?</h1>
        {summary ? <p className="mt-3 text-muted-foreground">{summary}</p> : null}
        {note ? <p className="mt-2 text-sm text-muted-foreground">{note}</p> : null}
      </div>

      <blockquote className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
        {rawText}
      </blockquote>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="captureId" value={captureId} />
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(
            drafts
              .filter((draft) => draft.title.trim())
              .map((draft) => ({
                id: draft.id,
                kind: draft.kind,
                title: draft.title,
                notes: draft.notes,
                when: draft.when,
              })),
          )}
        />

        <p className="text-sm text-muted-foreground">Tijden zijn in Nederland.</p>
        <ul className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <li key={draft.key} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex rounded-full bg-muted p-1">
                  {(["taak", "herinnering"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={draft.kind === kind}
                      onClick={() => update(draft.key, { kind })}
                      className={`rounded-full px-3 py-1 text-sm capitalize ${
                        draft.kind === kind
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() =>
                      setDrafts((current) => current.filter((entry) => entry.key !== draft.key))
                    }
                  >
                    Weg
                  </button>
                ) : null}
              </div>

              <label className="mt-4 block text-sm" htmlFor={`title-${draft.key}`}>
                Titel
              </label>
              <Input
                id={`title-${draft.key}`}
                value={draft.title}
                onChange={(event) => update(draft.key, { title: event.target.value })}
                className="mt-1.5 h-11 bg-background px-3 md:text-base"
                maxLength={280}
                placeholder={index === 0 ? "Wat moet er gebeuren?" : "Nog iets"}
              />

              <label className="mt-3 block text-sm" htmlFor={`when-${draft.key}`}>
                {draft.kind === "herinnering" ? "Herinner om" : "Klaar op"}
              </label>
              <Input
                id={`when-${draft.key}`}
                type="datetime-local"
                value={draft.when}
                onChange={(event) => update(draft.key, { when: event.target.value })}
                className="mt-1.5 h-11 bg-background px-3 md:text-base"
              />

              <label className="mt-3 block text-sm" htmlFor={`notes-${draft.key}`}>
                Notitie
              </label>
              <Input
                id={`notes-${draft.key}`}
                value={draft.notes}
                onChange={(event) => update(draft.key, { notes: event.target.value })}
                className="mt-1.5 h-11 bg-background px-3 md:text-base"
                maxLength={2000}
                placeholder="Optioneel"
              />
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="self-start text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => setDrafts((current) => [...current, blankDraft()])}
        >
          Nog een regel
        </button>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" className="h-11 px-5" disabled={pending || !canSubmit}>
            {pending ? "Zet klaar…" : "Zet klaar"}
          </Button>
          <Button form="dismiss-capture" type="submit" variant="ghost" disabled={pending}>
            Weg ermee
          </Button>
        </div>
      </form>

      <form id="dismiss-capture" action={dismissCaptureAction}>
        <input type="hidden" name="captureId" value={captureId} />
      </form>
    </div>
  );
}

function blankDraft(): Draft {
  return {
    key: crypto.randomUUID(),
    kind: "taak",
    title: "",
    notes: "",
    when: "",
  };
}
