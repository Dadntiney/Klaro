import { NextResponse } from "next/server";
import { extractHost } from "@/lib/parse";
import { classify } from "@/lib/sites";
import { deviceType } from "@/lib/names";

export const dynamic = "force-dynamic";

/** Nieuwste verzoeken sinds `since` (unix ms), voor de live-weergave. */
export async function GET(req: Request) {
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile || !process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Niet ingesteld." }, { status: 503 });
  }
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;
  const base = `https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs`;

  let res: Response | null = null;
  let body = "";
  // Eerst met sortering; weigert NextDNS die parameter, dan zonder.
  for (const q of ["?limit=200&sort=desc", "?limit=200"]) {
    try {
      res = await fetch(base + q, { headers: { "X-Api-Key": key.trim() }, cache: "no-store" });
    } catch {
      return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
    }
    if (res.ok) break;
    body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status !== 400) break;
  }
  if (!res || !res.ok) {
    return NextResponse.json({ error: `NextDNS gaf fout ${res?.status ?? 0}. ${body}`.trim() }, { status: 502 });
  }

  const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[] } | null;
  const events = [];
  for (const e of json?.data ?? []) {
    const t = Date.parse(String(e.timestamp ?? ""));
    const host = extractHost(String(e.domain ?? ""));
    if (!host || !t || t <= since) continue;
    const device = (e.device ?? {}) as { id?: string; name?: string; model?: string };
    const devId = device.id?.trim() || device.name?.trim() || "onbekend";
    const type = deviceType(device.name ?? "", device.model ?? "");
    const info = classify(host);
    events.push({ t, devId, type, site: info.site, name: info.name, icon: info.icon, bg: info.bg });
  }
  return NextResponse.json({ events });
}
