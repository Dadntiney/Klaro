import type { Metadata } from "next";

import { AuthCard, AuthShell, SetupNote } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
import { backendMode } from "@/lib/env";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/home";
  const mode = backendMode();

  return (
    <AuthShell>
      <AuthCard title="Welkom terug" description="Log in en gooi het er weer in.">
        {mode === "unconfigured" ? <SetupNote /> : null}
        {mode === "demo" ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Demomodus: dit account blijft alleen op deze machine staan.
          </p>
        ) : null}
        {params.error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            De link om in te loggen is verlopen of ongeldig.
          </p>
        ) : null}
        <AuthForm mode="login" nextPath={nextPath} />
      </AuthCard>
    </AuthShell>
  );
}
