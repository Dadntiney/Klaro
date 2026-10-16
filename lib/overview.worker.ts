// Het volledige overzicht (alle dagen) uitrekenen buiten de pagina: dan blijft scrollen en live bijwerken soepel.
import { buildOverview } from "./overview.ts";
import { php, serverLists } from "./php-client.ts";

serverLists();
self.onmessage = async (e: MessageEvent<{ id: number; todayOnly: boolean; hours?: number }>) => {
  const { id, ...opts } = e.data;
  try {
    const r = await buildOverview(php, opts);
    postMessage({ id, ...r });
  } catch {
    postMessage({ id, status: 502, body: { error: "De server is niet bereikbaar." } });
  }
};
