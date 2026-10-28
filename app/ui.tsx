import type { Session } from "@/lib/sessions";
import { minutes } from "@/lib/sessions";

export const tz = "Europe/Amsterdam";
export const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: tz });
export const timeSecFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
export const dayLabelFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
export const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: tz });

export const sumMin = (ss: Session[]) => ss.reduce((n, x) => n + minutes(x), 0);
export const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz });
export const hourOf = (t: number) => parseInt(hourFmt.format(t), 10) % 24;
export const isNight = (t: number) => hourOf(t) >= 23 || hourOf(t) < 6;

/** 45 -> "45 min", 75 -> "1 u 15 min". */
export function dur(min: number) {
  return min >= 60 ? `${Math.floor(min / 60)} u${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`;
}

/** Klein grijs icoon van het soort apparaat: onderscheid aan de vorm, zonder kleur. */
export function DevIcon({ name }: { name: string }) {
  const t = name.toLowerCase();
  const kind = /iphone|android|telefoon/.test(t) ? "phone" : /ipad|tablet/.test(t) ? "tablet" : /macbook|laptop|windows|chromebook/.test(t) ? "laptop" : /\btv\b|playstation|xbox|nintendo/.test(t) ? "tv" : "monitor";
  const shapes: Record<string, React.ReactNode> = {
    phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10.5 18.5h3" /></>,
    tablet: <><rect x="4.5" y="3" width="15" height="18" rx="2.2" /><path d="M11 18h2" /></>,
    laptop: <><rect x="5" y="5" width="14" height="10" rx="1.4" /><path d="M2.5 19h19" /></>,
    tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 20.5h8" /></>,
    monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v4M8 20h8" /></>,
  };
  return (
    <svg className="di" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {shapes[kind]}
    </svg>
  );
}


export function dayLabel(d: string) {
  if (d === "onbekend") return "Datum onbekend";
  const today = Date.now();
  if (d === dayKeyFmt.format(today)) return "Vandaag";
  if (d === dayKeyFmt.format(today - 86400_000)) return "Gisteren";
  const label = dayLabelFmt.format(new Date(d + "T12:00:00Z"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Netwerk buiten de wifi thuis: zendmast-balkjes (mobiel internet), wifi-teken (andere wifi), golven (hotspot) of een wereldbol (niet via thuis-wifi, soort onbekend). */
export function NetIcon({ soort }: { soort: "mobiel" | "vast" | "hotspot" | null | undefined }) {
  return (
    <svg className="di" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {soort === "hotspot" ? <><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>
        : soort === "mobiel" ? <path d="M5 19v-3M10 19v-6M15 19v-9M20 19V7" />
        : soort === "vast" ? <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a4.5 4.5 0 0 1 6.4 0" /><circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none" /></>
        : <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>}
    </svg>
  );
}

