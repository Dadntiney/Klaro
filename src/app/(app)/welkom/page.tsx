"use client";

import { useState } from "react";

import { Wordmark } from "@/components/wordmark";
import { onboardAction } from "@/lib/life-actions";

const EXAMPLES = [
  "Herinner me morgen om mijn pakket op te halen.",
  "Dit is mijn energierekening.",
  "Wat moet ik vandaag doen?",
];

export default function WelcomePage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState(EXAMPLES[0]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-5 py-10">
      <Wordmark href="/home" />
      {step === 0 ? (
        <section className="mt-10">
          <h1 className="font-heading text-5xl tracking-tight">Welkom bij Klaro.</h1>
          <p className="mt-4 text-lg text-muted-foreground">Gooi het erin. Wij regelen de rest.</p>
          <button type="button" className="mt-8 h-11 rounded-full bg-primary px-5 text-primary-foreground" onClick={() => setStep(1)}>
            Verder
          </button>
        </section>
      ) : null}
      {step === 1 ? (
        <section className="mt-10">
          <h1 className="font-heading text-5xl tracking-tight">Wat is je naam?</h1>
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Naam" className="mt-6 h-12 w-full rounded-2xl bg-card px-4 ring-1 ring-border" />
          <button type="button" className="mt-6 h-11 rounded-full bg-primary px-5 text-primary-foreground" onClick={() => setStep(2)}>
            Verder
          </button>
        </section>
      ) : null}
      {step === 2 ? (
        <section className="mt-10">
          <h1 className="font-heading text-5xl tracking-tight">Gooi iets in je inbox om te beginnen.</h1>
          <div className="mt-6 flex flex-col gap-2">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setDraft(example)} className="rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10">
                {example}
              </button>
            ))}
          </div>
          <form action={onboardAction} className="mt-6">
            <input type="hidden" name="displayName" value={name} />
            <input type="hidden" name="draft" value={draft} />
            <button className="h-11 rounded-full bg-primary px-5 text-primary-foreground">Naar Home</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
