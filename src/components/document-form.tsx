"use client";

import { useActionState } from "react";

import { documentAction, type ActionState } from "@/lib/life-actions";
import type { DocumentRow } from "@/lib/data/life-demo";

export function DocumentForm({ document }: { document: DocumentRow }) {
  const [state, action, pending] = useActionState(documentAction, {} as ActionState);
  const amount = document.amountCents != null ? (document.amountCents / 100).toFixed(2).replace(".", ",") : "";
  return (
    <form action={action} className="space-y-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
      <input type="hidden" name="id" value={document.id} />
      <Field label="Titel" name="title" defaultValue={document.title} />
      <label className="block text-sm">
        Categorie
        <select name="category" defaultValue={document.category} className="mt-1 h-11 w-full rounded-2xl bg-background px-3 ring-1 ring-border">
          {["factuur", "verzekering", "contract", "garantie", "ticket", "identiteit", "woning", "auto", "overig"].map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <Field label="Leverancier" name="supplier" defaultValue={document.supplier ?? ""} />
      <Field label="Bedrag" name="amount" defaultValue={amount} />
      <Field label="Vervaldatum" name="dueOn" defaultValue={document.dueOn ?? ""} type="date" />
      <label className="block text-sm">
        Samenvatting
        <textarea name="summary" defaultValue={document.summary ?? ""} rows={3} className="mt-1 w-full rounded-2xl bg-background px-3 py-2 ring-1 ring-border" />
      </label>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.notice ? <p className="text-sm text-primary">{state.notice}</p> : null}
      <button disabled={pending} className="h-11 rounded-full bg-primary px-5 text-primary-foreground">
        Correctie opslaan
      </button>
    </form>
  );
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) {
  return (
    <label className="block text-sm">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} className="mt-1 h-11 w-full rounded-2xl bg-background px-3 ring-1 ring-border" />
    </label>
  );
}
