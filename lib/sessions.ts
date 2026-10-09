/** Een sessie: verzoeken die minder dan `GAP` uit elkaar liggen horen bij één periode van gebruik. */
export interface Session {
  s: number; // start (unix ms)
  e: number; // einde
}

export const GAP = 5 * 60_000;
const MAX = 5;

/** Maak sessies van losse tijdstippen; nieuwste eerst, maximaal `MAX`. */
export function clusterSessions(times: number[]): Session[] {
  const t = times.filter(Boolean).sort((a, b) => a - b);
  const out: Session[] = [];
  for (const x of t) {
    const last = out[out.length - 1];
    if (last && x - last.e <= GAP) last.e = x;
    else out.push({ s: x, e: x });
  }
  return out.reverse().slice(0, MAX);
}

/** Voeg één nieuw tijdstip toe aan bestaande sessies (nieuwste eerst). */
export function extendSessions(ss: Session[], t: number): Session[] {
  const next = ss.map((x) => ({ ...x }));
  const i = next.findIndex((x) => t >= x.s - GAP && t <= x.e + GAP);
  if (i >= 0) {
    next[i].s = Math.min(next[i].s, t);
    next[i].e = Math.max(next[i].e, t);
    return next.sort((a, b) => b.e - a.e);
  }
  return [{ s: t, e: t }, ...next].sort((a, b) => b.e - a.e).slice(0, MAX);
}

/** Minuten van een sessie, minimaal 1 als er meer dan een paar seconden tussen zit; 0 = alleen een korte aanraking. */
export function minutes(x: Session): number {
  const ms = x.e - x.s;
  return ms < 60_000 ? 0 : Math.round(ms / 60_000);
}
