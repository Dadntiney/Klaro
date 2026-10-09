import { NextResponse } from "next/server";
import { aggregate, detectColumns, parseCsv } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PERIODS: Record<string, string> = { "1d": "-1d", "7d": "-7d", "30d": "-30d" };

export async function GET(req: Request) {
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile) {
    return NextResponse.json({ error: "NEXTDNS_API_KEY en NEXTDNS_PROFILE_ID zijn niet ingesteld in Vercel." }, { status: 503 });
  }
  // Echte DNS-gegevens nooit publiek: zonder wachtwoord weigeren we.
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Stel eerst APP_PASSWORD in in Vercel, zodat je logs niet publiek zijn." }, { status: 503 });
  }
  const period = new URL(req.url).searchParams.get("period") ?? "7d";
  const from = PERIODS[period];
  if (!from) return NextResponse.json({ error: "Ongeldige periode." }, { status: 400 });

  const url = `https://api.nextdns.io/profiles/${encodeURIComponent(profile)}/logs/download?from=${encodeURIComponent(from)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-Api-Key": key }, redirect: "follow", cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
  }
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? " Controleer de API-sleutel." : res.status === 404 ? " Controleer het profiel-ID." : "";
    return NextResponse.json({ error: `NextDNS gaf fout ${res.status}.${hint}` }, { status: 502 });
  }
  const rows = parseCsv(await res.text());
  if (rows.length < 2) return NextResponse.json({ domains: [], rows: 0, skipped: 0, hostColumn: "" });
  const [header, ...body] = rows;
  const det = detectColumns(header, body);
  if (!det) return NextResponse.json({ error: "Geen domeinkolom in de NextDNS-logs gevonden." }, { status: 502 });
  const { domains, skipped } = aggregate(body, det);
  return NextResponse.json({ domains, rows: body.length, skipped, hostColumn: header[det.hostCol] });
}
