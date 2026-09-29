import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ConfirmBoard } from "@/components/confirm-board";
import { PageIntro } from "@/components/page-intro";
import { ProposalCard } from "@/components/proposal-card";
import { getConfirmation } from "@/lib/data/repository";
import { getIncoming } from "@/lib/data/life";
import { sanitizePlan, type LifePlan } from "@/lib/life/plan";

export const metadata: Metadata = { title: "Bevestigen" };

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incoming = await getIncoming(id);
  if (!incoming) notFound();
  if (incoming.status !== "pending") redirect("/inbox");

  const plan = readPlan(incoming.proposal);
  if (plan) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8">
        <PageIntro title="Klopt dit?" body="Niets wordt opgeslagen tot je ja zegt." />
        <ProposalCard captureId={id} plan={plan} />
      </main>
    );
  }

  const legacy = await getConfirmation(id);
  if (!legacy || legacy.capture.status !== "pending") notFound();
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8">
      <ConfirmBoard
        captureId={legacy.capture.id}
        rawText={legacy.capture.rawText}
        summary={legacy.capture.summary}
        note={null}
        items={legacy.items}
      />
    </main>
  );
}

function readPlan(value: unknown): LifePlan | null {
  if (!value || typeof value !== "object" || !("actions" in value)) return null;
  try {
    return sanitizePlan(value as LifePlan);
  } catch {
    return null;
  }
}
