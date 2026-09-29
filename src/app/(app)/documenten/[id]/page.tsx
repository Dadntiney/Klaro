import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentForm } from "@/components/document-form";
import { PageIntro } from "@/components/page-intro";
import { getDocument } from "@/lib/data/life";
import { formatEuro } from "@/lib/life/plan";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageIntro eyebrow={document.category} title={document.title} body={document.summary ?? "Controleer of dit klopt. Ik verzin geen ontbrekende gegevens."} />
      <dl className="mb-6 grid gap-3 sm:grid-cols-3">
        <Fact label="Bedrag" value={document.amountCents != null ? formatEuro(document.amountCents) : "Niet gevonden"} />
        <Fact label="Vervaldatum" value={formatDay(document.dueOn) ?? "Niet gevonden"} />
        <Fact label="Leverancier" value={document.supplier ?? "Niet gevonden"} />
      </dl>
      {document.hasFile ? (
        <a href={`/api/bestand?id=${document.id}`} className="mb-6 inline-flex h-11 items-center rounded-full bg-primary px-5 text-primary-foreground">
          Document openen
        </a>
      ) : null}
      <DocumentForm document={document} />
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
