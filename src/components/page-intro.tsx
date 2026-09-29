export function PageIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow ? <p className="text-sm text-muted-foreground">{eyebrow}</p> : null}
      <h1 className="mt-1 font-heading text-4xl tracking-tight text-balance">{title}</h1>
      {body ? <p className="mt-2 max-w-xl text-muted-foreground">{body}</p> : null}
    </header>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-card px-5 py-8 ring-1 ring-foreground/10">
      <h2 className="font-heading text-2xl tracking-tight">{title}</h2>
      <p className="mt-2 text-muted-foreground">{body}</p>
    </div>
  );
}
