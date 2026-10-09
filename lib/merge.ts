import type { Session } from "./sessions.ts";

/** Dezelfde site (zelfde apparaat) direct na elkaar wordt één regel: bezoeken opgeteld, tijd van het laatste bezoek. */
export function mergeRows<G, T extends { g: G; ss: Session[]; first: boolean; newest: boolean }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const p = out[out.length - 1];
    if (p && p.g === r.g) {
      p.ss = [...p.ss, ...r.ss];
      p.first = p.first || r.first;
      p.newest = p.newest || r.newest;
    } else out.push({ ...r });
  }
  return out;
}
