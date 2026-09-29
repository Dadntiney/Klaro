export const AMSTERDAM = "Europe/Amsterdam";

const WEEKDAY_FROM_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const WEEKDAYS_NL = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;

export const MONTHS_NL = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export function getZonedParts(date: Date, timeZone = AMSTERDAM): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;

  const weekday = WEEKDAY_FROM_SHORT[parts.weekday] ?? 0;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday,
  };
}

export function addDays(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
) {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = AMSTERDAM,
): Date {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = desiredUtc;

  for (let pass = 0; pass < 3; pass += 1) {
    const parts = getZonedParts(new Date(utc), timeZone);
    const actualUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0,
    );
    const diff = desiredUtc - actualUtc;
    if (diff === 0) break;
    utc += diff;
  }

  return new Date(utc);
}

export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function sameDay(
  left: Pick<ZonedParts, "year" | "month" | "day">,
  right: Pick<ZonedParts, "year" | "month" | "day">,
) {
  return (
    left.year === right.year && left.month === right.month && left.day === right.day
  );
}

export function toDateTimeLocal(iso: string | null, timeZone = AMSTERDAM) {
  if (!iso) return "";
  const parts = getZonedParts(new Date(iso), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function fromDateTimeLocal(value: string | null | undefined, timeZone = AMSTERDAM) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  return zonedTimeToUtc(year, month, day, hour, minute, timeZone).toISOString();
}

export function formatWhen(iso: string | null, now = new Date()) {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;

  const parts = getZonedParts(when);
  const today = getZonedParts(now);
  const tomorrow = addDays(today, 1);
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`;

  if (sameDay(parts, today)) return `vandaag ${time}`;
  if (sameDay(parts, tomorrow)) return `morgen ${time}`;

  const dayStamp = Date.UTC(parts.year, parts.month - 1, parts.day);
  const todayStamp = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((dayStamp - todayStamp) / 86_400_000);

  if (diffDays > 1 && diffDays < 7) {
    return `${WEEKDAYS_NL[parts.weekday]} ${time}`;
  }

  return `${parts.day} ${MONTHS_NL[parts.month - 1]} ${time}`;
}

export function formatLongDate(now = new Date()) {
  const parts = getZonedParts(now);
  return `${WEEKDAYS_NL[parts.weekday]} ${parts.day} ${MONTHS_NL[parts.month - 1]}`;
}

export function greeting(now = new Date(), name?: string | null) {
  const hour = getZonedParts(now).hour;
  const hello =
    hour < 6 ? "Goedenacht" : hour < 12 ? "Goedemorgen" : hour < 18 ? "Goedemiddag" : "Goedenavond";
  return name ? `${hello}, ${name}` : hello;
}

export function isPast(iso: string | null, now = new Date()) {
  if (!iso) return false;
  return new Date(iso).getTime() < now.getTime();
}
