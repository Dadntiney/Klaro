import { formatDay } from "@/lib/time";

export type SearchRecord = {
  id: string;
  kind: "document" | "taak" | "herinnering" | "afspraak" | "notitie" | "lijst";
  title: string;
  body: string;
  href: string;
  amountCents?: number | null;
  category?: string | null;
  dueOn?: string | null;
};

export type SearchHit = SearchRecord & { score: number };

const STOP = new Set([
  "de",
  "het",
  "een",
  "van",
  "mijn",
  "waar",
  "staat",
  "wat",
  "moet",
  "ik",
  "nog",
  "voor",
  "en",
  "te",
  "om",
  "hoeveel",
  "wanneer",
  "welke",
  "is",
  "in",
  "op",
  "bij",
  "naar",
  "doen",
  "regelen",
  "vandaag",
  "morgen",
]);

const SYNONYMS: Record<string, string[]> = {
  autoverzekering: ["auto", "verzekering", "polis", "polisblad"],
  verzekering: ["polis", "polisblad", "verzekeraar"],
  verzekeringen: ["verzekering", "polis", "polisblad"],
  energierekening: ["energie", "factuur", "rekening", "nota"],
  energiefactuur: ["energie", "factuur", "rekening"],
  factuur: ["rekening", "nota"],
  garantie: ["warranty", "aankoop"],
  paspoort: ["identiteit", "reisdocument"],
  vlucht: ["ticket", "vliegtuig", "boarding"],
  vakantie: ["reis", "vlucht", "hotel"],
};

export function searchRecords(query: string, records: SearchRecord[]): SearchHit[] {
  const tokens = expand(tokenize(query));
  if (tokens.length === 0) return [];

  return records
    .map((record) => {
      const hayTitle = tokenize(record.title);
      const hayBody = tokenize(`${record.body} ${record.category ?? ""}`);
      let score = 0;
      for (const token of tokens) {
        if (hayTitle.includes(token)) score += 5;
        else if (hayBody.includes(token)) score += 2;
        else if (hayTitle.some((word) => word.includes(token) || token.includes(word))) score += 2;
      }
      return { ...record, score };
    })
    .filter((hit) => hit.score >= 4)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

export function composeAnswer(query: string, hits: SearchHit[], narrative?: string | null) {
  const lower = query.toLowerCase();
  if (narrative && /\b(vandaag|morgen)\b/.test(lower) && /\bmoet ik\b/.test(lower)) {
    return narrative;
  }
  if (hits.length === 0) return "Ik kan dit niet terugvinden in je gegevens.";

  if (/hoeveel/.test(lower) && /verzeker/.test(lower)) {
    const amounts = hits.filter((hit) => hit.kind === "document" && hit.amountCents);
    if (amounts.length === 0) {
      return "Ik heb verzekeringen gevonden, maar geen bedragen erin. Ik verzin geen maandbedrag.";
    }
    const total = amounts.reduce((sum, hit) => sum + (hit.amountCents ?? 0), 0);
    const names = amounts.map((hit) => hit.title).join(", ");
    return `In je documenten staat bij elkaar ${formatCents(total)}. Ik zie niet of dat per maand is. Bron: ${names}.`;
  }

  const preferred = /waar/.test(lower) ? (hits.find((hit) => hit.kind === "document") ?? hits[0]) : hits.length === 1 ? hits[0] : null;
  if (preferred && (hits.length === 1 || /waar/.test(lower))) {
    const extra = [
      preferred.category,
      preferred.dueOn ? formatDay(preferred.dueOn) : null,
      preferred.amountCents ? formatCents(preferred.amountCents) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `Ik heb “${preferred.title}” gevonden.${extra ? ` ${extra}.` : ""}`;
  }

  return `Ik vond ${hits.length} dingen: ${hits.map((hit) => hit.title).join(", ")}.`;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-zà-ÿ0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function expand(tokens: string[]) {
  const result = new Set(tokens);
  for (const token of tokens) {
    for (const extra of SYNONYMS[token] ?? []) result.add(extra);
  }
  return [...result];
}

function formatCents(cents: number) {
  const whole = Math.trunc(cents / 100);
  const rest = String(Math.abs(cents) % 100).padStart(2, "0");
  return `€${whole.toLocaleString("nl-NL")},${rest}`;
}
