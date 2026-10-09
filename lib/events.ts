import { extractHost } from "./parse.ts";
import { classify } from "./sites.ts";
import { deviceType } from "./names.ts";

export interface LiveEvent {
  t: number;
  devId: string;
  type: string;
  site: string;
  name: string;
  icon: string;
  bg: boolean;
  adult: boolean;
  main: boolean;
  flag?: string;
}

/** Zet één NextDNS-logregel (JSON) om naar een weergave-event. De echte apparaatnaam blijft op de server. */
export function toEvent(e: Record<string, unknown>): LiveEvent | null {
  const t = Date.parse(String(e.timestamp ?? ""));
  const host = extractHost(String(e.domain ?? ""));
  if (!host || !t) return null;
  const device = (e.device ?? {}) as { id?: string; name?: string; model?: string };
  const devId = device.id?.trim() || device.name?.trim() || "onbekend";
  const type = deviceType(device.name ?? "", device.model ?? "");
  const info = classify(host);
  return { t, devId, type, site: info.site, name: info.name, icon: info.icon, bg: info.bg, adult: info.adult, main: info.main, flag: info.flag };
}
