import type { ItemKind, Priority } from "@/lib/domain";
import { addDays, getZonedParts, zonedTimeToUtc } from "@/lib/time";
import type { PlannedAction } from "./plan";

export type NewLifeItem = {
  captureId: string | null;
  kind: ItemKind;
  title: string;
  notes: string | null;
  dueAt: string | null;
  remindAt: string | null;
  priority: Priority;
  category: string | null;
  location: string | null;
  recurrence: string | null;
};

export type NewDocument = {
  captureId: string | null;
  title: string;
  category: string;
  summary: string | null;
  supplier: string | null;
  amountCents: number | null;
  referenceCode: string | null;
  dueOn: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

export type NewListAdd = {
  listTitle: string;
  items: string[];
};

export function materialize(actions: PlannedAction[], captureId: string | null) {
  const items: NewLifeItem[] = [];
  const documents: NewDocument[] = [];
  const lists: NewListAdd[] = [];

  for (const entry of actions) {
    if (entry.type === "CREATE_TASK" || entry.type === "CREATE_NOTE") {
      items.push(toItem(entry, captureId, entry.type === "CREATE_NOTE" ? "notitie" : "taak"));
    } else if (entry.type === "CREATE_REMINDER") {
      items.push(toItem(entry, captureId, "herinnering"));
    } else if (entry.type === "CREATE_EVENT") {
      items.push(toItem(entry, captureId, "afspraak"));
    } else if (entry.type === "SAVE_DOCUMENT" && entry.payload.document) {
      const document = entry.payload.document;
      documents.push({
        captureId,
        title: document.title.slice(0, 200),
        category: document.category,
        summary: document.summary,
        supplier: document.supplier,
        amountCents: document.amountCents,
        referenceCode: document.referenceCode,
        dueOn: document.dueOn,
        startsOn: document.startsOn,
        endsOn: document.endsOn,
      });
    } else if (entry.type === "CREATE_LIST_ITEM" && entry.payload.listTitle) {
      lists.push({
        listTitle: entry.payload.listTitle.slice(0, 80),
        items: entry.payload.listItems.map((item) => item.slice(0, 200)).filter(Boolean),
      });
    }
  }

  return { items, documents, lists };
}

export function nextRecurrence(iso: string, recurrence: string, now = new Date()) {
  const parts = getZonedParts(new Date(iso));
  if (recurrence === "daily") return shift(addDays(parts, 1), parts);
  if (recurrence === "weekly") return shift(addDays(parts, 7), parts);
  if (recurrence === "monthly") {
    const month = parts.month === 12 ? 1 : parts.month + 1;
    const year = parts.month === 12 ? parts.year + 1 : parts.year;
    return zonedTimeToUtc(year, month, Math.min(parts.day, 28), parts.hour, parts.minute).toISOString();
  }
  if (recurrence === "yearly") {
    return zonedTimeToUtc(parts.year + 1, parts.month, parts.day, parts.hour, parts.minute).toISOString();
  }
  if (recurrence === "first_monday") {
    const start = parts.month === 12
      ? { year: parts.year + 1, month: 1, day: 1 }
      : { year: parts.year, month: parts.month + 1, day: 1 };
    const noon = zonedTimeToUtc(start.year, start.month, 1, 12, 0);
    const weekday = getZonedParts(noon).weekday;
    const day = addDays(start, (1 - weekday + 7) % 7);
    const next = zonedTimeToUtc(day.year, day.month, day.day, parts.hour, parts.minute);
    if (next.getTime() <= now.getTime()) return nextRecurrence(next.toISOString(), recurrence, now);
    return next.toISOString();
  }
  return null;
}

function shift(day: { year: number; month: number; day: number }, clock: { hour: number; minute: number }) {
  return zonedTimeToUtc(day.year, day.month, day.day, clock.hour, clock.minute).toISOString();
}

function toItem(entry: PlannedAction, captureId: string | null, kind: ItemKind): NewLifeItem {
  return {
    captureId,
    kind,
    title: (entry.payload.title || entry.title).slice(0, 280),
    notes: entry.payload.notes,
    dueAt: kind === "taak" || kind === "afspraak" ? entry.payload.dueAt ?? entry.payload.remindAt : entry.payload.dueAt,
    remindAt: kind === "herinnering" || kind === "afspraak" ? entry.payload.remindAt ?? entry.payload.dueAt : entry.payload.remindAt,
    priority: entry.payload.priority,
    category: entry.payload.category,
    location: entry.payload.location,
    recurrence: entry.payload.recurrence,
  };
}
