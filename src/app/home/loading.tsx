export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-16">
      <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      <div className="mt-8 h-10 w-56 animate-pulse rounded-md bg-muted" />
      <div className="mt-8 h-36 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
