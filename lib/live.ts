import { toEvent, type LiveEvent } from "./events.ts";
import { nextdnsError } from "./nextdns.ts";
import { extractHost } from "./parse.ts";
import { prepareLists } from "./adultlist.ts";
import type { NDResponse, NextDNSClient } from "./overview.ts";

/** Nieuwste verzoeken sinds `since` (unix ms), voor de live-weergave. */
export async function liveEvents(client: NextDNSClient, since: number): Promise<{ status: number; body: { events?: LiveEvent[]; error?: string } }> {
  let res: NDResponse | null = null;
  let text = "";
  // Eerst met sortering; weigert NextDNS die parameter, dan zonder.
  for (const q of ["limit=200&sort=desc", "limit=200"]) {
    try {
      res = await client.logs(q, 8_000);
    } catch {
      return { status: 502, body: { error: "NextDNS is niet bereikbaar." } };
    }
    if (res.ok) break;
    text = await res.text().catch(() => "");
    if (res.status !== 400) break;
  }
  if (!res || !res.ok) return { status: 502, body: { error: nextdnsError(res?.status ?? 0, text) } };
  const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[] } | null;
  const data = json?.data ?? [];
  await prepareLists(data.map((e) => extractHost(String(e.domain ?? ""))).filter((h): h is string => !!h));
  const events = data.map(toEvent).filter((e): e is LiveEvent => !!e && e.t > since);
  return { status: 200, body: { events } };
}
