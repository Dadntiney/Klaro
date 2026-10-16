// Het volledige overzicht (alle dagen) uitrekenen buiten de pagina: dan blijft scrollen en live bijwerken soepel.
// Hier staat ook de volledige download, om in de NextDNS-weergave in alle regels te zoeken (zie lib/rawsource.ts).
import { buildOverview } from "./overview.ts";
import { php, serverLists } from "./php-client.ts";
import { rawSource } from "./rawsource.ts";
import type { RawQuery } from "./rawlog.ts";

serverLists();
const raw = rawSource(php);
self.onmessage = async (e: MessageEvent<{ id: number; todayOnly: boolean; hours?: number; raw?: RawQuery }>) => {
  const { id, raw: q, ...opts } = e.data;
  try {
    const r = q ? await raw.search(q) : await buildOverview(raw.client, opts);
    postMessage({ id, ...r });
  } catch {
    postMessage({ id, status: 502, body: { error: "De server is niet bereikbaar." } });
  }
};
