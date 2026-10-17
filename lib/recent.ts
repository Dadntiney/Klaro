import { amsterdamMidnight } from "./nextdns.ts";
import type { Known } from "./overview.ts";

/**
 * Snel herberekenen: alleen de laatste uren (vanaf middernacht min 12 uur, zodat een bezoek dat gisteravond begon klopt) met
 * precies dezelfde rekenregels als het volledige overzicht, plus wat dat volledige overzicht over alle dagen leerde (`known`).
 * Daarna vervangt de verse berekening de groepen van vandaag; al het andere (oudere dagen, apparaten, inzichten) komt uit het
 * volledige overzicht. Zo zijn live en volledig rekenen elke minuut weer precies gelijk.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

export const recentFrom = (now: number) => amsterdamMidnight(now) - 12 * 3_600_000;

/** Wat het volledige overzicht leerde, met de apparaatlabels vertaald naar die van de snelle berekening (via het apparaat-id). */
export function knownFrom(full: Body): Known {
  return { auto: full.auto ?? [], helpers: full.learned?.helpers ?? [], followers: Object.entries(full.followers ?? {}).map(([k, site]) => k + "|" + site), parts: full.parts ?? [], heartbeat: full.heartbeat ?? [] };
}

export function mergeRecent(full: Body, recent: Body, now: number): Body {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(now);
  // Labels kunnen verschillen als niet alle apparaten in de laatste uren voorkomen: via het apparaat-id terugvertalen.
  const label = new Map<string, string>();
  for (const [id, l] of Object.entries(recent.deviceMap ?? {})) label.set(l as string, (full.deviceMap ?? {})[id] ?? (l as string));
  const fullKey = new Map<string, Body>();
  const fullSites = new Set<string>();
  for (const g of full.groups ?? []) { fullKey.set(g.d + "|" + g.dev + "|" + g.site, g); fullSites.add(g.site); }
  const meaningful = full.insights?.since && now - full.insights.since > 7 * 86_400_000;
  const fresh = (recent.groups ?? []).filter((g: Body) => g.d === today).map((g: Body) => {
    const dev = label.get(g.dev) ?? g.dev;
    const old = fullKey.get(g.d + "|" + dev + "|" + g.site);
    // "Nieuw" weet alleen het volledige overzicht (het kent alle dagen).
    const isNew = old ? old.isNew : !!(meaningful && g.main && !g.bg && !fullSites.has(g.site) && g.bl < g.n);
    return { ...g, dev, isNew };
  });
  const keep = (full.groups ?? []).filter((g: Body) => g.d !== today);
  const followers = { ...(full.followers ?? {}) };
  for (const [k, site] of Object.entries(recent.followers ?? {})) { const i = k.indexOf("|"); followers[(label.get(k.slice(0, i)) ?? k.slice(0, i)) + k.slice(i)] = site; }
  return { ...full, groups: [...fresh, ...keep].sort((a: Body, b: Body) => b.last - a.last), followers, recentAt: now };
}
