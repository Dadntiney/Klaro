import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-5 py-6">
      <Wordmark />
      <main className="py-20">
        <h1 className="font-heading text-4xl tracking-tight">Deze pagina is er niet</h1>
        <p className="mt-3 text-muted-foreground">Terug naar het begin, dan.</p>
        <Link href="/" className="mt-6 inline-block text-primary underline-offset-4 hover:underline">
          Naar Klaro
        </Link>
      </main>
    </div>
  );
}
