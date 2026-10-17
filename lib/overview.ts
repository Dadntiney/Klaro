import { detectColumns, extractHost, parseCsv } from "./parse.ts";
import { isPlainSite } from "./system.ts";
import { clickBefore, isClickHost, isEspHost, isMailClientHost, isMailSession } from "./mail.ts";
import { FG_RULES, NAV_APPS, NAV_GAP, TV_APPS, classify, isKeepAlive, isStreamArt, isLoginHost, fgHit, isEmbedHost, isPlaying, isResourceHost, isMedia, isQuietHost, payKind } from "./sites.ts";
import { anonId, deviceType, labelDevices } from "./names.ts";
import { GAP, MOMENT, OPEN_BURST, OPEN_START, allSessions, isHuman, moments, clusterSessions, minutes, totalMinutes, type Session } from "./sessions.ts";
import { categoryOf } from "./categories.ts";
import { gapP95 } from "./devstats.ts";
import { suspicion } from "./suspect.ts";
import { analyzeNetwork, type AwayInfo, type NetRow } from "./network.ts";
import { autoRefreshing, nextdnsError, windowStart } from "./nextdns.ts";
import { anchorOf, chainTimes, companionFor, COMPANIONS, loadedWith } from "./companion.ts";
import { GELEERD, geldig } from "./geleerd.ts";
import { assignPlayback } from "./play.ts";
import { isVideoOnlyClip, isYouTubeAppHost } from "./clip.ts";
import { prepareLists } from "./adultlist.ts";

/** Antwoord van NextDNS (of de eigen doorgeefserver): genoeg van `Response` voor wat hier nodig is. */
export interface NDResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** Hoe de logs bij NextDNS worden opgehaald: rechtstreeks met de sleutel (server, scripts) of via de eigen server (browser). */
export interface NextDNSClient {
  /** GET /profiles/{id}/logs?{query} */
  logs(query: string, timeoutMs: number): Promise<NDResponse>;
  /** GET /profiles/{id}/logs/download (alle opgeslagen logs als CSV) */
  download(timeoutMs: number): Promise<NDResponse>;
}

/** Rechtstreeks bij NextDNS (Node: scripts en tests). */
export function directClient(key: string, profile: string): NextDNSClient {
  const base = `https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs`;
  const get = (url: string, ms: number) => fetch(url, { headers: { "X-Api-Key": key.trim() }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(ms) });
  return { logs: (q, ms) => get(`${base}?${q}`, ms), download: (ms) => get(`${base}/download`, ms) };
}


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

/** Oud naar nieuw, net als de volledige download: dan voegt het samennemen van dubbele opvragingen precies hetzelfde samen. */
function oldestFirst(rows: string[][]): string[][] {
  const [header, ...body] = rows;
  // NextDNS geeft nieuwste eerst: omdraaien vóór het sorteren, zodat ook gelijke tijden in download-volgorde staan.
  return [header, ...body.reverse().map((r) => [Date.parse(r[0]) || 0, r] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1])];
}

/** Alleen de logs van vandaag via de gewone log-endpoint (pagina's van 1000). Veel sneller dan de volledige download, maar geeft geen geschiedenis. */
export async function fetchToday(client: NextDNSClient, hours = 0): Promise<{ rows: string[][]; cutAt?: number } | { error: string; status: number }> {
  const from = windowStart(hours);
  const out: string[][] = [TODAY_HEADER];
  let cursor = "";
  const deadline = Date.now() + 40_000;
  let oldest = Infinity;
  for (let page = 0; page < 40 && Date.now() < deadline; page++) {
    let res: NDResponse;
    try {
      // Elke pagina hooguit 15 sec.: één hangend antwoord mag het geheel niet laten vastlopen.
      res = await client.logs(`from=${from}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, Math.max(1000, Math.min(15_000, deadline - Date.now())));
    } catch {
      return { error: "NextDNS is niet bereikbaar.", status: 502 };
    }
    if (!res.ok) return { error: nextdnsError(res.status, await res.text().catch(() => "")), status: 502 };
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[]; meta?: { pagination?: { cursor?: string | null } } } | null;
    if (!json) break; // antwoord half binnen of onleesbaar: niet doen alsof vandaag compleet is
    for (const e of json?.data ?? []) {
      const dev = (e.device ?? {}) as { id?: string; name?: string; model?: string };
      const reasons = (Array.isArray(e.reasons) ? e.reasons : []).map((r) => `${(r as { id?: string }).id ?? ""} ${(r as { name?: string }).name ?? ""}`).join(" ");
      const dest = (Array.isArray(e.destinations) ? e.destinations : []).find((d) => (d as { type?: string }).type === "country") as { code?: string } | undefined;
      const t = Date.parse(String(e.timestamp ?? ""));
      if (t) oldest = Math.min(oldest, t);
      out.push([String(e.timestamp ?? ""), String(e.domain ?? ""), String(e.status ?? ""), reasons, dest?.code ?? "", String(e.clientIp ?? ""), dev.id ?? "", dev.name ?? "", dev.model ?? ""]);
    }
    cursor = json?.meta?.pagination?.cursor ?? "";
    if (!cursor) return { rows: oldestFirst(out) };
  }
  // Niet alles binnen (heel drukke dag of NextDNS traag): alleen vanaf het oudste ontvangen moment klopt het.
  return { rows: oldestFirst(out), cutAt: Number.isFinite(oldest) ? oldest : Date.now() };
}

/** Zoekmachines: daarna een site openen is op een resultaat tikken. */
const SEARCH = new Set(["google.com", "bing.com", "duckduckgo.com", "ecosia.org"]);

/** Social-apps waarin advertenties en links staan die de app alvast "aanklopt". */
const SOCIAL = new Set(["x.com", "facebook.com", "instagram.com", "tiktok.com", "reddit.com", "linkedin.com", "snapchat.com", "pinterest.com", "threads.net"]);

/** Het overzicht van alle (of alleen vandaag de) logs: precies dezelfde berekening op de server, in scripts en in de browser. */
/** Meetadressen van een site zelf (telemetry., ct., ...): een open tabblad meldt zich daar, ook als niemand kijkt. */
const METER = /^(telemetry|ct|log|logs|track|tracking|analytics|stats|metrics|beacon|rum|collect)\./;

export async function buildOverview(client: NextDNSClient, opts: { todayOnly: boolean; hours?: number }): Promise<{ status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const todayOnly = opts.todayOnly;
  const hours = Math.min(24, Math.max(0, Number(opts.hours) || 0));

  let rows: string[][];
  let cutAt: number | undefined;
  if (todayOnly) {
    const t0 = Date.now();
    const r = await fetchToday(client, hours);
    if ("error" in r) return ({ status: r.status, body: { error: r.error } });
    rows = r.rows;
    cutAt = r.cutAt;
    console.log(`scope=today: ${rows.length - 1} regels in ${Date.now() - t0} ms${cutAt ? " (niet compleet)" : ""}`);
  } else {
  // De download-endpoint accepteert geen filters (alleen X-Api-Key): we krijgen alle opgeslagen logs.
  let res: NDResponse;
  try {
    res = await client.download(50_000);
  } catch {
    return ({ status: 502, body: { error: "NextDNS is niet bereikbaar." } });
  }
  if (!res.ok) return ({ status: 502, body: { error: nextdnsError(res.status, await res.text().catch(() => "")) } });

  try {
    rows = parseCsv(await res.text());
  } catch {
    return ({ status: 502, body: { error: "NextDNS is niet bereikbaar." } });
  }
  }
  if (rows.length < 2) return ({ status: 200, body: { groups: [], devices: [], total: 0, insights: { payments: [], trackers: [] } } });
  const [header, ...body] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const tCol = col("timestamp");
  const hostCol = col("domain") >= 0 ? col("domain") : (detectColumns(header, body)?.hostCol ?? -1);
  if (hostCol < 0) return ({ status: 502, body: { error: "Geen domeinkolom in de NextDNS-logs gevonden." } });
  // In de browser: eerst bij de eigen server navragen welke adressen op de 18+/dating-lijst staan.
  await prepareLists(body.map((r) => extractHost(r[hostCol] ?? "")).filter((h): h is string => !!h));
  const nameCol = col("device_name");
  const idCol = col("device_id");
  const modelCol = col("device_model");
  const statusCol = col("status");
  const reasonsCol = col("reasons");
  const ccCol = col("destination_country");
  const ipCol = col("client_ip");

  // Eerst alle apparaten bepalen, zodat gelijke soorten consistent worden genummerd.
  const found = new Map<string, string>();
  const idOf = (r: string[]) => (idCol >= 0 && r[idCol]?.trim()) || (nameCol >= 0 && r[nameCol]?.trim() && anonId(r[nameCol].trim())) || "onbekend";
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
  const embedGen = new Map<string, number[]>(); // alleen embed.*-adressen (algemene ingebouwde onderdelen)
  const resTimes = new Map<string, number[]>(); // losse onderdelen (tellers, plaatjes, advertenties)
  const meterTimes = new Map<string, number[]>(); // meetadressen van de site zelf (zie METER)
  const siteHosts = new Map<string, { t: number; host: string }[]>(); // welke adressen van de site wanneer (een echte pagina laadt er meerdere)
  const loginTimes = new Map<string, number[]>(); // inlog-/bankierpagina's (bankieren., mijn., login.): altijd bewust geopend
  const mainTimes = new Map<string, number[]>(); // verzoeken naar de site zelf (www., nl., ...): bij een mail komt die er niet aan te pas // ingesloten videospeler (Vimeo/YouTube op een andere site) // inhoud geladen (bij apps met veel achtergrondverkeer) // alleen beeld/geluid-verkeer per groep
  const devEsp = new Map<string, number[]>(); // verkeer van mailbedrijven per apparaat (nieuwsbrief geopend)
  const devClick = new Map<string, number[]>(); // per apparaat: momenten waarop op een link in een mail werd getikt
  const devSearch = new Map<string, number[]>(); // momenten met een zoekopdracht (Google/Bing/...)
  const devYtApp = new Map<string, number[]>(); // adressen die alleen de YouTube-app zelf gebruikt (zie lib/clip.ts)
  const clickVisits: { g: Group; x: Session; click: number }[] = []; // bezoeken vanuit een tik op een mail-link
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
  // Algemene adressen die alleen in een keten bij een spel horen (Minecraft: meetgegevens van Microsoft), zie lib/companion.ts.
  const compRaw = new Map<string, { a: number[]; h: number[] }>();
  for (const r of body) {
    const host = extractHost(r[hostCol] ?? "");
    const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    if (!t) continue;
    const c = anchorOf(host!) ?? companionFor(host!);
    if (!c) continue;
    const k = deviceMap[idOf(r)] + "|" + c.app;
    const e = compRaw.get(k) ?? compRaw.set(k, { a: [], h: [] }).get(k)!;
    (c.anchor.test(host!) ? e.a : e.h).push(t);
  }
  const compIn = new Map<string, Set<number>>();
  for (const [k, e] of compRaw) {
    const c = COMPANIONS.find((x) => x.app === k.slice(k.lastIndexOf("|") + 1))!;
    if (e.a.length) compIn.set(k, chainTimes(e.a, e.h, c.keep, c.lead));
  }
  // Afspeelsignalen zonder eigen app (Conviva) horen bij de tv-app waarmee hun reeks begon, zie lib/play.ts.
  const playOf = new Map<string, string>(); // apparaat|tijdstip -> site van de tv-app
  {
    const byDev = new Map<string, { t: number; host: string; site?: string }[]>();
    for (const r of body) {
      const host = extractHost(r[hostCol] ?? "");
      const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
      if (!t) continue;
      const info = classify(host!);
      const blocked = (statusCol >= 0 ? r[statusCol] ?? "" : "").trim().toLowerCase() === "blocked";
      const app = TV_APPS.has(info.site) && !info.bg;
      if (!app && !(isPlaying(host!, blocked) && isPlainSite(info))) continue;
      const dev = deviceMap[idOf(r)];
      (byDev.get(dev) ?? byDev.set(dev, []).get(dev)!).push({ t, host: host!, site: app ? info.site : undefined });
    }
    for (const [dev, ev] of byDev) for (const [t, site] of assignPlayback(ev)) playOf.set(dev + "|" + t, site);
  }
  // Sites die altijd met een hulpadres van een andere site meekomen (script van een websitebouwer), zie lib/companion.ts.
  let learnedHelpers: string[] = [];
  const helperSites = (() => {
    const ev: Parameters<typeof loadedWith>[0] = [];
    for (const r of body) {
      const host = extractHost(r[hostCol] ?? "");
      const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
      if (!t) continue;
      const info = classify(host!);
      if (info.bg || info.flag) continue;
      ev.push({ t, dev: idOf(r), host: host!, site: info.site, page: info.main && isPlainSite(info), helper: !info.main });
    }
    learnedHelpers = [...loadedWith(ev)];
    return new Set([...learnedHelpers, ...geldig(GELEERD.helpers, Date.now())]);
  })();
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
    const comp = t ? companionFor(host) : undefined;
    if (comp && compIn.get(dev + "|" + comp.app)?.has(t)) info = classify(comp.app);
    const play = t ? playOf.get(dev + "|" + t) : undefined;
    if (play) info = classify(play);
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
      if (!blocked && isClickHost(host)) (devClick.get(dev) ?? devClick.set(dev, []).get(dev)!).push(t);
      if (isYouTubeAppHost(host)) (devYtApp.get(dev) ?? devYtApp.set(dev, []).get(dev)!).push(t);
      if (!blocked && /^(www\.google\.[a-z.]+|www\.bing\.com|duckduckgo\.com|www\.ecosia\.org)$/.test(host)) (devSearch.get(dev) ?? devSearch.set(dev, []).get(dev)!).push(t);
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
      // Begon de dag met een teller van de site (log.merk.nl) en kwam daarna de site zelf: dan is het geen achtergrond.
      if (g.bg && info.main && !info.bg) g.bg = false;
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
    if (METER.test(host)) (meterTimes.get(gkey) ?? meterTimes.set(gkey, []).get(gkey)!).push(t);
    if (info.main && !info.flag) (mainTimes.get(gkey) ?? mainTimes.set(gkey, []).get(gkey)!).push(t);
    if (!info.bg) (siteHosts.get(gkey) ?? siteHosts.set(gkey, []).get(gkey)!).push({ t, host });
    if (!blocked && isLoginHost(host)) (loginTimes.get(gkey) ?? loginTimes.set(gkey, []).get(gkey)!).push(t);
    if (isEmbedHost(host)) (embedTimes.get(gkey) ?? embedTimes.set(gkey, []).get(gkey)!).push(t);
    if (/^embed\./.test(host)) (embedGen.get(gkey) ?? embedGen.set(gkey, []).get(gkey)!).push(t);
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
  const singles = new Map<string, number[]>(); // per apparaat|site: aantal losse één-pagina-opvragingen per dag
  const refreshLike: { key: string; x: Session }[] = []; // mogelijke verversingen van een widget (2-3 keer alleen de site zelf)
  // Momenten waarop op een apparaat in een social-app gescrold werd (inhoud geladen), voor alle sites samen.
  const fgByDev = new Map<string, number[]>();
  const devFg = (dev: string) => {
    if (!fgByDev.size) {
    for (const [k, ts] of fgTimes) { const [, dv, site] = k.split("|"); if (SOCIAL.has(site)) fgByDev.set(dv, [...(fgByDev.get(dv) ?? []), ...ts]); }
    // Apps zonder eigen "inhoud"-regel (X, Reddit, LinkedIn, Threads): hun verkeer telt als scrollen. Facebook e.d. hebben al een
    // inhoud-regel (hun achtergrondverkeer telt dus niet).
    for (const [k, ts] of times) { const [, dv, site] = k.split("|"); if (SOCIAL.has(site) && !FG_RULES[site]) fgByDev.set(dv, [...(fgByDev.get(dv) ?? []), ...ts]); }
  }
    return fgByDev.get(dev) ?? [];
  };
  for (const [gkey, g] of groups) {
    const all = times.get(gkey) ?? [];
    let sessions = allSessions(all);
    // Navigatie (Waze): stukjes met hooguit NAV_GAP ertussen zijn één rit (zie NAV_APPS).
    if (NAV_APPS.has(g.site) && sessions.length > 1) {
      const out: Session[] = [];
      for (const x of [...sessions].sort((a, b) => a.s - b.s)) {
        const l = out[out.length - 1];
        if (l && x.s - l.e <= NAV_GAP) { l.e = Math.max(l.e, x.e); l.n = (l.n ?? 0) + (x.n ?? 0); } else out.push({ ...x });
      }
      sessions = out.sort((a, b) => b.e - a.e);
    }
    // Tellen in momenten per site: alles van dezelfde site binnen 1,5 s (www + plaatjes + script) is één moment.
    for (const x of sessions) x.n = moments(all.filter((t) => t >= x.s && t <= x.e));
    // Apps met veel achtergrondverkeer (Facebook, Instagram, WhatsApp, ...): tel hoe vaak er echt inhoud laadde, en meet de duur
    // alleen van de eerste tot de laatste keer inhoud; verversen op de achtergrond rekt de duur dan niet op.
    if (FG_RULES[g.site]) {
      const real = [...(fgTimes.get(gkey) ?? []), ...(mediaTimes.get(gkey) ?? [])];
      // Kijkmeldingen (zie KEEP_ALIVE) die aansluiten op echte inhoud: tellen als inhoud.
      // Niet binnen 30 s van de inhoud zelf: dat is gewoon het laden van de pagina (of een ingebouwde video op een andere site).
      const keep = (siteHosts.get(gkey) ?? []).filter((h) => isKeepAlive(g.site, h.host) && !real.some((t) => Math.abs(t - h.t) <= 30_000)).map((h) => h.t);
      if (keep.length && real.length) { const ch = chainTimes(real, keep, GAP, 0); real.push(...ch); (fgTimes.get(gkey) ?? fgTimes.set(gkey, []).get(gkey)!).push(...ch); }
      for (const x of sessions) {
        const inX = real.filter((t) => t >= x.s && t <= x.e);
        // Inhoud-momenten, of het aantal verschillende inhoud-adressen als dat meer is: een app die opent haalt in één
        // moment instellingen én plaatjes op (WhatsApp: graph + static); achtergrond raakt hooguit één zo'n adres. Zie OPEN_BURST.
        const sh = OPEN_BURST.has(g.site) ? (siteHosts.get(gkey) ?? []).filter((h) => h.t >= x.s && h.t <= x.e) : [];
        const fgSet = new Set(sh.filter((h) => fgHit(g.site, h.host)).map((h) => h.host));
        // De volledige opstart van de app (zie OPEN_START) telt ook als inhoud-adres: graph. ligt dan soms nog in het geheugen.
        if (sh.some((h) => OPEN_START.every((re) => sh.some((o) => re.test(o.host) && Math.abs(o.t - h.t) <= 5_000)))) fgSet.add("(opstart)");
        const fgHosts = fgSet.size;
        x.f = Math.max(moments((fgTimes.get(gkey) ?? []).filter((t) => t >= x.s && t <= x.e)), fgHosts);
        if (inX.length) { x.s = inX.reduce((a, b) => Math.min(a, b)); x.e = inX.reduce((a, b) => Math.max(a, b)); }
        // Op een tv telt kijken vanaf het afspelen (met 2 minuten om iets te kiezen), niet vanaf het beginscherm dat open stond.
        const play = (mediaTimes.get(gkey) ?? []).filter((t) => t >= x.s && t <= x.e);
        if (/^(Apple TV|TV)( \d+)?$/.test(g.dev) && play.length) x.s = Math.max(x.s, play.reduce((a, b) => Math.min(a, b)) - 120_000);
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
    if (!g.flag && !g.bg && isPlainSite(g)) { // herkende apps (eigen naam) komen nooit uit een mail
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
      if (esp.length) for (const x of sessions) {
        const mh = mt.filter((t) => t >= x.s && t <= x.e).length, mc = devMailClient.get(g.dev) ?? [], ck = devClick.get(g.dev) ?? [];
        if (isMailSession(x, esp, mc, mh, ck)) x.ml = 1;
        // Alleen een bezoek dankzij een klik in de mail: onthouden, want één klik leidt naar één site (zie hieronder).
        else if (isMailSession(x, esp, mc, mh)) clickVisits.push({ g, x, click: clickBefore(x, ck)! });
      }
      // Eén pagina geopend op de site zelf (www. of de kale naam) is een echt bezoek, ook al is het maar één moment: wie een
      // vacature of winkelpagina opent en leest, vraagt daarna vaak niets nieuws meer op. Behalve als die site die dag op dit
      // apparaat vaker dan 4 keer zo los opduikt: dan ververst een widget of open tabblad zichzelf.
      // Inloggen of bankieren (bankieren.rabobank.nl, mijn.merk.nl): bewust geopend, nooit een mail of widget.
      const lt = loginTimes.get(gkey) ?? [];
      for (const x of sessions) if (lt.some((t) => t >= x.s && t <= x.e)) { x.lg = 1; delete x.ml; }
      // Eén pagina telt als bezoek, behalve als het gebeurde terwijl er in een social-app (X, Facebook, Instagram, ...) gescrold
      // werd en er maar één adres van de site opgevraagd werd: dan klopte de app een advertentie of link alvast aan.
      const sh = siteHosts.get(gkey) ?? [];
      const hostsIn = (x: Session) => new Set(sh.filter((h) => h.t >= x.s - 3_000 && h.t <= x.e + 3_000).map((h) => h.host)).size;
      const fgDev = devFg(g.dev);
      // Ruim venster: ook social-apps onthouden adressen, dus tijdens scrollen komen er soms minuten lang geen nieuwe (3 min).
      const inSocial = (x: Session) => fgDev.some((t) => t >= x.s - 180_000 && t <= x.e + 180_000);
      const cand = sessions.filter((x) => x.n === 1 && (x.mh ?? 0) >= 1 && !x.ml && !x.res && !x.m);
      // Eén los adres tijdens scrollen in een social-app: kan een aangeklopte advertentie zijn, maar ook een echt geopende
      // link (vanuit Facebook/X openen sites in de app zelf). DNS kan dat niet onderscheiden: tonen, maar als onzeker.
      if (cand.length <= 4) for (const x of cand) { x.pv = 1; if (hostsIn(x) < 2 && inSocial(x)) x.uz = 1; }
      if (cand.length) singles.set(g.dev + "|" + g.site, [...(singles.get(g.dev + "|" + g.site) ?? []), cand.length]);
      // Twee of drie opvragingen binnen 5 minuten met weer alleen de kale naam en www. van de site (en hooguit een meetadres, zoals
      // een open Canva-tabblad dat zich elke paar minuten meldt), verder niets van de site (een echte pagina laadt ook plaatjes en onderdelen): bij een site die zichzelf ververst zijn dat verversingen (zie onder).
      for (const x of sessions) {
        if ((x.n ?? 0) < 2 || (x.n ?? 0) > 3 || x.lg || x.ml || x.ck || x.m || x.f !== undefined || hostsIn(x) > 2) continue;
        const inX = (ts: number[]) => ts.filter((t) => t >= x.s && t <= x.e).length;
        if ((x.mh ?? 0) + inX(meterTimes.get(gkey) ?? []) >= inX(all)) refreshLike.push({ key: g.dev + "|" + g.site, x });
      }
    }
    // Clip in een andere app (Shazam): alleen videoservers van YouTube, kort, niet vlak na echt YouTube-gebruik. Zie lib/clip.ts.
    if (g.site === "youtube.com") {
      const yh = siteHosts.get(gkey) ?? [];
      for (const x of sessions) {
        const hs = yh.filter((h) => h.t >= x.s - 60_000 && h.t <= x.e + 60_000).map((h) => h.host);
        if ((devYtApp.get(g.dev) ?? []).some((t) => t >= x.s - 60_000 && t <= x.e + 60_000)) hs.push("youtubei.googleapis.com");
        const recent = sessions.some((y) => y !== x && y.e <= x.s && x.s - y.e < 1_800_000 && isHuman(y));
        if (isVideoOnlyClip(hs, x.e - x.s, recent)) x.emb = 1;
      }
    }
    const emb = embedTimes.get(gkey);
    // Een embed.-onderdeel hoort alleen bij een andere site als de eigen site (www. of de kale naam) er niet zelf bij geopend werd.
    const near = (ts: number[] | undefined, x: Session) => (ts ?? []).some((t) => t >= x.s - 5_000 && t <= x.e + 5_000);
    const own = (x: Session) => (siteHosts.get(gkey) ?? []).some((h) => h.t >= x.s - 5_000 && h.t <= x.e + 5_000 && (h.host === g.site || h.host === "www." + g.site));
    const player = (x: Session) => (emb ?? []).some((t) => t >= x.s - 5_000 && t <= x.e + 5_000 && !(embedGen.get(gkey) ?? []).includes(t));
    if (emb) for (const x of sessions) if (near(emb, x) && (player(x) || !own(x))) embedSes.push({ g, x });
    // (Na het bepalen van beeld/geluid, mail en inhoud.) Zichtbare sites: de laatste 20 sessies, plus alle oudere sessies die echt gebruik waren (op drukke dagen meer dan 20).
    g.ss = g.main && !g.bg ? sessions.filter((x, i) => i < 20 || isHuman(x) || !!g.flag).slice(0, 120) : sessions.slice(0, 5);
    g.ts = all.filter(Boolean).sort((a, b) => b - a).slice(0, 8);
    // Een site waarvan alle verzoeken door NextDNS zijn geblokkeerd, is geen "nieuwe site" die bezocht is.
    g.isNew = meaningful && g.main && !g.bg && g.bl < g.n && (siteFirst.get(g.site) ?? 0) >= newCutoff;
    if (g.main && !g.bg) g.susp = suspicion(g.site) ?? undefined;
    siteName.set(g.site, g.name);
  }

  // Eerst zoeken en daarna de site zelf laden = op een zoekresultaat getikt, ook al kwam er net een nieuwsbrief binnen. Alleen als
  // die zoeksessie zelf echt gebruik was (een widget die Google ververst telt niet).
  {
    const searchSes = new Map<string, Session[]>();
    for (const g of groups.values()) if (SEARCH.has(g.site)) for (const x of g.ss) if (isHuman(x) && (x.n ?? 0) >= 2) (searchSes.get(g.dev) ?? searchSes.set(g.dev, []).get(g.dev)!).push(x);
    for (const g of groups.values()) {
      if (!g.main || g.bg || g.flag || !isPlainSite(g)) continue;
      for (const x of g.ss) {
        if (!x.ml || !(x.mh ?? 0)) continue;
        const q = (devSearch.get(g.dev) ?? []).filter((t) => t >= x.s - 60_000 && t <= x.s + 1_000);
        if (q.length && (searchSes.get(g.dev) ?? []).some((y) => q.some((t) => t >= y.s - 60_000 && t <= y.e + 60_000))) { delete x.ml; x.ck = 1; }
      }
    }
  }

  // Eén tik op een mail-link opent één site. "Klikt" één moment meerdere sites tegelijk open, dan laadde een mail zijn plaatjes via
  // een klik-adres: dan is het gewoon een geopende mail en telt geen van die sites. Echte klik-bezoeken krijgen een merkje (ck),
  // zodat de pagina ze ook niet alsnog als mail ziet.
  {
    const byClick = new Map<string, typeof clickVisits>();
    for (const v of clickVisits) (byClick.get(v.g.dev + "|" + v.click) ?? byClick.set(v.g.dev + "|" + v.click, []).get(v.g.dev + "|" + v.click)!).push(v);
    for (const vs of byClick.values()) {
      const single = new Set(vs.map((v) => v.g.site)).size === 1;
      for (const { x } of vs) if (single) x.ck = 1; else { x.ml = 1; delete x.pv; }
    }
  }

  // Een ingesloten filmpje (Vimeo/YouTube/Wistia-speler) terwijl op hetzelfde apparaat een andere site open is, hoort bij die site.
  // Zolang de speler doorloopt (Wistia meldt elke ~2 minuten dat er nog afgespeeld wordt), kijkt iemand op die site: de sessie van
  // de site waarop het filmpje begon (de laatst geopende) loopt dan door tot het einde van het filmpje.
  if (embedSes.length) {
    const vis = new Map<string, { g: Group; x: Session }[]>();
    for (const g of groups.values()) {
      if (!g.main || g.bg || g.flag) continue;
      for (const x of g.ss) if (isHuman(x)) (vis.get(g.dev) ?? vis.set(g.dev, []).get(g.dev)!).push({ g, x });
    }
    // Op volgorde van tijd: een speler die net begon verlengt de pagina eerst, zodat het vervolg daar weer op aansluit.
    for (const { g, x } of [...embedSes].sort((a, b) => a.x.s - b.x.s)) {
      if (g.flag) continue;
      const on = (vis.get(g.dev) ?? []).filter((v) => v.g.site !== g.site && v.x.s <= x.e + 60_000 && v.x.e >= x.s - 60_000);
      if (!on.length) continue;
      x.emb = 1;
      const host = on.filter((v) => v.x.s <= x.s + 60_000).sort((a, b) => b.x.s - a.x.s)[0];
      if (host && x.e > host.x.e) {
        const before = minutes(host.x);
        host.x.e = x.e;
        delete host.x.uz; // er speelde echt iets af op deze site: geen aangeklopte advertentie
        host.g.mins += minutes(host.x) - before;
        if (x.e > host.g.last) host.g.last = x.e;
      }
    }
  }

  // Eén los adres van een andere site binnen 3 seconden nadat op hetzelfde apparaat een pagina werd geopend: dat laadt die pagina
  // zelf (affiliate-links, productwidgets, tellers op een eigen domein), geen eigen bezoek. Zo snel tikt niemand op een link.
  // Een www.-adres is wel een eigen pagina (doorgestuurd naar een webwinkel), en na een zoekmachine is het juist een tik op een resultaat.
  {
    const pages = new Map<string, { t: number; site: string }[]>();
    for (const [gkey, g] of groups) {
      if (!g.main || g.bg || g.flag || !isPlainSite(g) || SEARCH.has(g.site)) continue;
      for (const t of mainTimes.get(gkey) ?? []) (pages.get(g.dev) ?? pages.set(g.dev, []).get(g.dev)!).push({ t, site: g.site });
    }
    for (const [gkey, g] of groups) {
      if (!g.main || g.bg || g.flag || g.susp || !isPlainSite(g)) continue;
      const pg = pages.get(g.dev);
      if (!pg) continue;
      for (const x of g.ss) {
        if (!(x.pv || x.ck) || x.lg || x.n !== 1 || x.e - x.s >= 60_000) continue; // een bezoek dat een filmpje laat doorlopen is geen los onderdeel
        const hs = new Set((siteHosts.get(gkey) ?? []).filter((h) => h.t >= x.s - 3_000 && h.t <= x.e + 3_000).map((h) => h.host));
        if (hs.size !== 1 || [...hs][0].startsWith("www.")) continue;
        if (pg.some((p) => p.site !== g.site && x.s > p.t && x.s - p.t <= 3_000)) { delete x.pv; delete x.ck; x.emb = 1; }
      }
    }
    // Een site die elke keer (minstens 2 momenten) tegelijk met een pagina van een andere site opduikt (hooguit 5 s erna), en nooit
    // los, is een onderdeel van die sites: de maker van de website, een hulp- of maatknop, een zustersite in de voettekst.
    // Ook als het een www.-adres is. De pagina die hem laadt blijft altijd staan (twee sites die alleen samen voorkomen: allebei).
    const cand = new Map<string, { x: Session; leads: Set<string>; m: number }[]>();
    const loose = new Set<string>();
    for (const [gkey, g] of groups) {
      if (!g.main || g.bg || g.flag || g.susp || !isPlainSite(g) || SEARCH.has(g.site)) continue;
      const pg = pages.get(g.dev) ?? [];
      const all = times.get(gkey) ?? [];
      for (const x of g.ss) {
        if (!isHuman(x)) continue;
        if (x.lg) { loose.add(g.site); continue; }
        // Elk moment van deze sessie samen met (hooguit 5 s na) een pagina van een andere site?
        const leads = new Set<string>();
        let alone = false;
        const inX: number[] = [];
        for (const t of all) {
          if (t < x.s || t > x.e) continue;
          inX.push(t);
          const l = pg.filter((p) => p.site !== g.site && p.t <= t + 300 && t - p.t <= 5_000);
          if (!l.length) { alone = true; break; }
          for (const p of l) leads.add(p.site);
        }
        if (alone) loose.add(g.site);
        else (cand.get(g.site) ?? cand.set(g.site, []).get(g.site)!).push({ x, leads, m: moments(inX) });
      }
    }
    // Minstens 2 momenten (ook binnen één bezoek: een winkel die zijn pagina's laadt, laadt het platform elke keer opnieuw mee).
    const part = new Set([...cand].filter(([site, xs]) => xs.reduce((n, c) => n + c.m, 0) >= 2 && !loose.has(site)).map(([site]) => site));
    for (const site of part) {
      const xs = cand.get(site)!;
      if (xs.every((c) => [...c.leads].every((l) => part.has(l)))) continue;
      for (const { x } of xs) { delete x.pv; delete x.ck; delete x.uz; x.emb = 1; }
    }
    for (const [, g] of groups) {
      if (!g.main || g.bg || g.flag || g.susp || !helperSites.has(g.site)) continue;
      for (const x of g.ss) if (!x.lg) { delete x.pv; delete x.ck; delete x.uz; x.emb = 1; }
    }
    // Twee of meer andere sites die in dezelfde halve seconde beginnen, kort (hooguit 5 s) na een pagina: die laadt de pagina
    // (zustersites in de voettekst, logo's op een nep-pagina). Zo snel opent een mens nooit twee nieuwe sites.
    const starts: { g: Group; x: Session }[] = [];
    for (const [, g] of groups) {
      if (!g.main || g.bg || g.flag || g.susp || !isPlainSite(g) || SEARCH.has(g.site)) continue;
      for (const x of g.ss) if ((x.pv || x.ck) && !x.lg && x.n === 1 && x.e - x.s < 60_000 && !part.has(g.site)) starts.push({ g, x });
    }
    for (const a of starts) {
      const twin = starts.some((b) => b.g.dev === a.g.dev && b.g.site !== a.g.site && Math.abs(b.x.s - a.x.s) <= 500);
      if (!twin) continue;
      const pg = pages.get(a.g.dev) ?? [];
      const lead = pg.some((p) => p.site !== a.g.site && p.t < a.x.s - 300 && a.x.s - p.t <= 5_000 && !starts.some((b) => b.g.dev === a.g.dev && b.g.site === p.site && Math.abs(b.x.s - a.x.s) <= 500));
      if (lead) { delete a.x.pv; delete a.x.ck; delete a.x.uz; a.x.emb = 1; }
    }
  }

  // Nieuw tabblad in Microsoft Edge: laadt vanzelf MSN-nieuws (en vaak de Bing-zoekbalk). MSN korter dan een minuut = dat
  // tabblad, geen bezoek; Bing telt dan ook niet als het tegelijk begon. Wie echt MSN leest of zoekt, blijft langer en blijft zichtbaar.
  {
    const of = (site: string) => [...groups.values()].filter((g) => g.site === site && g.main && !g.bg && !g.flag);
    const bing = of("bing.com");
    for (const m of of("msn.com")) {
      for (const x of m.ss) {
        if (x.e - x.s >= 60_000) continue;
        x.emb = 1;
        for (const b of bing) {
          if (b.dev !== m.dev) continue;
          for (const y of b.ss) if (y.e - y.s < 60_000 && Math.abs(y.s - x.s) <= 15_000) { x.emb = 1; y.emb = 1; }
        }
      }
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

  // Netflix op een telefoon of tablet wordt ook op de achtergrond wakker (op een iPad ongeveer elk uur: push., ios.prod., één keer
  // logs.). Gemeten over alle dagen: zulke sessies zonder beeld (nflxvideo) en zonder plaatjes van titels duren nooit langer dan
  // 2 minuten; elke langere kijksessie heeft wel beeld. Kort, zonder beeld en zonder plaatjes = achtergrond. Alleen Netflix: bij
  // andere kijk-apps (NPO/Zappelin, Videoland) herkennen we het beeld nog niet volledig (licentie-adressen), dus daar niet.
  for (const [gkey, g] of groups) {
    if (g.site !== "netflix.com" || /^(Apple TV|TV)/.test(g.dev) || g.flag) continue;
    const sh = siteHosts.get(gkey) ?? [];
    for (const x of g.ss) {
      if ((x.m ?? 0) > 0 || x.e - x.s >= 180_000 || x.lg) continue;
      if (!sh.some((h) => h.t >= x.s - 2_000 && h.t <= x.e + 2_000 && isStreamArt(h.host))) x.rf = 1;
    }
  }

  // Sites die zichzelf verversen: alleen te zien over meerdere dagen (dus bij de volledige download). De pagina onthoudt de lijst,
  // zodat ze ook bij het snelle laden van vandaag meteen weg blijven.
  const autoNow = todayOnly ? [] : autoRefreshing(singles);
  const auto = [...new Set([...autoNow, ...geldig(GELEERD.auto, Date.now())])];
  if (auto.length) {
    const set = new Set(auto);
    for (const g of groups.values()) if (set.has(g.dev + "|" + g.site)) for (const x of g.ss) delete x.pv;
    for (const { key, x } of refreshLike) if (set.has(key)) x.rf = 1;
  }
  const list = [...groups.values()].sort((a, b) => b.last - a.last).slice(0, MAX_GROUPS);
  const result = {
    groups: list,
    devices,
    total,
    deviceMap, // id -> label; bevat nooit de echte naam
    insights: { payments: payments.slice(0, 60), trackers, since: Number.isFinite(minT) ? minT : 0, until: maxT },
    auto: todayOnly ? undefined : auto,
    learned: todayOnly ? undefined : { auto: autoNow, helpers: learnedHelpers }, // wat nu uit de logboeken blijkt (scripts/leer.ts legt het vast)
    // Alleen het laatste stuk van vandaag opgehaald: vanaf dit moment klopt het, daarvoor komt nog.
    partial: !todayOnly ? undefined : cutAt ? Math.max(cutAt, hours > 0 ? windowStart(hours) : 0) : hours > 0 && windowStart(hours) > windowStart(0) + 60_000 ? windowStart(hours) : undefined,
    meta: { columns: header, statuses: Object.fromEntries(statuses), reasons: [...reasonSamples] }, // om de kolommen te controleren
  };
  return ({ status: 200, body: result });
}
