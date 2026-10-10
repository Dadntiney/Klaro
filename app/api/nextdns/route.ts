import { NextResponse } from "next/server";
import { detectColumns, extractHost, parseCsv } from "@/lib/parse";
import { isPlainSite } from "@/lib/system";
import { isEspHost, isMailClientHost, isMailSession } from "@/lib/mail";
import { FG_RULES, TV_APPS, classify, fgHit, isEmbedHost, isPlaying, isResourceHost, isMedia, isQuietHost, payKind } from "@/lib/sites";
import { deviceType, labelDevices } from "@/lib/names";
import { MOMENT, allSessions, isHuman, moments, clusterSessions, minutes, totalMinutes, type Session } from "@/lib/sessions";
import { categoryOf } from "@/lib/categories";
import { gapP95 } from "@/lib/devstats";
import { suspicion } from "@/lib/suspect";
import { analyzeNetwork, type AwayInfo, type NetRow } from "@/lib/network";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_GROUPS = 15000;
const DAY = 86_400_000;

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
  ss: Session[]; // sessies (nieuwste eerst, max 20 voor zichtbare sites, anders 5)
  mins: number; // totaal aantal minuten actief (alle sessies van die dag)
  sc: number; // aantal sessies op die dag
  rc: number; // daarvan echte sessies (minstens 2 minuten)
  mm: number; // minuten beeld/geluid-verkeer (echt kijken of luisteren)
  lm?: number; // laatste keer beeld/geluid-verkeer
  cat: string; // categorie (Games, Video, ...)
  bl: number; // aantal door NextDNS geblokkeerde verzoeken
  isNew: boolean; // site voor het eerst gezien in de afgelopen 24 uur
  cc?: string; // land van de server
  susp?: string; // reden waarom het adres verdacht lijkt
}

export interface SleepDay {
  d: string;
  first: number;
  last: number;
}

/** Eén apparaat: totalen, laatste activiteit en alles voor de inzichten. */
export interface Device {
  name: string;
  n: number;
  last: number; // laatste verzoek (alle verkeer)
  first: number; // eerste verzoek ooit in de logs
  gap: number; // normale pauze overdag (ms, 95e percentiel)
  days: number; // aantal dagen met activiteit
  ss: Session[]; // sessies van vandaag (alleen zichtbaar verkeer)
  avg: number; // gemiddeld aantal actieve minuten op eerdere dagen
  blocked: number; // geblokkeerde 18+/dating-pogingen vandaag
  away: AwayInfo; // thuis of onderweg
  sleep: SleepDay[]; // eerste en laatste echte activiteit per dag (laatste 7 dagen)
  dm: Record<string, number>; // actieve minuten per dag (zichtbaar verkeer, zonder dubbeltelling)
  threats: { today: number; week: number; top: { site: string; n: number }[] }; // geblokkeerde bedreigingen
}

export interface PayMoment {
  t: number;
  dev: string;
  kind: string;
  level: "checkout" | "store";
}

const dayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Amsterdam" });
const hourOf = (t: number) => parseInt(hourFmt.format(t), 10) % 24;

// Het samenstellen van de download bij NextDNS is traag; hergebruik het resultaat kort (de live-route vult het aan).
let cache: { at: number; body: unknown } | null = null;
const CACHE_MS = 120_000;

/** Dichtstbijzijnde index in een gesorteerde lijst tijdstippen. */
function nearestIdx(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1] - t) <= Math.abs(sorted[lo] - t)) return lo - 1;
  return lo;
}

const TODAY_HEADER = ["timestamp", "domain", "status", "reasons", "destination_country", "client_ip", "device_id", "device_name", "device_model"];

/** Alleen de logs van vandaag via de gewone log-endpoint (pagina's van 1000). Veel sneller dan de volledige download, maar geeft geen geschiedenis. */
async function fetchToday(profile: string, key: string): Promise<string[][] | { error: string; status: number }> {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Europe/Amsterdam" }).formatToParts(Date.now());
  const g = (x: string) => parseInt(parts.find((p) => p.type === x)!.value, 10) % 24;
  const from = Date.now() - (g("hour") * 3600 + g("minute") * 60 + g("second")) * 1000;
  const base = `https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs`;
  const out: string[][] = [TODAY_HEADER];
  let cursor = "";
  const deadline = Date.now() + 40_000;
  for (let page = 0; page < 40 && Date.now() < deadline; page++) {
    let res: Response;
    try {
      res = await fetch(`${base}?from=${from}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { "X-Api-Key": key.trim() }, cache: "no-store" });
    } catch {
      return { error: "NextDNS is niet bereikbaar.", status: 502 };
    }
    if (!res.ok) return { error: `NextDNS gaf fout ${res.status}. ${(await res.text().catch(() => "")).slice(0, 200)}`.trim(), status: 502 };
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[]; meta?: { pagination?: { cursor?: string | null } } } | null;
    for (const e of json?.data ?? []) {
      const dev = (e.device ?? {}) as { id?: string; name?: string; model?: string };
      const reasons = (Array.isArray(e.reasons) ? e.reasons : []).map((r) => `${(r as { id?: string }).id ?? ""} ${(r as { name?: string }).name ?? ""}`).join(" ");
      const dest = (Array.isArray(e.destinations) ? e.destinations : []).find((d) => (d as { type?: string }).type === "country") as { code?: string } | undefined;
      out.push([String(e.timestamp ?? ""), String(e.domain ?? ""), String(e.status ?? ""), reasons, dest?.code ?? "", String(e.clientIp ?? ""), dev.id ?? "", dev.name ?? "", dev.model ?? ""]);
    }
    cursor = json?.meta?.pagination?.cursor ?? "";
    if (!cursor) break;
  }
  return out;
}

export async function GET(req: Request) {
  const todayOnly = new URL(req.url).searchParams.get("scope") === "today";
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile) {
    return NextResponse.json({ error: "NEXTDNS_API_KEY en NEXTDNS_PROFILE_ID zijn niet ingesteld in Vercel." }, { status: 503 });
  }
  // Echte DNS-gegevens nooit publiek: zonder wachtwoord weigeren we.
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Stel eerst APP_PASSWORD in in Vercel, zodat je logs niet publiek zijn." }, { status: 503 });
  }

  if (!todayOnly && cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.body);

  let rows: string[][];
  if (todayOnly) {
    const t0 = Date.now();
    const r = await fetchToday(profile, key);
    if (!Array.isArray(r)) return NextResponse.json({ error: r.error }, { status: r.status });
    rows = r;
    console.log(`scope=today: ${r.length - 1} regels in ${Date.now() - t0} ms`);
  } else {
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

  rows = parseCsv(await res.text());
  }
  if (rows.length < 2) return NextResponse.json({ groups: [], devices: [], total: 0, insights: { payments: [], trackers: [] } });
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
  const ccCol = col("destination_country");
  const ipCol = col("client_ip");

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
  const mediaTimes = new Map<string, number[]>();
  const fgTimes = new Map<string, number[]>();
  const embedTimes = new Map<string, number[]>();
  const resTimes = new Map<string, number[]>(); // losse onderdelen (tellers, plaatjes, advertenties)
  const mainTimes = new Map<string, number[]>(); // verzoeken naar de site zelf (www., nl., ...): bij een mail komt die er niet aan te pas // ingesloten videospeler (Vimeo/YouTube op een andere site) // inhoud geladen (bij apps met veel achtergrondverkeer) // alleen beeld/geluid-verkeer per groep
  const devEsp = new Map<string, number[]>(); // verkeer van mailbedrijven per apparaat (nieuwsbrief geopend)
  const devMailClient = new Map<string, number[]>(); // mailprogramma haalt mail op
  const devMedia = new Map<string, number[]>(); // alle beeld/geluid-verkeer per apparaat (voor tv-apps)
  const siteFirst = new Map<string, number>(); // eerste keer dat een site in de logs staat
  const devAll = new Map<string, number[]>(); // alle verzoeken per apparaat
  const devVis = new Map<string, Map<string, number[]>>(); // zichtbaar verkeer per apparaat per dag
  const visSites = new Map<string, { t: number; site: string }[]>(); // zichtbaar verkeer met site, om trackers aan een app te koppelen
  const blockedRows: { dev: string; t: number }[] = []; // geblokkeerde verzoeken (trackers e.d.)
  const threatTimes = new Map<string, { t: number; site: string }[]>(); // geblokkeerde bedreigingen per apparaat
  const payRaw: PayMoment[] = [];
  const netRows: NetRow[] = [];
  const devBlockedToday = new Map<string, number>();
  const devCount = new Map<string, number>();
  const statuses = new Map<string, number>();
  const reasonSamples = new Set<string>();
  const today = dayFmt.format(Date.now());
  let total = 0;
  let minT = Infinity;
  let maxT = 0;
  const lastHit = new Map<string, number>();
  for (const r of body) {
    const host = extractHost(r[hostCol] ?? "");
    if (!host) continue;
    const t = tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    const dev = deviceMap[idOf(r)];
    // Hetzelfde adres binnen 1,5 seconde is één opvraging (het logboek bevat A, AAAA en HTTPS apart; de bron voor vandaag niet).
    // Zo tellen beide bronnen precies gelijk.
    const dk = dev + "|" + host;
    const prevHit = lastHit.get(dk);
    if (t && prevHit !== undefined && Math.abs(t - prevHit) <= MOMENT) continue;
    if (t) lastHit.set(dk, t);
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
    const visible = (info.main && !info.bg) || !!info.flag;

    if (t) {
      minT = Math.min(minT, t);
      maxT = Math.max(maxT, t);
      const f = siteFirst.get(info.site);
      if (f === undefined || t < f) siteFirst.set(info.site, t);
      (devAll.get(dev) ?? devAll.set(dev, []).get(dev)!).push(t);
      if (visible) {
        const byDay = devVis.get(dev) ?? devVis.set(dev, new Map()).get(dev)!;
        (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(t);
        (visSites.get(dev) ?? visSites.set(dev, []).get(dev)!).push({ t, site: info.site });
      }
      if (blocked) {
        if (/threat|malware|phish/.test(reasons)) (threatTimes.get(dev) ?? threatTimes.set(dev, []).get(dev)!).push({ t, site: info.site });
        else blockedRows.push({ dev, t });
      }
      const pay = payKind(host);
      if (pay && !blocked) payRaw.push({ t, dev, kind: pay.kind, level: pay.level });
      if (ipCol >= 0 && r[ipCol]) netRows.push({ dev, t, ip: r[ipCol].trim() });
      if (isEspHost(host)) (devEsp.get(dev) ?? devEsp.set(dev, []).get(dev)!).push(t);
      else if (isMailClientHost(host)) (devMailClient.get(dev) ?? devMailClient.set(dev, []).get(dev)!).push(t);
    }
    if (blockedAdult && d === today) devBlockedToday.set(dev, (devBlockedToday.get(dev) ?? 0) + 1);
    if (isQuietHost(host)) continue; // verbinding openhouden: geen bezoek, geen sessie

    const gkey = `${d}|${dev}|${info.site}`;
    const g = groups.get(gkey);
    const cc = ccCol >= 0 ? (r[ccCol] ?? "").trim() : "";
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
      if (cc && !g.cc) g.cc = cc;
      times.get(gkey)!.push(t);
    } else {
      groups.set(gkey, {
        d, dev, site: info.site, name: info.name, icon: info.icon, last: t, n: 1, bg: info.bg, adult: info.adult, main: info.main, flag: info.flag,
        ts: [], ss: [], sc: 0, rc: 0, mins: 0, mm: 0, cat: categoryOf(info.site), bl: blocked ? 1 : 0, isNew: false, cc: cc || undefined,
      });
      times.set(gkey, [t]);
    }
    if (isResourceHost(host)) (resTimes.get(gkey) ?? resTimes.set(gkey, []).get(gkey)!).push(t);
    if (info.main && !info.flag) (mainTimes.get(gkey) ?? mainTimes.set(gkey, []).get(gkey)!).push(t);
    if (isEmbedHost(host)) (embedTimes.get(gkey) ?? embedTimes.set(gkey, []).get(gkey)!).push(t);
    if (!blocked && fgHit(info.site, host)) (fgTimes.get(gkey) ?? fgTimes.set(gkey, []).get(gkey)!).push(t);
    if (isPlaying(host, blocked)) {
      (mediaTimes.get(gkey) ?? mediaTimes.set(gkey, []).get(gkey)!).push(t);
      (devMedia.get(dev) ?? devMedia.set(dev, []).get(dev)!).push(t);
    }
    devCount.set(dev, (devCount.get(dev) ?? 0) + 1);
    total++;
  }

  // "Nieuw": voor het eerst gezien in de laatste 24 uur, alleen zinvol als de logs minstens 3 dagen terugreiken.
  const newCutoff = Date.now() - DAY;
  const meaningful = Number.isFinite(minT) && Date.now() - minT > 7 * DAY;
  const siteName = new Map<string, string>();
  const embedSes: { g: Group; x: Session }[] = [];
  for (const [gkey, g] of groups) {
    const all = times.get(gkey) ?? [];
    const sessions = allSessions(all);
    // Tellen in momenten per site: alles van dezelfde site binnen 1,5 s (www + plaatjes + script) is één moment.
    for (const x of sessions) x.n = moments(all.filter((t) => t >= x.s && t <= x.e));
    // Apps met veel achtergrondverkeer (Facebook, Instagram, WhatsApp, ...): tel hoe vaak er echt inhoud laadde, en meet de duur
    // alleen van de eerste tot de laatste keer inhoud; verversen op de achtergrond rekt de duur dan niet op.
    if (FG_RULES[g.site]) {
      const real = [...(fgTimes.get(gkey) ?? []), ...(mediaTimes.get(gkey) ?? [])];
      for (const x of sessions) {
        const inX = real.filter((t) => t >= x.s && t <= x.e);
        x.f = moments((fgTimes.get(gkey) ?? []).filter((t) => t >= x.s && t <= x.e));
        if (inX.length) { x.s = Math.min(...inX); x.e = Math.max(...inX); }
      }
    }
    g.sc = sessions.length;
    g.rc = sessions.filter((x) => minutes(x) >= 2).length;
    g.mins = sessions.reduce((n, x) => n + minutes(x), 0);
    const mts = mediaTimes.get(gkey) ?? [];
    g.mm = totalMinutes(mts);
    if (mts.length) {
      g.lm = mts.reduce((a, b) => (b > a ? b : a), 0);
      for (const x of sessions) x.m = moments(mts.filter((t) => t >= x.s && t <= x.e));
    }
    // Een tv-app (Ziggo GO e.d.): het beeldverkeer van het apparaat rond dit bezoek telt mee als kijken.
    if (TV_APPS.has(g.site)) {
      const dm = devMedia.get(g.dev) ?? [];
      for (const x of sessions) x.m = Math.max(x.m ?? 0, moments(dm.filter((t) => t >= x.s - 120_000 && t <= x.e + 120_000)));
    }
    // Korte "bezoeken" tegelijk met het openen van een nieuwsbrief zijn plaatjes uit die mail, geen bezoek (rood blijft altijd zichtbaar).
    if (!g.flag && g.main && !g.bg && isPlainSite(g)) { // herkende apps (eigen naam) komen nooit uit een mail
      const esp = devEsp.get(g.dev) ?? [];
      const mt = mainTimes.get(gkey) ?? [];
      const rt = resTimes.get(gkey) ?? [];
      for (const x of sessions) {
        x.mh = mt.filter((t) => t >= x.s && t <= x.e).length;
        // Alleen losse onderdelen (tellers op andere webwinkels, plaatjes uit mails, advertenties): geen bezoek. Niet voor Google
        // (eigen regel voor zoekopdrachten).
        const inX = all.filter((t) => t >= x.s && t <= x.e).length;
        if (!FG_RULES[g.site] && inX > 0 && rt.filter((t) => t >= x.s && t <= x.e).length >= inX) x.res = 1;
      }
      if (esp.length) for (const x of sessions) if (isMailSession(x, esp, devMailClient.get(g.dev) ?? [], mt.filter((t) => t >= x.s && t <= x.e).length)) x.ml = 1;
    }
    const emb = embedTimes.get(gkey);
    if (emb) for (const x of sessions) if (emb.some((t) => t >= x.s - 5_000 && t <= x.e + 5_000)) embedSes.push({ g, x });
    // (Na het bepalen van beeld/geluid, mail en inhoud.) Zichtbare sites: de laatste 20 sessies, plus alle oudere sessies die echt gebruik waren (op drukke dagen meer dan 20).
    g.ss = g.main && !g.bg ? sessions.filter((x, i) => i < 20 || isHuman(x) || !!g.flag).slice(0, 120) : sessions.slice(0, 5);
    g.ts = all.filter(Boolean).sort((a, b) => b - a).slice(0, 8);
    // Een site waarvan alle verzoeken door NextDNS zijn geblokkeerd, is geen "nieuwe site" die bezocht is.
    g.isNew = meaningful && g.main && !g.bg && g.bl < g.n && (siteFirst.get(g.site) ?? 0) >= newCutoff;
    if (g.main && !g.bg) g.susp = suspicion(g.site) ?? undefined;
    siteName.set(g.site, g.name);
  }

  // Een ingesloten filmpje (Vimeo/YouTube-speler) terwijl op hetzelfde apparaat een andere site open is, hoort bij die site.
  if (embedSes.length) {
    const vis = new Map<string, { site: string; s: number; e: number }[]>();
    for (const g of groups.values()) {
      if (!g.main || g.bg || g.flag) continue;
      for (const x of g.ss) if (isHuman(x)) (vis.get(g.dev) ?? vis.set(g.dev, []).get(g.dev)!).push({ site: g.site, s: x.s, e: x.e });
    }
    for (const { g, x } of embedSes) {
      if (g.flag) continue;
      if ((vis.get(g.dev) ?? []).some((v) => v.site !== g.site && v.s <= x.e + 60_000 && v.e >= x.s - 60_000)) x.emb = 1;
    }
  }

  // Thuis of onderweg (op basis van de IP-adressen waarmee een apparaat verbindt).
  const away = analyzeNetwork(netRows);

  // Betaalmomenten: opeenvolgende verzoeken van hetzelfde soort binnen 3 minuten tellen als één moment.
  payRaw.sort((a, b) => a.t - b.t);
  const payments: PayMoment[] = [];
  for (const p of payRaw) {
    const last = [...payments].reverse().find((x) => x.dev === p.dev && x.kind === p.kind);
    if (last && p.t - last.t <= 3 * 60_000) continue;
    payments.push(p);
  }
  payments.reverse();

  // Welke apps zijn het spraakzaamst naar trackers? Geblokkeerd verkeer koppelen we aan de dichtstbijzijnde app (±30 s) op hetzelfde apparaat.
  const sortedVis = new Map<string, { t: number; site: string }[]>();
  const sortedVisT = new Map<string, number[]>();
  for (const [dev, list] of visSites) {
    list.sort((a, b) => a.t - b.t);
    sortedVis.set(dev, list);
    sortedVisT.set(dev, list.map((x) => x.t)); // één keer, niet per geblokkeerd verzoek
  }
  const trackerBySite = new Map<string, number>();
  for (const b of blockedRows) {
    const list = sortedVis.get(b.dev);
    const ts = sortedVisT.get(b.dev);
    if (!list || !ts) continue;
    const i = nearestIdx(ts, b.t);
    if (i >= 0 && Math.abs(ts[i] - b.t) <= 30_000) trackerBySite.set(list[i].site, (trackerBySite.get(list[i].site) ?? 0) + 1);
  }
  const trackers = [...trackerBySite.entries()]
    .map(([site, n]) => ({ site, name: siteName.get(site) ?? site, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const weekAgo = Date.now() - 7 * DAY;
  const devices: Device[] = [...devCount.entries()]
    .map(([name, n]) => {
      const all = (devAll.get(name) ?? []).sort((a, b) => a - b);
      const byDay = devVis.get(name) ?? new Map<string, number[]>();
      const prev = [...byDay.entries()].filter(([d]) => d !== today && d !== "onbekend").sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);
      // Eerste en laatste echte activiteit: alleen sessies van minstens 2 minuten, zodat een los achtergrondverzoek 's nachts niet meetelt.
      const dm: Record<string, number> = {};
      const sleep: SleepDay[] = [];
      for (const [d, ts] of [...byDay.entries()].filter(([d]) => d !== "onbekend").sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14)) {
        const ses = allSessions(ts);
        dm[d] = ses.reduce((n, x) => n + minutes(x), 0);
        const real = ses.filter((x) => minutes(x) >= 2);
        if (sleep.length < 7 && real.length) sleep.push({ d, first: Math.min(...real.map((x) => x.s)), last: Math.max(...real.map((x) => x.e)) });
      }
      const th = threatTimes.get(name) ?? [];
      const topSites = new Map<string, number>();
      for (const x of th) topSites.set(x.site, (topSites.get(x.site) ?? 0) + 1);
      return {
        name,
        n,
        last: all.length ? all[all.length - 1] : 0,
        first: all.length ? all[0] : 0,
        gap: gapP95(all, hourOf),
        days: new Set(all.map((t) => dayFmt.format(t))).size,
        ss: allSessions(byDay.get(today) ?? []),
        avg: prev.length ? Math.round(prev.reduce((m, [, ts]) => m + totalMinutes(ts), 0) / prev.length) : 0,
        blocked: devBlockedToday.get(name) ?? 0,
        away: away.get(name) ?? { now: null, since: 0, runs: [] },
        sleep,
        dm,
        threats: {
          today: th.filter((x) => dayFmt.format(x.t) === today).length,
          week: th.filter((x) => x.t >= weekAgo).length,
          top: [...topSites].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([site, c]) => ({ site: siteName.get(site) ?? site, n: c })),
        },
      };
    })
    .sort((a, b) => b.n - a.n);

  const list = [...groups.values()].sort((a, b) => b.last - a.last).slice(0, MAX_GROUPS);
  const result = {
    groups: list,
    devices,
    total,
    deviceMap, // id -> label; bevat nooit de echte naam
    insights: { payments: payments.slice(0, 60), trackers, since: Number.isFinite(minT) ? minT : 0, until: maxT },
    meta: { columns: header, statuses: Object.fromEntries(statuses), reasons: [...reasonSamples] }, // om de kolommen te controleren
  };
  if (!todayOnly) cache = { at: Date.now(), body: result };
  return NextResponse.json(result);
}
