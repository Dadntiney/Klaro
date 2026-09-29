import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 py-6">
      <Wordmark />
      <div className="flex flex-1 items-center justify-center py-12">{children}</div>
    </div>
  );
}

export function SetupNote() {
  return (
    <p className="mb-4 text-sm text-muted-foreground">
      Supabase is nog niet gekoppeld. Zet de variabelen uit <code>.env.example</code> en draai de
      migratie in <code>supabase/migrations</code>.
    </p>
  );
}

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="w-full max-w-md bg-card/95">
      <CardHeader>
        <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
