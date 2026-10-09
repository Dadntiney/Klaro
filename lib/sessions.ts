/** Een sessie: verzoeken die minder dan `GAP` uit elkaar liggen horen bij één periode van gebruik. */
export interface Session {
  s: number; // start (unix ms)
  e: number; // einde
  n?: number; // aantal verzoeken in de sessie
}

export const GAP = 5 * 60_000;
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

/** Voeg één nieuw tijdstip toe aan bestaande sessies (nieuwste eerst). */
export function extendSessions(ss: Session[], t: number): Session[] {
  const next = ss.map((x) => ({ ...x }));
  const i = next.findIndex((x) => t >= x.s - GAP && t <= x.e + GAP);
  if (i >= 0) {
    next[i].s = Math.min(next[i].s, t);
    next[i].e = Math.max(next[i].e, t);
    if (next[i].n !== undefined) next[i].n = next[i].n! + 1;
    return next.sort((a, b) => b.e - a.e);
  }
  return [{ s: t, e: t, n: 1 }, ...next].sort((a, b) => b.e - a.e).slice(0, MAX);
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
  if (x.n === undefined) return true;
  return x.n >= 6 || (minutes(x) >= 1 && x.n >= 3);
}
