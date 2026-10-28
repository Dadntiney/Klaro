import type { Session } from "./sessions.ts";

export interface NetRow {
  dev: string;
  t: number;
  ip: string;
}

export interface AwayInfo {
  now: boolean | null; // laatste verzoek van buiten het thuisnetwerk? (null = onbekend)
  since: number; // sinds wanneer (alleen als now)
  runs: AwayRun[]; // periodes buiten het thuisnetwerk, nieuwste eerst
}

/** Een periode buiten het thuisnetwerk, met het adres dat het apparaat toen het meest gebruikte (voor mobiel of andere wifi). */
export type AwayRun = Session & { ip?: string };

/** IPv6: het netwerkdeel (eerste 64 bits, dat wisselt niet mee met de privacy-adressen); IPv4: het hele adres. */
export function netKey(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip; // IPv4 (ook ::ffff:1.2.3.4): het hele adres
  // Verkorte schrijfwijze (::) eerst uitschrijven, anders valt een stuk van het apparaatdeel in de sleutel.
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const full = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, "")).join(":");
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

  // IPv4 thuis (voor apparaten zonder IPv6-verkeer thuis): een adres dat meerdere apparaten vooral vlak naast het IPv6-thuisnetwerk
  // gebruiken. Niet het mobiele adres van een telefoon: een iPhone stuurt ook thuis een deel van zijn verkeer via mobiel internet
  // (28 okt: Vodafone-adres een week lang, ook om 00:52 binnen 2 s naast de Ziggo-wifi), en dan zou echt onderweg ook "thuis" lijken.
  const v4 = new Map<string, { n: number; near: number; devs: Set<string> }>();
  for (const r of rows) {
    if (!r.ip || r.ip.includes(":")) continue;
    const x = v4.get(r.ip) ?? v4.set(r.ip, { n: 0, near: 0, devs: new Set() }).get(r.ip)!;
    x.n++;
    const a = homeTimes.get(r.dev);
    if (a && nearest(a, r.t) <= 120_000) { x.near++; x.devs.add(r.dev); }
  }
  const homeV4 = new Set([...v4].filter(([, x]) => x.devs.size >= 2).map(([ip]) => ip));

  // Per moment: thuis als het apparaat via het thuisnetwerk ging, of (IPv4) als het binnen 5 minuten ook via het IPv6-thuisnetwerk
  // verkeer had; dan zit het thuis op de wifi, ook als een deel even via mobiel internet ging.
  const byDev = new Map<string, [number, boolean, string][]>();
  for (const r of rows) {
    if (!r.ip) continue;
    const a = homeTimes.get(r.dev);
    const away = r.ip.includes(":") ? !homeV6.has(netKey(r.ip)) : a ? nearest(a, r.t) > 300_000 && !homeV4.has(r.ip) : !homeV4.has(r.ip);
    (byDev.get(r.dev) ?? byDev.set(r.dev, []).get(r.dev)!).push([r.t, away, r.ip]);
  }

  const out = new Map<string, AwayInfo>();
  for (const [dev, list] of byDev) {
    list.sort((a, b) => a[0] - b[0]);
    const known = homeTimes.has(dev) || list.some(([, a]) => !a);
    const runs: AwayRun[] = [];
    let cur: { s: number; e: number; n: number; ips: Map<string, number> } | null = null;
    const done = (c: NonNullable<typeof cur>) => { if (c.n >= 3) runs.push({ s: c.s, e: c.e, ip: [...c.ips].sort((a, b) => b[1] - a[1])[0]?.[0] }); };
    // Een nieuwe periode als het netwerk echt wisselt (mobiel onderweg, dan wifi op een andere plek): de volgende 3 opvragingen
    // komen allemaal van het nieuwe netwerk. Eén los afwijkend adres tussendoor splitst niet.
    const aw = list.filter(([, a]) => a);
    const k = (ip: string) => (ip.includes(":") ? netKey(ip) : ip);
    for (let i = 0; i < aw.length; i++) {
      const [t, , ip] = aw[i];
      const top = cur ? [...cur.ips].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
      const switched = !!cur && cur.n >= 3 && top !== undefined && k(top) !== k(ip) && aw.slice(i, i + 3).length === 3 && aw.slice(i, i + 3).every(([, , x]) => k(x) === k(ip));
      if (cur && t - cur.e <= RUN_GAP && !switched) {
        cur.e = t;
        cur.n++;
      } else {
        if (cur) done(cur);
        cur = { s: t, e: t, n: 1, ips: new Map() };
      }
      cur.ips.set(ip, (cur.ips.get(ip) ?? 0) + 1);
    }
    if (cur) done(cur);
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
    out.set(dev, { now, since, runs: known ? runs.reverse().slice(0, 300) : [] });
  }
  return out;
}
