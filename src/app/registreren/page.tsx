import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";
import { AuthCard, AuthShell, SetupNote } from "@/components/auth-shell";
import { backendMode } from "@/lib/env";

export const metadata: Metadata = { title: "Registreren" };

export default function RegisterPage() {
  const mode = backendMode();

  return (
    <AuthShell>
      <AuthCard title="Account maken" description="Daarna gooi je het erin. Wij doen de rest.">
        {mode === "unconfigured" ? <SetupNote /> : null}
        {mode === "demo" ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Demomodus: zonder Supabase blijft dit account lokaal. Handig om de flow te proberen.
          </p>
        ) : null}
        <AuthForm mode="signup" />
      </AuthCard>
    </AuthShell>
  );
}
