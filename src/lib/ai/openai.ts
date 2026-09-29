import "server-only";

import { formatLongDate, getZonedParts, pad } from "@/lib/time";
import { parseModelResponse } from "./schema";

export async function interpretWithOpenAI(rawText: string, now = new Date()) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ontbreekt");

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const parts = getZonedParts(now);

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Je bent Klaro. Je zet losse Nederlandse notities om in taken en herinneringen.",
            "Antwoord alleen met JSON:",
            '{"summary": string, "items": [{"kind": "taak" | "herinnering", "title": string, "notes": string | null, "due_at": string | null, "remind_at": string | null}]}',
            "Regels:",
            "- Tijdzone is Europe/Amsterdam. due_at en remind_at zijn ISO-8601 met offset, of null.",
            "- Een herinnering krijgt remind_at. Een taak krijgt optioneel due_at.",
            "- Splits aparte verzoeken in aparte items. Verzin niets extra's.",
            "- Titels zijn kort, in het Nederlands, zonder 'herinner me'.",
            "- summary is één korte Nederlandse zin.",
            `Nu is het ${formatLongDate(now)} ${pad(parts.hour)}:${pad(parts.minute)} in Amsterdam.`,
          ].join("\n"),
        },
        { role: "user", content: rawText.slice(0, 4000) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Modelantwoord ${response.status}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Leeg modelantwoord");

  return parseModelResponse(JSON.parse(content));
}
