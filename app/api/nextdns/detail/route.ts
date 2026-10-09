import { NextResponse } from "next/server";
import { extractHost } from "@/lib/parse";
import { classify } from "@/lib/sites";

export const dynamic = "force-dynamic";

interface HostCount {
  h: string; // adres
  n: number; // aantal verzoeken
  b: number; // aantal geblokkeerd
}

/**
 * Wat er rond een bezoek gebeurde: alle adressen die het apparaat in dat tijdvak opvroeg,
 * gesplitst in "hoort bij deze site/app" en "ook op dat moment".
 * Query: dev (apparaat-id), site, from, to (unix ms).
 */
export async function GET(req: Request) {
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile || !process.env.APP_PASSWORD) return NextResponse.json({ error: "Niet ingesteld." }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const dev = q.get("dev") ?? "";
  const site = q.get("site") ?? "";
  const from = Number(q.get("from"));
  const to = Number(q.get("to"));
  if (!site || !Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 36 * 3_600_000) {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const token = site.split(".")[0].toLowerCase();
  const base = `https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs`;

  const matched = new Map<string, HostCount>();
  const other = new Map<string, HostCount>();
  let total = 0;
  let capped = false;
  let cursor = "";
  const deadline = Date.now() + 25_000;
  for (let page = 0; page < 5; page++) {
    if (Date.now() > deadline) { capped = true; break; }
    const url = `${base}?from=${Math.round(from)}&to=${Math.round(to)}&limit=1000${dev ? `&device=${encodeURIComponent(dev)}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "X-Api-Key": key.trim() }, cache: "no-store" });
    } catch {
      return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
    }
    if (!res.ok) return NextResponse.json({ error: `NextDNS gaf fout ${res.status}.` }, { status: 502 });
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[]; meta?: { pagination?: { cursor?: string | null } } } | null;
    for (const e of json?.data ?? []) {
      const host = extractHost(String(e.domain ?? ""));
      if (!host) continue;
      total++;
      const blocked = String(e.status ?? "").toLowerCase() === "blocked";
      const mine = classify(host).site === site || host.includes(token);
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
  return NextResponse.json({
    matched: top(matched, 40),
    matchedTotal: matched.size,
    other: top(other, 25),
    otherTotal: other.size,
    total,
    capped,
  });
}
