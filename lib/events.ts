import { isEspHost, isMailClientHost } from "./mail.ts";
import { extractHost } from "./parse.ts";
import { classify, fgHit, isPlaying, isResourceHost, isQuietHost, payKind } from "./sites.ts";
import { anonId, deviceType } from "./names.ts";
import { categoryOf } from "./categories.ts";

export interface LiveEvent {
  t: number;
  host: string; // het opgevraagde adres (om dubbele opvragingen binnen 1,5 s als één te tellen, net als de server)
  devId: string;
  type: string;
  site: string;
  name: string;
  icon: string;
  bg: boolean;
  adult: boolean;
  main: boolean;
  flag?: string;
  cat: string;
  blocked?: boolean; // door NextDNS geblokkeerd
  media?: boolean; // beeld/geluid-verkeer (video of muziek)
  quiet?: boolean; // verbinding openhouden: geen bezoek
  fg?: boolean; // bij apps met achtergrondverkeer: true = inhoud geladen, false = alleen achtergrond
  res?: boolean; // los onderdeel (teller, plaatje, advertentie)
  esp?: boolean; // mailbedrijf (nieuwsbrief geopend)
  mc?: boolean; // mailprogramma haalt mail op
  pay?: { kind: string; level: "checkout" | "store" }; // betaalmoment
}

/** Zet één NextDNS-logregel (JSON) om naar een weergave-event. De echte apparaatnaam blijft op de server. */
export function toEvent(e: Record<string, unknown>): LiveEvent | null {
  const t = Date.parse(String(e.timestamp ?? ""));
  const host = extractHost(String(e.domain ?? ""));
  if (!host || !t) return null;
  const device = (e.device ?? {}) as { id?: string; name?: string; model?: string };
  const devId = device.id?.trim() || (device.name?.trim() && anonId(device.name.trim())) || "onbekend";
  const type = deviceType(device.name ?? "", device.model ?? "");
  let info = classify(host);
  // Door NextDNS geblokkeerd, met als reden porno/dating: altijd belangrijk, ook als het adres niet op mijn lijst staat.
  const blocked = String(e.status ?? "").toLowerCase() === "blocked";
  const reasons = (Array.isArray(e.reasons) ? e.reasons : [])
    .map((r) => `${(r as { id?: string }).id ?? ""} ${(r as { name?: string }).name ?? ""}`)
    .join(" ")
    .toLowerCase();
  if (blocked && /porn|adult|sex|dating|erotic/.test(reasons) && !info.flag) info = { ...info, bg: false, main: true, flag: "Geblokkeerd" };
  return { t, host, devId, type, site: info.site, name: info.name, icon: info.icon, bg: info.bg, adult: info.adult, main: info.main, flag: info.flag, cat: categoryOf(info.site), blocked, media: isPlaying(host, blocked), quiet: isQuietHost(host), fg: fgHit(info.site, host) === undefined ? undefined : !blocked && !!fgHit(info.site, host), res: isResourceHost(host) || undefined, esp: isEspHost(host) || undefined, mc: isMailClientHost(host) || undefined, pay: !blocked ? payKind(host) ?? undefined : undefined };
}
