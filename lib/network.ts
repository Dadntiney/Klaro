import type { Session } from "./sessions.ts";

export interface NetRow {
  dev: string;
  t: number;
  ip: string;
}

export interface AwayInfo {
  now: boolean | null; // laatste verzoek van buiten het thuisnetwerk? (null = onbekend)
  since: number; // sinds wanneer (alleen als now)
  runs: Session[]; // periodes buiten het thuisnetwerk, nieuwste eerst
}

/** IPv6: het netwerkdeel (eerste 64 bits, dat wisselt niet mee met de privacy-adressen); IPv4: het hele adres. */
export function netKey(ip: string): string {
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
}

function nearest(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length - 1;
  if (hi < 0) return Infinity;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  let best = Math.abs(sorted[lo] - t);
  if (lo > 0) best = Math.min(best, Math.abs(sorted[lo - 1] - t));
  return best;
}

const RUN_GAP = 20 * 60_000;

/**
 * Thuis of onderweg per apparaat. Thuis = het IPv6-netwerk waar het meeste verkeer vandaan komt, plus elk IPv4-adres dat
 * een apparaat binnen 2 minuten naast dat IPv6-netwerk gebruikt (apparaten wisselen thuis tussen beide).
 */
export function analyzeNetwork(rows: NetRow[]): Map<string, AwayInfo> {
  const v6 = new Map<string, number>();
  for (const r of rows) if (r.ip.includes(":")) v6.set(netKey(r.ip), (v6.get(netKey(r.ip)) ?? 0) + 1);
  const total6 = [...v6.values()].reduce((a, b) => a + b, 0);
  const homeV6 = new Set([...v6].filter(([, n]) => n >= 0.25 * total6).map(([k]) => k));

  const homeTimes = new Map<string, number[]>();
  for (const r of rows) if (r.ip.includes(":") && homeV6.has(netKey(r.ip))) (homeTimes.get(r.dev) ?? homeTimes.set(r.dev, []).get(r.dev)!).push(r.t);
  for (const a of homeTimes.values()) a.sort((x, y) => x - y);

  const homeV4 = new Set<string>();
  for (const r of rows) {
    if (r.ip.includes(":") || homeV4.has(r.ip)) continue;
    const a = homeTimes.get(r.dev);
    if (a && nearest(a, r.t) <= 120_000) homeV4.add(r.ip);
  }

  const byDev = new Map<string, [number, boolean][]>();
  for (const r of rows) {
    if (!r.ip) continue;
    const away = r.ip.includes(":") ? !homeV6.has(netKey(r.ip)) : !homeV4.has(r.ip);
    (byDev.get(r.dev) ?? byDev.set(r.dev, []).get(r.dev)!).push([r.t, away]);
  }

  const out = new Map<string, AwayInfo>();
  for (const [dev, list] of byDev) {
    list.sort((a, b) => a[0] - b[0]);
    const known = homeTimes.has(dev) || list.some(([, a]) => !a);
    const runs: Session[] = [];
    let cur: { s: number; e: number; n: number } | null = null;
    for (const [t, away] of list) {
      if (!away) continue;
      if (cur && t - cur.e <= RUN_GAP) {
        cur.e = t;
        cur.n++;
      } else {
        if (cur && cur.n >= 3) runs.push({ s: cur.s, e: cur.e });
        cur = { s: t, e: t, n: 1 };
      }
    }
    if (cur && cur.n >= 3) runs.push({ s: cur.s, e: cur.e });
    const last = list[list.length - 1];
    const now = known && last ? last[1] : null;
    // sinds wanneer buiten: begin van de laatste periode die tot het einde doorloopt
    let since = 0;
    if (now) {
      let i = list.length - 1;
      while (i > 0 && list[i - 1][1] && list[i][0] - list[i - 1][0] <= RUN_GAP) i--;
      since = list[i][0];
    }
    // Zonder bekend thuisnetwerk voor dit apparaat kunnen we niets zinnigs zeggen over onderweg zijn.
    out.set(dev, { now, since, runs: known ? runs.reverse().slice(0, 8) : [] });
  }
  return out;
}
