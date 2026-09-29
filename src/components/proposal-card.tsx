"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { acceptPlanAction, type ActionState } from "@/lib/life-actions";
import type { LifePlan, PlannedAction } from "@/lib/life/plan";
import { formatEuro } from "@/lib/life/plan";
import { formatWhen } from "@/lib/time";

export function ProposalCard({ captureId, plan }: { captureId: string; plan: LifePlan }) {
  const [state, action, pending] = useActionState(acceptPlanAction, {} as ActionState);
  const [actions, setActions] = useState(plan.actions);
  const [editing, setEditing] = useState(false);
  const unclear = plan.intent === "unclear";

  function update(index: number, patch: Partial<PlannedAction>) {
    setActions((current) => current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, ...patch } : entry)));
  }

  function choose(type: PlannedAction["type"]) {
    const chosen = actions.find((entry) => entry.type === type) ?? actions[0];
    if (!chosen) return;
    setActions([{ ...chosen, type, requiresConfirmation: true }]);
    setEditing(false);
  }

  const payload = JSON.stringify({ ...plan, actions });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="captureId" value={captureId} />
      <input type="hidden" name="plan" value={payload} />
      <p className="text-lg">{plan.summary}</p>
      {unclear && actions.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-11" onClick={() => choose("CREATE_TASK")}>
            Taak maken
          </Button>
          <Button type="button" variant="secondary" className="h-11" onClick={() => choose("CREATE_REMINDER")}>
            Reminder maken
          </Button>
          <Button type="button" variant="secondary" className="h-11" onClick={() => choose("CREATE_NOTE")}>
            Alleen bewaren
          </Button>
        </div>
      ) : null}
      <ul className="space-y-3">
        {actions.map((entry, index) => (
          <li key={`${entry.type}-${index}`} className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
            {editing ? (
              <input
                value={entry.payload.title}
                aria-label="Titel"
                onChange={(event) =>
                  update(index, {
                    title: event.target.value,
                    payload: { ...entry.payload, title: event.target.value },
                  })
                }
                className="h-11 w-full rounded-2xl bg-background px-3 ring-1 ring-border"
              />
            ) : (
              <p className="font-heading text-2xl tracking-tight">{entry.title}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{describe(entry)}</p>
            {entry.payload.suggestion ? (
              <p className="mt-2 text-sm text-reminder">Dit is een suggestie, nog niet opgeslagen.</p>
            ) : null}
            {entry.payload.listItems.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {entry.payload.listItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {entry.payload.document?.amountCents != null ? (
              <p className="mt-2 text-sm">{formatEuro(entry.payload.document.amountCents)}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || actions.length === 0} className="h-11 rounded-full px-5">
          {pending ? "Opslaan…" : "Toevoegen"}
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={() => setEditing((value) => !value)}>
          Aanpassen
        </Button>
      </div>
    </form>
  );
}

function describe(entry: PlannedAction) {
  const when = formatWhen(entry.payload.remindAt ?? entry.payload.dueAt);
  if (entry.detail && !when) return entry.detail;
  return [label(entry.type), when, entry.payload.location].filter(Boolean).join(" · ");
}

function label(type: PlannedAction["type"]) {
  if (type === "CREATE_REMINDER") return "Herinnering";
  if (type === "CREATE_EVENT") return "Afspraak";
  if (type === "CREATE_TASK") return "Taak";
  if (type === "SAVE_DOCUMENT") return "Document";
  if (type === "CREATE_LIST_ITEM") return "Lijst";
  if (type === "CREATE_NOTE") return "Notitie";
  if (type === "ARCHIVE_ITEM") return "Archiveren";
  return "Actie";
}
