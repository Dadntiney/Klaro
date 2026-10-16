import { parseCsv } from "./parse.ts";
import { toEvent, type LiveEvent } from "./events.ts";
import { anonId } from "./names.ts";
import { prepareLists } from "./adultlist.ts";

/**
 * Alle regels van NextDNS (de volledige download) doorzoeken voor de NextDNS-weergave: zoeken in alles, verder terugbladeren
 * en naar een dag en tijd springen. Gebruikt de download die het overzicht toch al haalt; geen extra verzoeken aan NextDNS.
 * De echte apparaatnaam gaat alleen naar `toEvent` (voor het soort apparaat) en nooit mee naar de pagina.
 */
export interface RawRow { t: number; host: string; status: string; reasons: string; devId: string; devName: string; devModel: string }

export function parseRaw(text: string): RawRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const [header, ...body] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const [tC, hC, sC, rC, iC, nC, mC] = ["timestamp", "domain", "status", "reasons", "device_id", "device_name", "device_model"].map(col);
  if (tC < 0 || hC < 0) return [];
  const out: RawRow[] = [];
  for (const r of body) {
    const t = Date.parse(r[tC] ?? "");
    const host = (r[hC] ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (!t || !host) continue;
    out.push({ t, host, status: sC >= 0 ? r[sC] ?? "" : "", reasons: rC >= 0 ? r[rC] ?? "" : "", devId: (iC >= 0 && r[iC]?.trim()) || (nC >= 0 && r[nC]?.trim() && anonId(r[nC].trim())) || "onbekend", devName: nC >= 0 ? r[nC] ?? "" : "", devModel: mC >= 0 ? r[mC] ?? "" : "" });
  }
  return out.sort((a, b) => b.t - a.t);
}

export interface RawQuery { q?: string; devIds?: string[] | null; before?: number; limit?: number }

/** Nieuwste regels vóór `before` (nieuwste eerst) die bij de zoekterm en het apparaat passen. `more`: er zijn er nog oudere. */
export function queryRaw(rows: RawRow[], { q = "", devIds = null, before = Infinity, limit = 300 }: RawQuery): { hits: RawRow[]; more: boolean } {
  const needle = q.trim().toLowerCase();
  const devs = devIds ? new Set(devIds) : null;
  const hits: RawRow[] = [];
  let more = false;
  for (const r of rows) {
    if (r.t >= before) continue;
    if (devs && !devs.has(r.devId)) continue;
    if (needle && !r.host.includes(needle)) continue;
    if (hits.length === limit) { more = true; break; }
    hits.push(r);
  }
  return { hits, more };
}

/** Zoals de live-regels: met icoon, soort apparaat en vangnet (18+/dating-lijsten eerst bij de server nagevraagd). */
export async function rawEvents(rows: RawRow[], query: RawQuery): Promise<{ events: LiveEvent[]; more: boolean }> {
  const { hits, more } = queryRaw(rows, query);
  await prepareLists(hits.map((r) => r.host));
  const events = hits
    .map((r) => toEvent({ timestamp: new Date(r.t).toISOString(), domain: r.host, status: r.status, reasons: r.reasons ? [{ id: r.reasons }] : [], device: { id: r.devId, name: r.devName, model: r.devModel } }))
    .filter((e): e is LiveEvent => !!e);
  return { events, more };
}
