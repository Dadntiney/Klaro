import type { NDResponse, NextDNSClient } from "./overview.ts";
import { parseRaw, rawEvents, type RawQuery, type RawRow } from "./rawlog.ts";

/**
 * Bewaart de laatste volledige download (die het overzicht toch al haalt) om in alle regels te zoeken. Is er nog geen of is die
 * ouder dan 5 minuten, dan zelf ophalen (de server bewaart de download 2 minuten, dus dat kost NextDNS weinig extra).
 */
export function rawSource(base: NextDNSClient) {
  let text: string | null = null;
  let at = 0;
  let rows: RawRow[] | null = null;
  let inflight: Promise<void> | null = null;
  const client: NextDNSClient = {
    logs: base.logs,
    download: async (ms) => {
      const r = await base.download(ms);
      if (!r.ok) return r;
      const t = await r.text();
      text = t; at = Date.now(); rows = null;
      return { ok: true, status: r.status, text: async () => t, json: async () => JSON.parse(t) } as NDResponse;
    },
  };
  async function search(q: RawQuery) {
    if (!text || Date.now() - at > 300_000) {
      if (!inflight) inflight = client.download(90_000).then((r) => { if (!r.ok) throw new Error(String(r.status)); }).finally(() => { inflight = null; });
      try { await inflight; } catch { if (!text) return { status: 502, body: { error: "NextDNS is niet bereikbaar." } }; }
    }
    if (!rows) rows = parseRaw(text!);
    return { status: 200, body: { ...(await rawEvents(rows, q)), until: rows[0]?.t ?? 0, since: rows[rows.length - 1]?.t ?? 0 } };
  }
  return { client, search };
}
