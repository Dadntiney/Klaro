import { NextResponse } from "next/server";
import { detectColumns, extractHost, parseCsv } from "@/lib/parse";
import { classify } from "@/lib/sites";
import { deviceType, labelDevices } from "@/lib/names";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_GROUPS = 15000;

/** Eén regel in het overzicht: een site/app, op één dag, door één apparaat. */
export interface Group {
  d: string; // dag (YYYY-MM-DD, Nederlandse tijd)
  dev: string;
  site: string;
  name: string;
  icon: string;
  last: number; // laatste bezoek (unix ms)
  n: number; // aantal DNS-verzoeken
  bg: boolean;
  adult: boolean;
  flag?: string;
}

const dayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" });

// Het samenstellen van de download bij NextDNS is traag; hergebruik het resultaat kort (de live-route vult het aan).
let cache: { at: number; body: unknown } | null = null;
const CACHE_MS = 120_000;

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

  if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.body);

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
  if (rows.length < 2) return NextResponse.json({ groups: [], devices: [], total: 0 });
  const [header, ...body] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const tCol = col("timestamp");
  const hostCol = col("domain") >= 0 ? col("domain") : (detectColumns(header, body)?.hostCol ?? -1);
  if (hostCol < 0) return NextResponse.json({ error: "Geen domeinkolom in de NextDNS-logs gevonden." }, { status: 502 });
  const nameCol = col("device_name");
  const idCol = col("device_id");
  const modelCol = col("device_model");

  // Eerst alle apparaten bepalen, zodat gelijke soorten consistent worden genummerd.
  const found = new Map<string, string>();
  const idOf = (r: string[]) => (idCol >= 0 && r[idCol]?.trim()) || (nameCol >= 0 && r[nameCol]?.trim()) || "onbekend";
  for (const r of body) {
    const id = idOf(r);
    if (!found.has(id)) found.set(id, deviceType((nameCol >= 0 && r[nameCol]) || "", (modelCol >= 0 && r[modelCol]) || ""));
  }
  const deviceMap = labelDevices([...found].map(([id, type]) => ({ id, type })));

  const groups = new Map<string, Group>();
  const devices = new Map<string, number>();
  let total = 0;
  for (const r of body) {
    const host = extractHost(r[hostCol] ?? "");
    if (!host) continue;
    const t = tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    const dev = deviceMap[idOf(r)];
    const info = classify(host);
    const d = t ? dayFmt.format(t) : "onbekend";
    const key = `${d}|${dev}|${info.site}`;
    const g = groups.get(key);
    if (g) {
      g.n++;
      if (t > g.last) g.last = t;
    } else {
      groups.set(key, { d, dev, site: info.site, name: info.name, icon: info.icon, last: t, n: 1, bg: info.bg, adult: info.adult, flag: info.flag });
    }
    devices.set(dev, (devices.get(dev) ?? 0) + 1);
    total++;
  }
  const list = [...groups.values()].sort((a, b) => b.last - a.last).slice(0, MAX_GROUPS);
  const result = {
    groups: list,
    devices: [...devices.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    total,
    deviceMap, // id -> label; bevat nooit de echte naam
  };
  cache = { at: Date.now(), body: result };
  return NextResponse.json(result);
}
