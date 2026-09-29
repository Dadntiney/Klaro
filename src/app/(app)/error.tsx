"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16">
      <h1 className="font-heading text-4xl tracking-tight">Er ging iets mis.</h1>
      <p className="mt-3 text-muted-foreground">Probeer het opnieuw. Je gegevens blijven van jou.</p>
      <button type="button" onClick={reset} className="mt-6 h-11 rounded-full bg-primary px-5 text-primary-foreground">
        Opnieuw
      </button>
    </main>
  );
}
