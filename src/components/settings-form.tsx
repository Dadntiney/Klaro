"use client";

import { useActionState } from "react";

import { settingsAction, type ActionState } from "@/lib/life-actions";
import type { Profile } from "@/lib/domain";

export function SettingsForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(settingsAction, {} as ActionState);
  return (
    <form action={action} className="space-y-4 rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
      <label className="block text-sm">
        Naam
        <input name="displayName" defaultValue={profile.displayName ?? ""} className="mt-1 h-11 w-full rounded-2xl bg-background px-3 ring-1 ring-border" />
      </label>
      <label className="block text-sm">
        Tijdzone
        <input name="timezone" defaultValue={profile.timezone} className="mt-1 h-11 w-full rounded-2xl bg-background px-3 ring-1 ring-border" />
      </label>
      <Toggle name="notifications" label="Meldingen in de app" defaultChecked={profile.preferences.notifications} />
      <Toggle name="proactive" label="Af en toe een relevante suggestie" defaultChecked={profile.preferences.proactive} />
      <Toggle name="autoActions" label="Duidelijke, veilige acties meteen uitvoeren" defaultChecked={profile.preferences.autoActions} />
      <p className="text-sm text-muted-foreground">Twijfel en verwijderen vragen altijd om een ja.</p>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.notice ? <p className="text-sm text-primary">{state.notice}</p> : null}
      <button disabled={pending} className="h-11 rounded-full bg-primary px-5 text-primary-foreground">
        Opslaan
      </button>
    </form>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      {label}
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5" />
    </label>
  );
}
