import { extractHost } from "./parse.ts";
import { classify } from "./sites.ts";
import { prepareLists } from "./adultlist.ts";
import type { NDResponse, NextDNSClient } from "./overview.ts";

interface HostCount {
  h: string; // adres
  n: number; // aantal verzoeken
  b: number; // aantal geblokkeerd
}

/**
 * Wat er rond een bezoek gebeurde: alle adressen die het apparaat in dat tijdvak opvroeg,
 * gesplitst in "hoort bij deze site/app" en "ook op dat moment".
 */
export async function siteDetail(client: NextDNSClient, q: { dev: string; site: string; from: number; to: number }): Promise<{ status: number; body: unknown }> {
  const { dev, site, from, to } = q;
  if (!site || !Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 36 * 3_600_000) return { status: 400, body: { error: "Ongeldige aanvraag." } };
  const token = site.split(".")[0].toLowerCase();
  const matched = new Map<string, HostCount>();
  const other = new Map<string, HostCount>();
  let total = 0;
  let capped = false;
  let cursor = "";
  const deadline = Date.now() + 25_000;
  for (let page = 0; page < 5; page++) {
    if (Date.now() > deadline) { capped = true; break; }
    const query = `from=${Math.round(from)}&to=${Math.round(to)}&limit=1000${dev && !dev.startsWith("anon-") ? `&device=${encodeURIComponent(dev)}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let res: NDResponse;
    try {
      res = await client.logs(query, Math.max(1000, Math.min(10_000, deadline - Date.now())));
    } catch {
      return { status: 502, body: { error: "NextDNS is niet bereikbaar." } };
    }
    if (!res.ok) return { status: 502, body: { error: `NextDNS gaf fout ${res.status}.` } };
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[]; meta?: { pagination?: { cursor?: string | null } } } | null;
    const data = json?.data ?? [];
    await prepareLists(data.map((e) => extractHost(String(e.domain ?? ""))).filter((h): h is string => !!h));
    for (const e of data) {
      const host = extractHost(String(e.domain ?? ""));
      if (!host) continue;
      total++;
      const blocked = String(e.status ?? "").toLowerCase() === "blocked";
      // Korte namen (x.com, t.me) niet op losse letters laten matchen: dan zou bijna alles "van deze site" zijn.
      const mine = classify(host).site === site || (token.length >= 4 && host.includes(token));
      const map = mine ? matched : other;
      const c = map.get(host) ?? { h: host, n: 0, b: 0 };
      c.n++;
      if (blocked) c.b++;
      map.set(host, c);
    }
    cursor = json?.meta?.pagination?.cursor ?? "";
    if (!cursor) break;
    if (page === 4) capped = true;
  }
  const top = (m: Map<string, HostCount>, n: number) => [...m.values()].sort((a, b) => b.n - a.n).slice(0, n);
  return { status: 200, body: { matched: top(matched, 40), matchedTotal: matched.size, other: top(other, 25), otherTotal: other.size, total, capped } };
}
