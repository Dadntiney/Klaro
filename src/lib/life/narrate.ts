import type { KlaroItem } from "@/lib/domain";
import { addDays, formatWhen, getZonedParts, sameDay } from "@/lib/time";

export function dayItems(items: KlaroItem[], now = new Date(), offset = 0) {
  const target = addDays(getZonedParts(now), offset);
  return items
    .filter((item) => item.status === "open" && !item.parentId)
    .filter((item) => {
      const stamp = item.remindAt ?? item.dueAt;
      if (!stamp) return offset === 0 && item.kind === "taak";
      return sameDay(getZonedParts(new Date(stamp)), target);
    })
    .sort((left, right) => {
      const a = left.remindAt ?? left.dueAt ?? "";
      const b = right.remindAt ?? right.dueAt ?? "";
      return a.localeCompare(b);
    });
}

export function upcomingItems(items: KlaroItem[], now = new Date(), horizon = 14) {
  const today = getZonedParts(now);
  const end = addDays(today, horizon);
  return items
    .filter((item) => item.status === "open" && !item.parentId)
    .filter((item) => {
      const stamp = item.remindAt ?? item.dueAt;
      if (!stamp) return false;
      const parts = getZonedParts(new Date(stamp));
      if (sameDay(parts, today)) return false;
      return dayKey(parts) > dayKey(today) && dayKey(parts) <= dayKey(end);
    })
    .sort((left, right) => (left.remindAt ?? left.dueAt ?? "").localeCompare(right.remindAt ?? right.dueAt ?? ""))
    .slice(0, 3);
}

function dayKey(parts: { year: number; month: number; day: number }) {
  return parts.year * 10_000 + parts.month * 100 + parts.day;
}

export function narrateDay(items: KlaroItem[], now = new Date(), offset = 0) {
  const rows = dayItems(items, now, offset);
  const label = offset === 0 ? "vandaag" : offset === 1 ? "morgen" : "dan";
  if (rows.length === 0) {
    return offset === 0 ? "Je hebt vandaag niets gepland." : `Je hebt ${label} niets gepland.`;
  }
  const timed = rows.filter((item) => item.remindAt || item.dueAt);
  const openTasks = rows.filter((item) => item.kind === "taak" && !item.dueAt && !item.remindAt);
  const bits: string[] = [];
  if (openTasks.length > 0) {
    bits.push(
      openTasks.length === 1
        ? "Je hebt nog 1 openstaande taak."
        : `Je hebt nog ${openTasks.length} openstaande taken.`,
    );
  }
  if (timed[0]) {
    const when = formatWhen(timed[0].remindAt ?? timed[0].dueAt, now);
    bits.push(`${when ? `${capitalize(when)}: ` : ""}${timed[0].title}.`);
  }
  if (bits.length === 0) bits.push(`Je hebt ${label} ${rows.length} dingen.`);
  return bits.join(" ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
