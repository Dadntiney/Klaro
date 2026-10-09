import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is niet ingesteld op de server." }, { status: 503 });
  }
  const { domains, categories } = (await req.json()) as { domains: string[]; categories: string[] };
  if (!Array.isArray(domains) || !Array.isArray(categories) || domains.length === 0) {
    return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });
  }
  const batch = domains.slice(0, 300);
  const prompt =
    `Deel elk domein in bij precies één van deze categorieën: ${categories.join(", ")}, of "Overig" als niets past.\n` +
    `Antwoord uitsluitend met JSON: een object met domein als sleutel en categorie als waarde.\n\nDomeinen:\n` +
    batch.join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.CLASSIFY_MODEL || "claude-haiku-5-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Claude API fout (${res.status})` }, { status: 502 });
  }
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  try {
    return NextResponse.json({ result: JSON.parse(match?.[0] ?? "{}"), processed: batch.length });
  } catch {
    return NextResponse.json({ error: "Kon antwoord van Claude niet lezen." }, { status: 502 });
  }
}
