import { chainTimes } from "./companion.ts";
import { GAP } from "./sessions.ts";
import { TV_APPS } from "./sites.ts";

/**
 * Afspeelsignalen zonder eigen app (Conviva: de speler meldt elke ~minuut dat er nog afgespeeld wordt) horen bij een tv-app.
 * Elke dienst meldt via een eigen adres (Ziggo: cws-lgi, Disney+: een eigen code). Welke app bij een adres hoort, volgt uit de
 * meerderheid: bij welke app begonnen die meldingen meestal (laatst gebruikte tv-app, hooguit GAP ervoor). Daarna telt een
 * melding als kijken in die app zolang de reeks aansluit op echt verkeer van die app (elk hooguit GAP na het vorige), net als
 * bij Minecraft (lib/companion.ts). Een andere app die tussendoor even iets opvraagt, neemt de meldingen dus niet over.
 * Tijdens het kijken vraagt de app zelf soms 7 tot 20 minuten niets op; zonder dit valt het kijken in losse stukjes.
 *
 * `ev`: alles van één apparaat: verkeer van tv-apps (met `site`) en afspeelsignalen (zonder `site`).
 * Geeft per tijdstip van een signaal de site van de tv-app waar het bij hoort.
 */
export function assignPlayback(ev: { t: number; host: string; site?: string }[]): Map<number, string> {
  const sorted = [...ev].sort((a, b) => a.t - b.t);
  const appT = new Map<string, number[]>();
  const sigT = new Map<string, number[]>();
  const votes = new Map<string, Map<string, number>>();
  let last: { site: string; t: number } | null = null;
  for (const e of sorted) {
    if (e.site) {
      last = { site: e.site, t: e.t };
      (appT.get(e.site) ?? appT.set(e.site, []).get(e.site)!).push(e.t);
      continue;
    }
    (sigT.get(e.host) ?? sigT.set(e.host, []).get(e.host)!).push(e.t);
    if (last && e.t - last.t <= GAP) {
      const v = votes.get(e.host) ?? votes.set(e.host, new Map()).get(e.host)!;
      v.set(last.site, (v.get(last.site) ?? 0) + 1);
    }
  }
  const out = new Map<number, string>();
  for (const [host, ts] of sigT) {
    const best = [...(votes.get(host) ?? [])].sort((a, b) => b[1] - a[1])[0];
    if (!best) continue;
    for (const t of chainTimes(appT.get(best[0]) ?? [], ts, GAP, 0)) out.set(t, best[0]);
  }
  return out;
}

/**
 * Live: bij welke tv-app hoort een nieuw afspeelsignaal? Bij de app op hetzelfde apparaat en dezelfde dag waarvan de reeks
 * afspeelsignalen nog loopt (laatste beeld/geluid hooguit GAP geleden). Een nieuwe reeks wacht op de volledige berekening.
 */
export function liveTvApp<G extends { d: string; dev: string; site: string; lm?: number }>(groups: G[], d: string, dev: string, t: number): G | undefined {
  let best: G | undefined;
  for (const g of groups) {
    if (g.d !== d || g.dev !== dev || !TV_APPS.has(g.site) || !g.lm || t - g.lm > GAP || t < g.lm - GAP) continue;
    if (!best || g.lm > best.lm!) best = g;
  }
  return best;
}

/**
 * Hoe lang een regel na de laatste activiteit nog "nu" heet: precies zo lang als de chip van het apparaat daardoor groen blijft.
 * Gewoon 3 minuten; 5 minuten als er beeld/geluid speelt (laatste activiteit is een afspeelsignaal) of bij een app als Facebook
 * (scrollen laadt niet elke minuut iets nieuws); 6 minuten na minstens 10 minuten aaneengesloten gebruik (spelen, kijken).
 */
export function nowWindow(end: number, lm?: number, opt: { fg?: boolean; long?: boolean } = {}): number {
  let w = 180_000;
  if ((lm && lm >= end - 1_500) || opt.fg) w = 300_000;
  if (opt.long) w = 360_000;
  return w;
}

/** Berichten-apps worden ook op de achtergrond regelmatig wakker: daar telt lang open staan niet als lang gebruik. */
export const MSG = /^(whatsapp|telegram|signal|messenger|snapchat)\./;

/**
 * Is deze sessie (de laatst begonnen echte sessie van een apparaat) nu nog bezig? Eén regel voor de chip van het apparaat én
 * voor "nu" bij de rij, zodat ze altijd hetzelfde zeggen. Ook zolang er beeld/geluid van die sessie speelt (laatste 5 minuten).
 */
export function isNow(clock: number, x: { s: number; e: number; n?: number; f?: number }, g: { site: string; lm?: number }): boolean {
  const long = !MSG.test(g.site) && x.e - x.s >= 600_000 && (x.n ?? 0) >= 3;
  if (clock - x.e < nowWindow(x.e, g.lm, { fg: x.f !== undefined, long })) return true;
  return !!g.lm && g.lm >= x.s - 1_500 && clock - g.lm < 300_000;
}

/**
 * Op een tv is kijken één geheel: stukjes van dezelfde app met minder dan 15 minuten ertussen horen bij elkaar, zolang er
 * tussendoor geen andere app begon (zelfde samenvoeging als de lijst). Geeft het begin van het geheel waar `x` het laatste stukje van is.
 */
export function tvStart(x: { s: number }, pieces: { s: number; e: number }[], otherStarts: number[]): number {
  let s = x.s;
  for (const p of [...pieces].sort((a, b) => b.s - a.s)) {
    if (p.s >= s) continue;
    if (s - p.e > 15 * 60_000 || otherStarts.some((o) => o > p.e && o < s)) break;
    s = p.s;
  }
  return s;
}
