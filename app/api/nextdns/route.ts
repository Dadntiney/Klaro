import { NextResponse } from "next/server";
import { detectColumns, extractHost, parseCsv } from "@/lib/parse";
import { classify } from "@/lib/sites";
import { deviceType, labelDevices } from "@/lib/names";
import { allSessions, clusterSessions, totalMinutes, type Session } from "@/lib/sessions";
import { categoryOf } from "@/lib/categories";
import { gapP95 } from "@/lib/devstats";

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
  main: boolean;
  flag?: string;
  ts: number[]; // laatste tijdstippen (max 8, nieuwste eerst), voor "rond dit moment"
  ss: Session[]; // sessies (nieuwste eerst, max 5)
  mins: number; // totaal aantal minuten actief (alle sessies van die dag)
  cat: string; // categorie (Games, Video, ...)
  bl: number; // aantal door NextDNS geblokkeerde verzoeken
  isNew: boolean; // site voor het eerst gezien in de afgelopen 24 uur
}

/** Eén apparaat: totalen, laatste activiteit en de gegevens om "ongewoon stil" te herkennen. */
export interface Device {
  name: string;
  n: number;
  last: number; // laatste verzoek (alle verkeer)
  gap: number; // normale pauze overdag (ms, 95e percentiel)
  days: number; // aantal dagen met activiteit
  ss: Session[]; // sessies van vandaag (alleen zichtbaar verkeer)
  avg: number; // gemiddeld aantal actieve minuten op eerdere dagen
  blocked: number; // geblokkeerde 18+/dating-pogingen vandaag
}

const dayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Amsterdam" });
const hourOf = (t: number) => parseInt(hourFmt.format(t), 10) % 24;

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
  const statusCol = col("status");
  const reasonsCol = col("reasons");

  // Eerst alle apparaten bepalen, zodat gelijke soorten consistent worden genummerd.
  const found = new Map<string, string>();
  const idOf = (r: string[]) => (idCol >= 0 && r[idCol]?.trim()) || (nameCol >= 0 && r[nameCol]?.trim()) || "onbekend";
  for (const r of body) {
    const id = idOf(r);
    if (!found.has(id)) found.set(id, deviceType((nameCol >= 0 && r[nameCol]) || "", (modelCol >= 0 && r[modelCol]) || ""));
  }
  const deviceMap = labelDevices([...found].map(([id, type]) => ({ id, type })));

  const groups = new Map<string, Group>();
  const times = new Map<string, number[]>(); // alle tijdstippen per groep, om sessies te maken
  const siteFirst = new Map<string, number>(); // eerste keer dat een site in de logs staat
  const devAll = new Map<string, number[]>(); // alle verzoeken per apparaat
  const devVis = new Map<string, Map<string, number[]>>(); // zichtbaar verkeer per apparaat per dag
  const devBlockedToday = new Map<string, number>();
  const devCount = new Map<string, number>();
  const statuses = new Map<string, number>();
  const reasonSamples = new Set<string>();
  const today = dayFmt.format(Date.now());
  let total = 0;
  let minT = Infinity;
  for (const r of body) {
    const host = extractHost(r[hostCol] ?? "");
    if (!host) continue;
    const t = tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    const dev = deviceMap[idOf(r)];
    let info = classify(host);
    const d = t ? dayFmt.format(t) : "onbekend";

    // Door NextDNS geblokkeerd? Een geblokkeerde poging naar porno/dating is altijd belangrijk, ook als het adres niet op mijn lijst staat.
    const status = (statusCol >= 0 ? r[statusCol] ?? "" : "").trim().toLowerCase();
    const reasons = (reasonsCol >= 0 ? r[reasonsCol] ?? "" : "").toLowerCase();
    statuses.set(status || "(leeg)", (statuses.get(status || "(leeg)") ?? 0) + 1);
    if (reasons && reasonSamples.size < 15) reasonSamples.add(reasons.slice(0, 80));
    const blocked = status === "blocked";
    let blockedAdult = false;
    if (blocked && /porn|adult|sex|dating|erotic/.test(reasons) && !info.flag) {
      info = { ...info, bg: false, main: true, flag: "Geblokkeerd" };
      blockedAdult = true;
    }

    if (t) {
      minT = Math.min(minT, t);
      const f = siteFirst.get(info.site);
      if (f === undefined || t < f) siteFirst.set(info.site, t);
      (devAll.get(dev) ?? devAll.set(dev, []).get(dev)!).push(t);
      if ((info.main && !info.bg) || info.flag) {
        const byDay = devVis.get(dev) ?? devVis.set(dev, new Map()).get(dev)!;
        (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(t);
      }
    }
    if (blockedAdult && d === today) devBlockedToday.set(dev, (devBlockedToday.get(dev) ?? 0) + 1);

    const key = `${d}|${dev}|${info.site}`;
    const g = groups.get(key);
    if (g) {
      g.n++;
      g.main ||= info.main;
      if (blocked) g.bl++;
      if (info.flag && !g.flag) {
        g.flag = info.flag;
        g.bg = false;
        g.main = true;
      }
      if (t > g.last) g.last = t;
      times.get(key)!.push(t);
    } else {
      groups.set(key, { d, dev, site: info.site, name: info.name, icon: info.icon, last: t, n: 1, bg: info.bg, adult: info.adult, main: info.main, flag: info.flag, ts: [], ss: [], mins: 0, cat: categoryOf(info.site), bl: blocked ? 1 : 0, isNew: false });
      times.set(key, [t]);
    }
    devCount.set(dev, (devCount.get(dev) ?? 0) + 1);
    total++;
  }
  // "Nieuw": voor het eerst gezien in de laatste 24 uur, alleen zinvol als de logs minstens 3 dagen terugreiken.
  const newCutoff = Date.now() - 24 * 3_600_000;
  const meaningful = Number.isFinite(minT) && Date.now() - minT > 3 * 86_400_000;
  for (const [key, g] of groups) {
    const all = times.get(key) ?? [];
    g.ss = clusterSessions(all);
    g.mins = totalMinutes(all);
    g.ts = all.filter(Boolean).sort((a, b) => b - a).slice(0, 8);
    g.isNew = meaningful && g.main && !g.bg && (siteFirst.get(g.site) ?? 0) >= newCutoff;
  }

  const devices: Device[] = [...devCount.entries()].map(([name, n]) => {
    const all = (devAll.get(name) ?? []).sort((a, b) => a - b);
    const byDay = devVis.get(name) ?? new Map<string, number[]>();
    const prev = [...byDay.entries()].filter(([d]) => d !== today && d !== "onbekend").sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);
    return {
      name,
      n,
      last: all.length ? all[all.length - 1] : 0,
      gap: gapP95(all, hourOf),
      days: new Set(all.map((t) => dayFmt.format(t))).size,
      ss: allSessions(byDay.get(today) ?? []),
      avg: prev.length ? Math.round(prev.reduce((m, [, ts]) => m + totalMinutes(ts), 0) / prev.length) : 0,
      blocked: devBlockedToday.get(name) ?? 0,
    };
  }).sort((a, b) => b.n - a.n);

  const list = [...groups.values()].sort((a, b) => b.last - a.last).slice(0, MAX_GROUPS);
  const result = {
    groups: list,
    devices,
    total,
    deviceMap, // id -> label; bevat nooit de echte naam
    meta: { columns: header, statuses: Object.fromEntries(statuses), reasons: [...reasonSamples] }, // om de kolommen te controleren
  };
  cache = { at: Date.now(), body: result };
  return NextResponse.json(result);
}
