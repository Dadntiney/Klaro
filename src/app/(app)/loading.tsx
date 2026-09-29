export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8" aria-busy="true" aria-label="Laden">
      <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
      <div className="mt-3 h-10 w-2/3 animate-pulse rounded-full bg-muted" />
      <div className="mt-8 h-36 animate-pulse rounded-3xl bg-muted" />
      <p className="mt-4 text-sm text-muted-foreground">Even kijken wat dit is…</p>
    </main>
  );
}
