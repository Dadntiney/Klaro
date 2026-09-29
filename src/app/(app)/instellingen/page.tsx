import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SettingsForm } from "@/components/settings-form";
import { PageIntro } from "@/components/page-intro";
import { getProfile } from "@/lib/data/repository";
import { signOutAction } from "@/lib/actions";
import { deleteAccountAction as eraseAction } from "@/lib/life-actions";

export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/instellingen");
  const params = await searchParams;
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro title="Instellingen" body="Naam, meldingen en hoe zelfstandig Klaro mag handelen." />
      <SettingsForm profile={profile} />
      <section className="mt-10 rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="font-heading text-2xl">Privacy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Je gegevens blijven in jouw account. Klaro verzint geen persoonlijke feiten en voert niets destructiefs uit zonder jouw ja.
        </p>
        <form action={signOutAction} className="mt-4">
          <button className="h-11 rounded-full px-4 ring-1 ring-border">Uitloggen</button>
        </form>
      </section>
      <section className="mt-6 rounded-3xl bg-card p-5 ring-1 ring-destructive/20">
        <h2 className="font-heading text-2xl">Account verwijderen</h2>
        <p className="mt-2 text-sm text-muted-foreground">Typ verwijder om je account en gegevens te wissen. Dit kan niet ongedaan worden gemaakt.</p>
        {params.fout ? <p className="mt-2 text-sm text-destructive">Er ging iets mis. Probeer het opnieuw.</p> : null}
        <form action={eraseAction} className="mt-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="confirm">
            Bevestiging
          </label>
          <input id="confirm" name="confirm" className="h-11 rounded-full bg-background px-4 ring-1 ring-border" placeholder="verwijder" />
          <button className="h-11 rounded-full bg-destructive/10 px-4 text-destructive">Account verwijderen</button>
        </form>
      </section>
    </main>
  );
}
