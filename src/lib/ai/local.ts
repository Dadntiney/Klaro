import { addDays, getZonedParts, zonedTimeToUtc, type ZonedParts } from "@/lib/time";
import type { InterpretedItem, ItemKind } from "./schema";

const WEEKDAY_INDEX: Record<string, number> = {
  zondag: 0,
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
};

const IMPERATIVES = new Set([
  "bel",
  "koop",
  "haal",
  "stuur",
  "mail",
  "app",
  "plan",
  "maak",
  "regel",
  "check",
  "controleer",
  "betaal",
  "boek",
  "breng",
  "vraag",
  "schrijf",
  "was",
  "zoek",
  "leg",
  "zet",
  "ruim",
  "bestel",
  "print",
  "lees",
  "oefen",
  "sport",
  "herinner",
  "reserveer",
  "annuleer",
  "verstuur",
  "pak",
  "doe",
  "afspreken",
  "bellen",
]);

const REMINDER_RE =
  /(herinner|reminder|niet vergeten|vergeet niet|afspraak|tandarts|dokter|huisarts|kapper|meeting|vergadering)/i;

type Clock = { hour: number; minute: number };
type CalendarDay = { year: number; month: number; day: number };

export function interpretLocally(rawText: string, now = new Date()) {
  const clauses = splitClauses(rawText);
  const items = clauses
    .map((clause) => clauseToItem(clause, now))
    .filter((item) => item.title.length > 0);

  if (items.length === 0) {
    const fallback = rawText.trim().slice(0, 280);
    items.push({
      kind: "taak",
      title: fallback || "Nieuwe taak",
      notes: null,
      dueAt: null,
      remindAt: null,
    });
  }

  const summary =
    items.length === 1
      ? `Eén ${items[0].kind}: ${items[0].title}.`
      : `${items.length} dingen: ${items.map((item) => item.title).join(", ")}.`;

  return { summary: summary.slice(0, 400), items };
}

function splitClauses(raw: string) {
  const chunks = raw
    .split(/\n+/)
    .flatMap((line) => line.split(/\s*;\s*/))
    .flatMap((line) => splitSeparators(line.trim()));

  return chunks
    .map((chunk) => chunk.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

function splitSeparators(line: string) {
  const pattern = /\s*(?:,|en)\s+/i;
  const result: string[] = [];
  let rest = line;

  while (rest) {
    const match = pattern.exec(rest);
    if (!match) {
      result.push(rest);
      break;
    }

    const left = rest.slice(0, match.index).trim();
    const right = rest.slice(match.index + match[0].length).trim();
    if (left.split(/\s+/).length >= 2 && startsWithAction(right)) {
      result.push(left);
      rest = right;
      continue;
    }

    result.push(rest);
    break;
  }

  return result;
}

function startsWithAction(text: string) {
  const first = text
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[^a-zà-ÿ-]/gi, "");
  if (!first) return false;
  if (IMPERATIVES.has(first)) return true;
  return /^(herinner|niet)\b/i.test(text);
}

function clauseToItem(clause: string, now: Date): InterpretedItem {
  const kind = detectKind(clause);
  const when = parseWhen(clause, now);
  const iso = when
    ? zonedTimeToUtc(when.year, when.month, when.day, when.hour, when.minute).toISOString()
    : null;

  return {
    kind,
    title: cleanupTitle(clause),
    notes: null,
    dueAt: kind === "taak" ? iso : null,
    remindAt: kind === "herinnering" ? iso : null,
  };
}

function detectKind(text: string): ItemKind {
  if (/^(herinner me|niet vergeten|vergeet niet)\b/i.test(text.trim())) {
    return "herinnering";
  }
  if (REMINDER_RE.test(text) && !/^(taak|todo)\b/i.test(text.trim())) {
    return "herinnering";
  }
  return "taak";
}

function parseWhen(text: string, now: Date) {
  const lower = text.toLowerCase();
  const zoneNow = getZonedParts(now);
  const clock = parseClock(lower);
  const day = parseDay(lower, zoneNow, clock);

  if (!day && !clock && !hasDaypart(lower)) return null;

  let calendar = day ?? {
    year: zoneNow.year,
    month: zoneNow.month,
    day: zoneNow.day,
  };

  let hour = clock?.hour;
  const minute = clock?.minute ?? 0;

  if (hour == null) {
    if (/vanavond|\bavond\b/.test(lower)) hour = 19;
    else if (/vanmiddag|\bmiddag\b/.test(lower)) hour = 15;
    else if (/vanochtend|\bochtend\b/.test(lower)) hour = 9;
    else if (day) hour = 9;
    else return null;
  }

  if (!day && clock) {
    const candidate = zonedTimeToUtc(calendar.year, calendar.month, calendar.day, hour, minute);
    if (candidate.getTime() <= now.getTime()) {
      calendar = addDays(calendar, 1);
    }
  }

  return { ...calendar, hour, minute };
}

function hasDaypart(lower: string) {
  return /vanavond|vanmiddag|vanochtend|\bavond\b|\bmiddag\b|\bochtend\b/.test(lower);
}

function parseClock(lower: string): Clock | null {
  const half = /\bhalf\s+(\d{1,2})\b/.exec(lower);
  const kwartOver = /\bkwart\s+over\s+(\d{1,2})\b/.exec(lower);
  const kwartVoor = /\bkwart\s+voor\s+(\d{1,2})\b/.exec(lower);
  const precise = /\b(?:om\s+)?(\d{1,2})[:.](\d{2})(?:\s*uur)?\b/.exec(lower);
  const hourOnly = /\bom\s+(\d{1,2})(?:\s*uur)?\b/.exec(lower);

  let hour: number | null = null;
  let minute = 0;

  if (half) {
    hour = Number(half[1]) - 1;
    if (hour < 0) hour = 23;
    minute = 30;
  } else if (kwartOver) {
    hour = Number(kwartOver[1]);
    minute = 15;
  } else if (kwartVoor) {
    hour = Number(kwartVoor[1]) - 1;
    if (hour < 0) hour = 23;
    minute = 45;
  } else if (precise && /[:.]/.test(precise[0])) {
    hour = Number(precise[1]);
    minute = Number(precise[2]);
  } else if (hourOnly) {
    hour = Number(hourOnly[1]);
  }

  if (hour == null || hour > 23 || minute > 59) return null;
  if ((/vanavond|\bavond\b/.test(lower) && hour < 12) || (/\bmiddag\b|vanmiddag/.test(lower) && hour >= 1 && hour <= 7)) {
    hour += 12;
  }
  if (hour > 23) return null;
  return { hour, minute };
}

function parseDay(lower: string, zoneNow: ZonedParts, clock: Clock | null): CalendarDay | null {
  if (/\bvandaag\b|\bvanochtend\b|\bvanmiddag\b|\bvanavond\b/.test(lower)) {
    return { year: zoneNow.year, month: zoneNow.month, day: zoneNow.day };
  }
  if (/\bovermorgen\b/.test(lower)) return addDays(zoneNow, 2);
  if (/\bmorgen\b/.test(lower)) return addDays(zoneNow, 1);

  for (const [name, index] of Object.entries(WEEKDAY_INDEX)) {
    if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
    let delta = (index - zoneNow.weekday + 7) % 7;
    if (delta === 0) {
      const hour = clock?.hour ?? 9;
      const minute = clock?.minute ?? 0;
      if (hour < zoneNow.hour || (hour === zoneNow.hour && minute <= zoneNow.minute)) {
        delta = 7;
      }
    }
    return addDays(zoneNow, delta);
  }

  return null;
}

function cleanupTitle(clause: string) {
  let title = clause.trim();
  title = title.replace(
    /^(?:herinner me(?: eraan)?(?: om)?|niet vergeten(?: om)?|vergeet niet(?: om)?|ik moet(?: nog)?(?: om)?|taak\s*:|todo\s*:)\s+/i,
    "",
  );
  title = title.replace(/\b(?:overmorgen|vandaag|morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/gi, " ");
  title = title.replace(/\b(?:vanochtend|vanmiddag|vanavond|ochtend|middag|avond)\b/gi, " ");
  title = title.replace(/\bhalf\s+\d{1,2}\b/gi, " ");
  title = title.replace(/\bkwart\s+(?:over|voor)\s+\d{1,2}\b/gi, " ");
  title = title.replace(/\bom\s+\d{1,2}[:.]\d{2}(?:\s*uur)?\b/gi, " ");
  title = title.replace(/\bom\s+\d{1,2}(?:\s*uur)?\b/gi, " ");
  title = title.replace(/\b\d{1,2}[:.]\d{2}(?:\s*uur)?\b/gi, " ");
  title = title.replace(/^(?:om|te|eraan)\s+/i, "");
  title = title.replace(/\s+/g, " ").trim().replace(/^[\s,.\-–:]+|[\s,.\-–:]+$/g, "");

  if (!title) title = clause.trim();
  const clipped = title.slice(0, 280);
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}
