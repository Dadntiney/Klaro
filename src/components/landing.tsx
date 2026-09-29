import Link from "next/link";

import { LandingCapture } from "@/components/landing-capture";
import { Wordmark } from "@/components/wordmark";

const steps = [
  {
    number: "01",
    title: "Gooi het erin",
    body: "Een zin, een appje, een half plan. Spelling mag slordig.",
  },
  {
    number: "02",
    title: "Wij lezen het",
    body: "Klaro maakt er een taak of herinnering van, met een moment als dat erin zit.",
  },
  {
    number: "03",
    title: "Jij zegt ja",
    body: "Pas aan wat niet klopt. Daarna staat het op Home.",
  },
];

export function Landing() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link
          href="/login"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Inloggen
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16 sm:py-24">
        <p className="text-sm tracking-wide text-primary">Voor wat je anders vergeet</p>
        <h1 className="mt-4 max-w-3xl font-heading text-5xl leading-[1.02] tracking-tight text-balance sm:text-7xl">
          Gooi het erin.
          <span className="block text-foreground/80">Wij regelen de rest.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Een losse gedachte is genoeg. Klaro zet hem klaar als taak of herinnering. Jij
          bevestigt alleen.
        </p>

        <LandingCapture />

        <section className="mt-20 grid gap-10 border-t border-border/80 pt-10 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number}>
              <p className="font-heading text-2xl text-primary">{step.number}</p>
              <h2 className="mt-3 font-heading text-2xl tracking-tight">{step.title}</h2>
              <p className="mt-2 text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 grid gap-4 rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:grid-cols-[1.1fr_0.9fr] sm:p-8">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Bijvoorbeeld</p>
            <p className="mt-3 font-heading text-2xl leading-snug tracking-tight">
              Herinner me morgen om 9 uur om de verzekering te bellen. En koop melk.
            </p>
          </div>
          <ul className="flex flex-col justify-center gap-3">
            <li className="rounded-2xl bg-background px-4 py-3 ring-1 ring-foreground/8">
              <p className="text-xs text-reminder">Herinnering · morgen 09:00</p>
              <p className="mt-1">Verzekering bellen</p>
            </li>
            <li className="rounded-2xl bg-background px-4 py-3 ring-1 ring-foreground/8">
              <p className="text-xs text-primary">Taak</p>
              <p className="mt-1">Melk kopen</p>
            </li>
          </ul>
        </section>
      </main>

      <footer className="pb-6 text-sm text-muted-foreground">
        Niets gaat de deur uit zonder jouw ja.
      </footer>
    </div>
  );
}
