import { NextResponse } from "next/server";
import { aggregate, detectColumns, parseCsv } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };

/** NextDNS accepteert relatieve tijden, ISO-8601 of unix-tijd; we proberen ze op volgorde. */
function fromCandidates(days: number): string[] {
  const ms = Date.now() - days * 86400_000;
  return [`-${days}d`, new Date(ms).toISOString(), String(ms), String(Math.floor(ms / 1000))];
}

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
  const days = DAYS[new URL(req.url).searchParams.get("period") ?? "7d"];
  if (!days) return NextResponse.json({ error: "Ongeldige periode." }, { status: 400 });

  const base = `https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs/download`;
  let res: Response | null = null;
  let lastBody = "";
  for (const from of fromCandidates(days)) {
    try {
      res = await fetch(`${base}?from=${encodeURIComponent(from)}`, {
        headers: { "X-Api-Key": key.trim() },
        redirect: "follow",
        cache: "no-store",
      });
    } catch {
      return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
    }
    if (res.ok) break;
    lastBody = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status !== 400) break;
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const hint = status === 401 || status === 403 ? " Controleer de API-sleutel." : status === 404 ? " Controleer het profiel-ID." : "";
    return NextResponse.json({ error: `NextDNS gaf fout ${status}.${hint} ${lastBody}`.trim() }, { status: 502 });
  }
  const rows = parseCsv(await res.text());
  if (rows.length < 2) return NextResponse.json({ domains: [], rows: 0, skipped: 0, hostColumn: "" });
  const [header, ...body] = rows;
  const det = detectColumns(header, body);
  if (!det) return NextResponse.json({ error: "Geen domeinkolom in de NextDNS-logs gevonden." }, { status: 502 });
  const { domains, skipped } = aggregate(body, det);
  return NextResponse.json({ domains, rows: body.length, skipped, hostColumn: header[det.hostCol] });
}
