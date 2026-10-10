/** Een sessie: verzoeken die minder dan `GAP` uit elkaar liggen horen bij één periode van gebruik. */
export interface Session {
  s: number; // start (unix ms)
  e: number; // einde
  n?: number; // aantal verzoeken in de sessie
  m?: number; // waarvan beeld/geluid-verkeer (video of muziek)
  f?: number; // bij apps met veel achtergrondverkeer: aantal keer dat er echt inhoud laadde (foto's, video's)
  mh?: number; // bij gewone websites: hoe vaak de site zelf (www., nl., ...) werd opgevraagd; 0 = alleen losse onderdelen (plaatjes, tellers)
  lf?: number; // tijdstip van het laatste inhoud-moment (live tellen)
  lmt?: number; // tijdstip van het laatste beeld/geluid-moment (live tellen)
  emb?: 1;
  res?: 1; // alleen losse onderdelen (tellers, plaatjes, advertenties, mail-onderdelen): geen bezoek // ingesloten filmpje op een andere site die op dat moment bezocht werd: hoort bij die site, geen eigen bezoek
  ml?: 1; // hoort bij het openen van een e-mail (plaatjes/tellers van een nieuwsbrief), geen bezoek
}

export const GAP = 5 * 60_000;
/** Opvragingen binnen dit venster zijn één moment (NextDNS logt een adres tot 3x: A, AAAA, HTTPS). */
export const MOMENT = 1_500;

/** Aantal losse momenten in een reeks tijdstippen (alles binnen 1,5 seconde van het vorige telt als hetzelfde moment). */
export function moments(times: number[]): number {
  const t = [...times].sort((a, b) => a - b);
  let n = 0;
  let last = -Infinity;
  for (const x of t) {
    if (x - last > MOMENT) n++;
    last = x;
  }
  return n;
}
const MAX = 5;

/** Alle sessies uit losse tijdstippen, nieuwste eerst. */
export function allSessions(times: number[]): Session[] {
  const t = times.filter(Boolean).sort((a, b) => a - b);
  const out: Session[] = [];
  for (const x of t) {
    const last = out[out.length - 1];
    if (last && x - last.e <= GAP) {
      last.e = x;
      last.n = (last.n ?? 1) + 1;
    } else out.push({ s: x, e: x, n: 1 });
  }
  return out.reverse();
}

/** Maak sessies van losse tijdstippen; nieuwste eerst, maximaal `MAX`. */
export function clusterSessions(times: number[]): Session[] {
  return allSessions(times).slice(0, MAX);
}

/** Totaal aantal minuten over alle sessies. */
export function totalMinutes(times: number[]): number {
  return allSessions(times).reduce((n, x) => n + minutes(x), 0);
}

/**
 * Voeg één nieuw tijdstip toe aan bestaande sessies (nieuwste eerst).
 * `fg`: alleen bij apps met achtergrondverkeer (Facebook, Instagram, WhatsApp, ...): true = inhoud geladen, false = achtergrond.
 * Achtergrondverkeer telt dan wel als verzoek, maar verlengt de gebruiksduur niet.
 */
export function extendSessions(ss: Session[], t: number, media = false, fg?: boolean, res?: boolean): Session[] {
  const next = ss.map((x) => ({ ...x }));
  const i = next.findIndex((x) => t >= x.s - GAP && t <= x.e + GAP);
  if (i >= 0) {
    const x = next[i];
    const prevE = x.e;
    if (fg === undefined || fg || media) {
      if (fg !== undefined && !(x.f ?? 0) && !(x.m ?? 0)) { x.s = t; x.e = t; } // eerste echte inhoud: daar begint het gebruik
      x.s = Math.min(x.s, t);
      x.e = Math.max(x.e, t);
    }
    // Tellen in momenten (zelfde telling als de server): binnen 1,5 s van de vorige opvraging telt niet opnieuw.
    if (x.n !== undefined && Math.abs(t - prevE) > MOMENT) x.n = x.n + 1;
    // Momenten tellen, geen opvragingen: dezelfde foto die 3x wordt opgevraagd is één moment.
    if (media && !(x.lmt && Math.abs(t - x.lmt) <= MOMENT)) x.m = (x.m ?? 0) + 1;
    if (media) x.lmt = t;
    if (fg && !(x.lf && Math.abs(t - x.lf) <= MOMENT)) x.f = (x.f ?? 0) + 1;
    if (fg) x.lf = t;
    if (res === false) delete x.res; // iets van de site zelf erbij: wel een bezoek
    return next.sort((a, b) => b.e - a.e);
  }
  return [{ s: t, e: t, n: 1, ...(media ? { m: 1, lmt: t } : {}), ...(fg !== undefined ? { f: fg ? 1 : 0, ...(fg ? { lf: t } : {}) } : {}), ...(res ? { res: 1 as const } : {}) }, ...next].sort((a, b) => b.e - a.e).slice(0, MAX);
}

/** Minuten van een sessie, minimaal 1 als er meer dan een paar seconden tussen zit; 0 = alleen een korte aanraking. */
export function minutes(x: Session): number {
  const ms = x.e - x.s;
  return ms < 60_000 ? 0 : Math.round(ms / 60_000);
}

/** Zoals `extendSessions`, maar zonder af te kappen (voor het dagtotaal per apparaat). */
export function extendAll(ss: Session[], t: number): Session[] {
  const next = ss.map((x) => ({ ...x }));
  const i = next.findIndex((x) => t >= x.s - GAP && t <= x.e + GAP);
  if (i >= 0) {
    next[i].s = Math.min(next[i].s, t);
    next[i].e = Math.max(next[i].e, t);
    if (next[i].n !== undefined) next[i].n = next[i].n! + 1;
  } else next.push({ s: t, e: t, n: 1 });
  return next.sort((a, b) => b.e - a.e);
}

/**
 * Lijkt deze sessie op echt gebruik door een mens? Een kort achtergrondbericht (een app die even ververst,
 * een camera of lamp die inchecken) levert maar een paar verzoeken op; echt gebruik veel meer of duurt langer.
 * Sessies zonder telling (oudere gegevens) tellen mee.
 */
export function isHuman(x: Session): boolean {
  if (x.emb || x.res) return false;
  if (x.ml && x.e - x.s <= 90_000) return false; // uit een e-mail (tenzij er daarna echt verder gekeken is)
  if (x.f !== undefined) return x.f >= 2 || (x.m ?? 0) >= 2; // app met achtergrondverkeer: alleen als er echt inhoud laadde
  if (x.n === undefined) return true;
  if ((x.m ?? 0) >= 2) return true; // beeld/geluid (Disney+, YouTube): er wordt gekeken of geluisterd
  // Losse opvragingen (dubbele binnen 1,5 s tellen als één): minstens 2. Eén los verzoek is geen bezoek.
  // (Achtergrondverkeer van social-apps, mail, tellers en voorvertoningen worden hierboven al apart afgevangen.)
  return x.n >= 2;
}
