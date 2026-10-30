import { isHuman, type Session } from "./sessions.ts";
import { isPlainSite, isSystemSite } from "./system.ts";
import { isNow, tvStart } from "./play.ts";
import { GAME_GAP, HEARTBEAT_GAP, NAV_APPS, NAV_GAP } from "./sites.ts";

/**
 * Live-status per apparaat (de groene chip). Gedeeld door de pagina en scripts/controle.ts, zodat de dagelijkse controle
 * precies dezelfde regels naspeelt als de pagina.
 */
/** Altijd tonen (wens eigenaar), ook als het geen echt gebruik lijkt. */
export const ALWAYS_SHOW = new Set(["gofiev.nl", "meethue.com", "eufy.com"]);
/**
 * Voor sommige "altijd tonen"-apps alleen als de app echt opengaat (wens eigenaar, 18 okt): eufy start met een vaste reeks
 * adressen (passport/house/news/...: ~30 keer in 3 weken, nooit 's nachts). Pushverbinding, cameraplaatjes en de website (de
 * wachtwoordenlijst haalt www.eufy.com op voor het logo) tellen niet.
 */
export const ALWAYS_SHOW_OPEN: Record<string, RegExp> = {
  "eufy.com": /^app-(passport|house|news|devicerelation|devicemanage|things|agreement|shopping)-[a-z]+-pr\.eufy\.com$|^app\.eufy\.com$|^mall-web-eu\.eufy\.com$/,
};

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
export function deviceUse<G extends LiveGroup>(groups: G[], auto: Set<string>, followers: Record<string, string> = {}, heartbeat?: string[]) {
  const hits = new Map<string, { t: number; site: string; fgApp: boolean }[]>();
  const media = new Map<string, number>(); // beeld/geluid van adressen die zelf geen regel worden (bijv. Conviva zonder app)
  const latest = new Map<string, { g: G; x: Session }>(); // de echte sessie die nu het laatst bezig was, per apparaat (zoals de lijst)
  const cands = new Map<string, { g: G; x: Session }[]>();
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
      if (real) (cands.get(g.dev) ?? cands.set(g.dev, []).get(g.dev)!).push({ g, x });
    }
    // Losse opvragingen: alleen van gewone sites en apps. Apps met een eigen inhoud-regel (Facebook, Instagram, WhatsApp, Google)
    // verversen op de achtergrond vaak samen; hun echte gebruik telt hierboven al.
    if (!g.main || fgApp || (isSystemSite(g.site) && isPlainSite(g)) || auto.has(g.dev + "|" + g.site)) continue; // ook geen widget die zichzelf ververst
    const a = hits.get(g.dev) ?? [];
    // Niet uit een nieuwsbrief, doorstuur-link of losse onderdelen: die sessies laat de lijst ook weg (29 okt 16:26: plaatjes van
    // twee nieuwsbrieven en een Hue-tikje hielden de chip 1,5 min groen zonder rij "nu").
    const notVisit = (g.ss ?? []).filter((x) => x.emb || x.res || x.rf || x.rl || (x.ml && !isHuman(x)));
    for (const t of g.ts ?? []) if (!notVisit.some((x) => t >= x.s && t <= x.e)) a.push({ t, site: g.site, fgApp });
    hits.set(g.dev, a);
  }
  // Welke sessie telt: niet een die voorbij is doordat daarna een andere app begon die ook doorliep (superseded, zoals de rij "nu");
  // daarvan de laatst bezig geweest (bij gelijk einde de laatst begonnen). Zo blijft Disney+ "nu" na even langs het tv-beginscherm.
  for (const [dev, list] of cands) {
    let best: { g: G; x: Session } | undefined;
    for (const c of list) {
      if (superseded(c.x, list.filter((o) => o !== c).map((o) => o.x))) continue;
      if (!best || c.x.e > best.x.e || (c.x.e === best.x.e && c.x.s > best.x.s)) best = c;
    }
    if (best) latest.set(dev, best);
  }
  // Op een tv: het laatste stukje telt samen met de stukjes ervoor, net als in de lijst.
  // Ook losse beeldmomenten van de app tellen mee als brug of verlenging (zelfde regel als lib/usage.ts), en het aantal
  // opvragingen van het geheel bepaalt of het "lang" kijken is (anders zei de chip na 3 min al "uit" en de rij nog 6 min "nu").
  for (const [dev, l] of latest) {
    if (!isTv(dev)) continue;
    const bridge = (x: Session) => (x.m ?? 0) >= 1 && !x.ml && !x.res && !x.emb;
    const pieces = (l.g.ss ?? []).filter((x) => (isHuman(x) && !blip(l.g, x)) || bridge(x));
    const others = groups.filter((g) => g.dev === dev && g !== l.g && !g.bg && g.main).flatMap((g) => (g.ss ?? []).filter((x) => isHuman(x) && !blip(g, x)).map((x) => x.s));
    const s = tvStart(l.x, pieces, others);
    let e = l.x.e;
    for (const p of pieces.filter((p) => p.s > l.x.s).sort((a, b) => a.s - b.s)) {
      if (p.s - e > 15 * 60_000 || others.some((o) => o > e && o < p.s)) break;
      e = Math.max(e, p.e);
    }
    const n = pieces.filter((p) => p.s >= s && p.s <= e).reduce((a, p) => a + (p.n ?? 1), 0);
    latest.set(dev, { g: l.g, x: { ...l.x, s, e, n } });
  }
  // Stukjes samenvoegen precies zoals de lijst (lib/usage.ts): navigatie (NAV_GAP), apps met een vaste melding via een
  // doorverwijs-adres (HEARTBEAT_GAP, zoals NPO en Toca Boca) en een spel dat echt opstartte (gs, GAME_GAP). Anders zei de chip na
  // 3 min "uit" terwijl de rij van het geheel nog "nu" zei (26 okt 16:21-16:41: NPO op de iPad).
  // Zelfde als lib/usage.ts: alleen bij een echte vaste melding (heartbeat) altijd; bij een ander doorverwijs-adres alleen als één
  // kant al even duurde of beeld/geluid had (29 okt 17:45: twee keer kort de Hue-app openen hield het bolletje groen).
  const followed = new Set(Object.entries(followers).map(([k, site]) => k.slice(0, k.indexOf("|")) + "|" + site));
  const beat = new Set(heartbeat ?? []);
  for (const [dev, l] of latest) {
    if (isTv(dev)) continue;
    const gap = NAV_APPS.has(l.g.site) ? NAV_GAP : followed.has(dev + "|" + l.g.site) ? HEARTBEAT_GAP : (l.g.ss ?? []).some((x) => x.gs) ? GAME_GAP : 0;
    if (!gap) continue;
    const needMedia = gap === HEARTBEAT_GAP && !beat.has(dev + "|" + l.g.site);
    const joins = (p: Session, q: Session) => q.s - p.e <= gap && (!needMedia || !!p.m || !!q.m || p.e - p.s >= 60_000 || q.e - q.s >= 60_000);
    const all = [...(l.g.ss ?? [])].sort((a, b) => a.s - b.s);
    const i = all.findIndex((x) => x.s === l.x.s);
    if (i < 0) continue;
    let a = i, b = i;
    while (a > 0 && joins(all[a - 1], all[a])) a--;
    while (b < all.length - 1 && joins(all[b], all[b + 1])) b++;
    const span = all.slice(a, b + 1);
    latest.set(dev, { g: l.g, x: { ...l.x, s: span[0].s, e: Math.max(...span.map((x) => x.e)), n: span.reduce((n, x) => n + (x.n ?? 1), 0) } });
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

/**
 * Is dit bezoek "nu" voorbij omdat er op hetzelfde apparaat daarna een andere app begon? Alleen als die latere app ook minstens zo
 * lang doorliep: even langs andere apps op het beginscherm van de Apple TV (25 okt 19:30: Netflix, Max, Prime Video 1-2 min)
 * terwijl Disney+ nog 2 uur doorliep, maakt Disney+ niet "niet meer nu" (de chip zei terecht groen). `others`: de echte-gebruik-
 * sessies van de andere regels van dat apparaat.
 */
/**
 * Op een telefoon, tablet of computer staat maar één app of site tegelijk voor (muziek en navigatie lopen ernaast en tellen hier
 * niet mee). Kwam er bij een andere duidelijk later nog iets binnen, dan is dit bezoek niet meer "nu" (30 okt 08:43: site geopend
 * vanuit Google, 17 s later weer zoekresultaten; beide stonden op "nu"). Niet op een tv: daar flitsen andere apps even langs.
 */
export function overtaken(x: { e: number }, others: { e: number }[]): boolean {
  return others.some((o) => o.e > x.e + 10_000);
}

export function superseded(x: { s: number; e: number }, others: { s: number; e: number }[]): boolean {
  // Ook als het laatste van dit bezoek hooguit 5 s ná het begin van de nieuwe pagina kwam: dat is code die die pagina meelaadt
  // (29 okt 15:08: klik vanuit Google op een website, die laadt www.google.nl als advertentiecode; Google bleef "nu").
  return others.some((o) => o.s > x.s && (o.e >= x.e || x.e - o.s <= 5_000));
}
