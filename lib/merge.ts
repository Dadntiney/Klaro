import type { Session } from "./sessions.ts";

/** Bezoeken aan dezelfde site op hetzelfde apparaat met hooguit zoveel tijd ertussen worden één regel. */
export const MERGE_GAP = 15 * 60_000;

/**
 * Dezelfde site (zelfde apparaat) direct na elkaar, of binnen MERGE_GAP na elkaar (ook met andere regels ertussen), wordt één
 * regel: bezoeken bij elkaar, tijd van het eerste bezoek. Uitklappen laat de losse bezoeken nog zien. `rows`: nieuwste eerst.
 */
export function mergeRows<G, T extends { g: G; t: number; ss: Session[]; first: boolean; newest: boolean }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const rEnd = Math.max(...r.ss.map((x) => x.e));
    const prev = out[out.length - 1];
    const p = prev && prev.g === r.g ? prev : out.find((o) => o.g === r.g && Math.min(...o.ss.map((x) => x.s)) - rEnd <= MERGE_GAP);
    if (p) {
      p.ss = [...p.ss, ...r.ss];
      p.t = Math.min(p.t, r.t);
      p.first = p.first || r.first;
      p.newest = p.newest || r.newest;
    } else out.push({ ...r });
  }
  return out.sort((a, b) => b.t - a.t);
}
