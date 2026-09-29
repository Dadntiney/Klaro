import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ConfirmBoard } from "@/components/confirm-board";
import { getConfirmation, getProfile } from "@/lib/data/repository";
import { hasOpenAiEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Bevestigen" };

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  const confirmation = await getConfirmation(id);

  return (
    <div className="min-h-full">
      <AppHeader email={profile.email} displayName={profile.displayName} />
      <main className="mx-auto w-full max-w-xl px-5 pt-4 pb-20">
        {!confirmation ? (
          <Missing />
        ) : confirmation.capture.status !== "pending" ? (
          <AlreadyDone />
        ) : (
          <ConfirmBoard
            captureId={confirmation.capture.id}
            rawText={confirmation.capture.rawText}
            summary={confirmation.capture.summary}
            note={readingNote(confirmation.capture.interpreter)}
            items={confirmation.items.filter((item) => item.status === "proposed")}
          />
        )}
      </main>
    </div>
  );
}

function readingNote(interpreter: "openai" | "local" | null) {
  if (interpreter === "openai") return null;
  if (hasOpenAiEnv()) {
    return "Ik kon het model niet bereiken. Dit is een eenvoudige lezing — pas aan wat niet klopt.";
  }
  return "Eenvoudige lezing. Je kunt alles nog aanpassen.";
}

function Missing() {
  return (
    <div>
      <h1 className="font-heading text-4xl tracking-tight">Dit bestaat niet</h1>
      <p className="mt-3 text-muted-foreground">De invoer is weg, of hij is niet van jou.</p>
      <Link href="/home" className="mt-6 inline-block text-primary underline-offset-4 hover:underline">
        Naar Home
      </Link>
    </div>
  );
}

function AlreadyDone() {
  return (
    <div>
      <h1 className="font-heading text-4xl tracking-tight">Al afgehandeld</h1>
      <p className="mt-3 text-muted-foreground">Deze invoer is al bevestigd of weggegooid.</p>
      <Link href="/home" className="mt-6 inline-block text-primary underline-offset-4 hover:underline">
        Naar Home
      </Link>
    </div>
  );
}
