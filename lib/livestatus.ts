import { isHuman, type Session } from "./sessions.ts";
import { isPlainSite, isSystemSite } from "./system.ts";
import { isNow, tvStart } from "./play.ts";

/**
 * Live-status per apparaat (de groene chip). Gedeeld door de pagina en scripts/controle.ts, zodat de dagelijkse controle
 * precies dezelfde regels naspeelt als de pagina.
 */
/** Altijd tonen (wens eigenaar), ook als het geen echt gebruik lijkt. */
export const ALWAYS_SHOW = new Set(["gofiev.nl", "meethue.com", "eufy.com"]);

export interface LiveGroup {
  d: string;
  dev: string;
  site: string;
  name: string;
  n: number;
  bg?: boolean;
  main?: boolean;
  flag?: string;
  bl?: number;
  lm?: number;
  ts?: number[];
  ss?: Session[];
}

/** Tv-apparaten: een "bezoek" korter dan een minuut is een voorvertoning op het beginscherm of de screensaver, geen kijken. */
export const isTv = (dev: string) => /^(Apple TV|TV)( \d+)?$/.test(dev);
const tvBlip = (dev: string, x: { s: number; e: number }) => isTv(dev) && x.e - x.s < 60_000;
/**
 * Korte tv-stukjes (< 1 min) zijn meestal gepiep van het beginscherm. Uitzondering: iemand wisselt van app. Dan was er vlak
 * ervoor (≤ 2 min) een andere app echt in gebruik, en speelt de nieuwe app meteen af (≥ 3 momenten, ≥ 2 keer beeld/geluid).
 * Tijdens het kijken vraagt een tv weinig nieuws op (de verbinding blijft open), dus zo'n begin is vaak alles wat we zien.
 */
export function tvBlipper<G extends LiveGroup>(groups: G[]) {
  const long = new Map<string, { e: number; site: string }[]>();
  for (const g of groups) {
    if (!isTv(g.dev) || !g.main || g.bg) continue;
    for (const x of g.ss ?? []) if (isHuman(x) && x.e - x.s >= 60_000) (long.get(g.dev) ?? long.set(g.dev, []).get(g.dev)!).push({ e: x.e, site: g.site });
  }
  return (g: LiveGroup, x: Session) =>
    tvBlip(g.dev, x) && !((x.n ?? 0) >= 3 && (x.m ?? 0) >= 2 && (long.get(g.dev) ?? []).some((v) => v.site !== g.site && x.s - v.e >= -30_000 && x.s - v.e <= 120_000));
}

export type DeviceUse<G extends LiveGroup> = ReturnType<typeof deviceUse<G>>;

/** Bewijs van gebruik per apparaat: de laatst begonnen echte sessie (zoals de lijst), beeld/geluid zonder eigen regel, losse opvragingen. */
export function deviceUse<G extends LiveGroup>(groups: G[], auto: Set<string>) {
  const hits = new Map<string, { t: number; site: string; fgApp: boolean }[]>();
  const media = new Map<string, number>(); // beeld/geluid van adressen die zelf geen regel worden (bijv. Conviva zonder app)
  const latest = new Map<string, { g: G; x: Session }>(); // laatst begonnen echte sessie per apparaat (zoals de lijst)
  const blip = tvBlipper(groups);
  // Zichtbare echte sessies per apparaat: een app zonder eigen website telt (net als in de lijst) alleen als er niets anders speelde.
  const vis = new Map<string, Session[]>();
  for (const g of groups) if (!g.bg && g.main) for (const x of g.ss ?? []) if (isHuman(x) && !blip(g, x)) (vis.get(g.dev) ?? vis.set(g.dev, []).get(g.dev)!).push(x);
  for (const g of groups) {
    const fgApp = (g.ss ?? []).some((x) => x.f !== undefined);
    const standalone = !g.main && !g.flag && !isSystemSite(g.site);
    const rowable = !g.bg && ((g.bl ?? 0) < g.n || !!g.flag) && (g.main || !!g.flag || standalone);
    // Beeld/geluid van iets dat geen eigen regel kan worden (afspeelsignalen zonder app) telt alleen als die sessie echt
    // gebruik lijkt, en op een tv pas na een minuut (geen voorvertoning op het beginscherm).
    const cur = g.ss?.[0];
    if (!rowable && g.lm && cur && isHuman(cur) && !blip(g, cur) && g.lm > (media.get(g.dev) ?? 0)) media.set(g.dev, g.lm);
    if (!rowable) continue;
    // Zelfde sessies als in de lijst: echte bezoeken van sites en apps (ook een zoekopdracht bij Google), en apps zonder website.
    for (const x of g.ss ?? []) {
      const real = g.flag
        ? true
        : standalone
        ? (x.n ?? 0) >= 3 && !x.ml && !x.res && !(vis.get(g.dev) ?? []).some((v) => v.s <= x.e + 60_000 && v.e >= x.s - 60_000)
        : isHuman(x) && !blip(g, x) && !(x.pv && !x.lg && auto.has(g.dev + "|" + g.site));
      const cur2 = latest.get(g.dev);
      if (real && (!cur2 || x.s > cur2.x.s || (x.s === cur2.x.s && x.e > cur2.x.e))) latest.set(g.dev, { g, x });
    }
    // Losse opvragingen: alleen van gewone sites en apps. Apps met een eigen inhoud-regel (Facebook, Instagram, WhatsApp, Google)
    // verversen op de achtergrond vaak samen; hun echte gebruik telt hierboven al.
    if (!g.main || fgApp || (isSystemSite(g.site) && isPlainSite(g)) || auto.has(g.dev + "|" + g.site)) continue; // ook geen widget die zichzelf ververst
    const a = hits.get(g.dev) ?? [];
    for (const t of g.ts ?? []) a.push({ t, site: g.site, fgApp });
    hits.set(g.dev, a);
  }
  // Op een tv: het laatste stukje telt samen met de stukjes ervoor, net als in de lijst.
  for (const [dev, l] of latest) {
    if (!isTv(dev)) continue;
    const pieces = (l.g.ss ?? []).filter((x) => isHuman(x) && !blip(l.g, x));
    const others = groups.filter((g) => g.dev === dev && g !== l.g && !g.bg && g.main).flatMap((g) => (g.ss ?? []).filter((x) => isHuman(x) && !blip(g, x)).map((x) => x.s));
    latest.set(dev, { g: l.g, x: { ...l.x, s: tvStart(l.x, pieces, others) } });
  }
  return { hits, media, latest };
}

// In gebruik (per apparaat, niet per app):
// - de laatst begonnen echte sessie is nog bezig (zelfde regel als "nu" bij de rij, zie lib/play.ts isNow);
// - of beeld/geluid van iets zonder eigen regel (laatste 5 minuten);
// - of activiteit in de laatste 3 minuten, verspreid over minstens 45 seconden, en de laatste minder dan 2 minuten geleden,
//   met minstens 2 verschillende gewone sites/apps (wisselen = een mens), of 1 gewone site.
export function isActiveNow<G extends LiveGroup>(use: DeviceUse<G>, name: string, clock: number): boolean {
  const l = use.latest.get(name);
  if (l && isNow(clock, l.x, l.g)) return true;
  if (clock - (use.media.get(name) ?? 0) < 300_000) return true;
  const t = (use.hits.get(name) ?? []).filter((x) => clock - x.t < 180_000);
  if (t.length < 3) return false;
  const hi = Math.max(...t.map((x) => x.t));
  if (clock - hi >= 120_000 || hi - Math.min(...t.map((x) => x.t)) < 45_000) return false;
  return new Set(t.map((x) => x.site)).size >= 2 || t.some((x) => !x.fgApp);
}

/**
 * Waarmee is een apparaat nu bezig (voor in de groene chip)? Alleen als de chip groen is dankzij de laatst begonnen sessie die
 * ook in de lijst "nu" heet: dan is het zeker. Groen door losse opvragingen of alleen beeld/geluid: geen naam (niet raden).
 */
export function activeWhat<G extends LiveGroup & { name?: string }>(use: DeviceUse<G>, name: string, clock: number): string | undefined {
  const l = use.latest.get(name);
  return l && isNow(clock, l.x, l.g) ? l.g.name ?? l.g.site : undefined;
}
