import { NextResponse } from "next/server";
import { detectColumns, extractHost, parseCsv } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export interface LogRow {
  t: number; // unix ms
  host: string;
  device: string;
}

export async function GET() {
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile) {
    return NextResponse.json({ error: "NEXTDNS_API_KEY en NEXTDNS_PROFILE_ID zijn niet ingesteld in Vercel." }, { status: 503 });
  }
  // Echte DNS-gegevens nooit publiek: zonder wachtwoord weigeren we.
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Stel eerst APP_PASSWORD in in Vercel, zodat je logs niet publiek zijn." }, { status: 503 });
  }

  // De download-endpoint accepteert geen filters (alleen X-Api-Key): we krijgen alle opgeslagen logs.
  let res: Response;
  try {
    res = await fetch(`https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs/download`, {
      headers: { "X-Api-Key": key.trim() },
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const hint = res.status === 401 || res.status === 403 ? " Controleer de API-sleutel." : res.status === 404 ? " Controleer het profiel-ID." : "";
    return NextResponse.json({ error: `NextDNS gaf fout ${res.status}.${hint} ${body}`.trim() }, { status: 502 });
  }

  const rows = parseCsv(await res.text());
  if (rows.length < 2) return NextResponse.json({ rows: [], total: 0 });
  const [header, ...body] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const tCol = col("timestamp");
  const hostCol = col("domain") >= 0 ? col("domain") : (detectColumns(header, body)?.hostCol ?? -1);
  if (hostCol < 0) return NextResponse.json({ error: "Geen domeinkolom in de NextDNS-logs gevonden." }, { status: 502 });
  const nameCol = col("device_name");
  const idCol = col("device_id");

  const out: LogRow[] = [];
  for (const r of body) {
    const host = extractHost(r[hostCol] ?? "");
    if (!host) continue;
    out.push({
      t: tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0,
      host,
      device: (nameCol >= 0 && r[nameCol]?.trim()) || (idCol >= 0 && r[idCol]?.trim()) || "Onbekend",
    });
  }
  out.sort((a, b) => b.t - a.t);
  return NextResponse.json({ rows: out.slice(0, MAX_ROWS), total: out.length });
}
