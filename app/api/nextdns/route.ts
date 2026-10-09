import { NextResponse } from "next/server";
import { aggregate, detectColumns, parseCsv } from "@/lib/parse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };

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
  // De download-endpoint accepteert geen filters (alleen X-Api-Key): we krijgen alle opgeslagen logs.
  let res: Response;
  try {
    res = await fetch(base, { headers: { "X-Api-Key": key.trim() }, redirect: "follow", cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const hint = res.status === 401 || res.status === 403 ? " Controleer de API-sleutel." : res.status === 404 ? " Controleer het profiel-ID." : "";
    return NextResponse.json({ error: `NextDNS gaf fout ${res.status}.${hint} ${body}`.trim() }, { status: 502 });
  }
  const rows = parseCsv(await res.text());
  if (rows.length < 2) return NextResponse.json({ domains: [], rows: 0, skipped: 0, hostColumn: "" });
  const [header, ...all] = rows;
  // Beperk tot de gekozen periode op basis van de tijdkolom (indien aanwezig).
  const tCol = header.findIndex((h) => h.trim().toLowerCase() === "timestamp");
  const cutoff = Date.now() - days * 86400_000;
  const body = tCol < 0 ? all : all.filter((r) => {
    const t = Date.parse(r[tCol]);
    return isNaN(t) || t >= cutoff;
  });
  const det = detectColumns(header, body);
  if (!det) return NextResponse.json({ error: "Geen domeinkolom in de NextDNS-logs gevonden." }, { status: 502 });
  const { domains, skipped } = aggregate(body, det);
  return NextResponse.json({ domains, rows: body.length, skipped, hostColumn: header[det.hostCol] });
}
