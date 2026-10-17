// Het volledige overzicht (alle dagen) uitrekenen buiten de pagina: dan blijft scrollen en live bijwerken soepel.
// Hier staat ook de volledige download (bewaard en aangevuld, zie lib/rawsource.ts), om in alle regels te zoeken en om elke
// minuut alleen de laatste uren opnieuw te berekenen met dezelfde regels (zie lib/recent.ts).
import { buildOverview } from "./overview.ts";
import { php, serverLists } from "./php-client.ts";
import { rawSource } from "./rawsource.ts";
import { knownFrom, mergeRecent, recentFrom } from "./recent.ts";
import type { RawQuery } from "./rawlog.ts";

serverLists();
const raw = rawSource(php);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastFull: any = null;
self.onmessage = async (e: MessageEvent<{ id: number; todayOnly: boolean; hours?: number; raw?: RawQuery; recent?: boolean }>) => {
  const { id, raw: q, recent, ...opts } = e.data;
  try {
    if (q) { postMessage({ id, ...(await raw.search(q)) }); return; }
    if (recent && lastFull) {
      const now = Date.now();
      const r = await buildOverview(raw.recentClient(recentFrom(now)), { todayOnly: false, known: knownFrom(lastFull) });
      if (r.status === 200) { postMessage({ id, status: 200, body: mergeRecent(lastFull, r.body, now) }); return; }
    }
    const r = await buildOverview(raw.client, opts);
    if (r.status === 200) lastFull = r.body;
    postMessage({ id, ...r });
  } catch {
    postMessage({ id, status: 502, body: { error: "De server is niet bereikbaar." } });
  }
};
