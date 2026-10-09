import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** TIJDELIJK: laat zien wat er in de kolommen zit (om de nieuwe functies op echte gegevens te baseren). */
export async function GET() {
  const key = process.env.NEXTDNS_API_KEY, profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile || !process.env.APP_PASSWORD) return NextResponse.json({ error: "niet ingesteld" }, { status: 503 });
  const res = await fetch(`https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs/download`, { headers: { "X-Api-Key": key.trim() }, redirect: "follow", cache: "no-store" });
  const rows = parseCsv(await res.text());
  const [h, ...b] = rows;
  const c = (n: string) => h.findIndex((x) => x.trim().toLowerCase() === n);
  const ix = { t: c("timestamp"), dom: c("domain"), status: c("status"), reasons: c("reasons"), cc: c("destination_country"), ip: c("client_ip"), id: c("device_id"), name: c("device_name"), lip: c("device_local_ip"), mn: c("matched_name"), cn: c("client_name"), proto: c("protocol"), qt: c("query_type") };
  const top = (m: Map<string, number>, n = 12) => [...m.entries()].sort((a, z) => z[1] - a[1]).slice(0, n);
  const count = (col: number) => { const m = new Map<string, number>(); for (const r of b) { const v = (r[col] ?? "").trim() || "(leeg)"; m.set(v, (m.get(v) ?? 0) + 1); } return m; };
  const perDev = new Map<string, Map<string, number>>();
  const perDevLocal = new Map<string, Map<string, number>>();
  for (const r of b) {
    const d = (r[ix.id] ?? "").trim() || (r[ix.name] ?? "").trim() || "(leeg)";
    const m = perDev.get(d) ?? perDev.set(d, new Map()).get(d)!;
    const ip = (r[ix.ip] ?? "").trim() || "(leeg)";
    m.set(ip, (m.get(ip) ?? 0) + 1);
    const m2 = perDevLocal.get(d) ?? perDevLocal.set(d, new Map()).get(d)!;
    const l = (r[ix.lip] ?? "").trim() || "(leeg)";
    m2.set(l, (m2.get(l) ?? 0) + 1);
  }
  const pats: Record<string, RegExp> = {
    betalen: /buy\.itunes|pay\.apple|apple-pay|payments?\.|paypal|mollie|stripe|ideal|adyen|klarna|checkout|billing|commerce\.apple|storekit|revenuecat|wallet/,
    media: /googlevideo|nflxvideo|ttvnw|tiktokcdn|cdninstagram|fbcdn|scdn\.co|rbxcdn|dssott|bamgrid|akamaized|videoland|npostart/,
  };
  const hosts: Record<string, [string, number][]> = {};
  for (const [k, re] of Object.entries(pats)) {
    const m = new Map<string, number>();
    for (const r of b) { const d = (r[ix.dom] ?? "").toLowerCase(); if (re.test(d)) m.set(d, (m.get(d) ?? 0) + 1); }
    hosts[k] = top(m, 40);
  }
  const days = new Set(b.map((r) => (r[ix.t] ?? "").slice(0, 10)));
  return NextResponse.json({
    kolommen: h, rijen: b.length, dagen: days.size,
    statussen: top(count(ix.status)), protocol: top(count(ix.proto)), querytype: top(count(ix.qt), 6),
    landen: top(count(ix.cc), 20),
    clientIpTop: top(count(ix.ip), 8), clientIpUniek: count(ix.ip).size,
    lokaalIpUniek: count(ix.lip).size, lokaalIpTop: top(count(ix.lip), 8),
    matchedName: top(count(ix.mn), 12), clientName: top(count(ix.cn), 12), deviceId: top(count(ix.id), 12),
    perApparaatClientIp: Object.fromEntries([...perDev].map(([d, m]) => [d.slice(0, 6), top(m, 6)])),
    perApparaatLokaalIp: Object.fromEntries([...perDevLocal].map(([d, m]) => [d.slice(0, 6), top(m, 6)])),
    hosts,
  });
}
