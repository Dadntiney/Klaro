import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { CaptureForm } from "@/components/capture-form";
import { HomeList } from "@/components/home-list";
import { getProfile, listOpenItems } from "@/lib/data/repository";
import { backendMode } from "@/lib/env";
import { formatLongDate, greeting } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ gezet?: string; filter?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/home");

  const params = await searchParams;
  const filter =
    params.filter === "taken" || params.filter === "herinneringen" ? params.filter : "alles";
  const items = await listOpenItems();
  const mode = backendMode();

  return (
    <div className="min-h-full">
      <AppHeader email={profile.email} displayName={profile.displayName} />
      {mode === "demo" ? (
        <p className="mx-auto mb-2 w-full max-w-xl px-5 text-sm text-muted-foreground">
          Demomodus. Koppel Supabase om accounts echt te bewaren.
        </p>
      ) : null}
      <main className="mx-auto w-full max-w-xl px-5 pt-6 pb-20">
        <p className="text-sm text-muted-foreground">{formatLongDate()}</p>
        <h1 className="mt-1 font-heading text-4xl tracking-tight">
          {greeting(new Date(), profile.displayName)}
        </h1>
        <p className="mt-2 text-muted-foreground">Gooi het erin. Wij regelen de rest.</p>

        {params.gezet === "1" ? (
          <p role="status" className="mt-6 rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">
            Staat klaar.
          </p>
        ) : null}

        <div className="mt-8">
          <CaptureForm />
        </div>
        <HomeList items={items} filter={filter} />
      </main>
    </div>
  );
}
