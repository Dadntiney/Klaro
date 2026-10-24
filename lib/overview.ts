import { baseDomain, detectColumns, extractHost, parseCsv } from "./parse.ts";
import { isPlainSite, isSystemSite } from "./system.ts";
import { ALWAYS_SHOW_OPEN } from "./livestatus.ts";
import { clickBefore, isClickHost, isEspHost, isMailClientHost, isMailSession } from "./mail.ts";
import { FG_RULES, HEARTBEAT_GAP, NAV_APPS, NAV_GAP, TV_APPS, classify, setLearnedFg, isKeepAlive, isStreamArt, isLoginHost, fgHit, isEmbedHost, isPlaying, isResourceHost, isMedia, isQuietHost, payKind } from "./sites.ts";
import { anonId, deviceType, labelDevices } from "./names.ts";
import { GAP, MOMENT, OPEN_BURST, OPEN_START, allSessions, isHuman, moments, clusterSessions, minutes, totalMinutes, type Session } from "./sessions.ts";
import { categoryOf } from "./categories.ts";
import { gapP95 } from "./devstats.ts";
import { suspicion } from "./suspect.ts";
import { analyzeNetwork, type AwayInfo, type NetRow } from "./network.ts";
import { autoRefreshing, nextdnsError, windowStart } from "./nextdns.ts";
import { anchorOf, assignGameSdk, chainTimes, companionFor, COMPANIONS, followers, GAME_SDK, facebookPixel, instagramShared, loadedWith, NAV_SDK } from "./companion.ts";
import { geldig, loadGeleerd } from "./geleerd.ts";
import { learnFg } from "./selflearn.ts";
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

const MAX_GROUPS = 15000;
const DAY = 86_400_000;
/** Onderdelen van een Shopify-winkel: de winkel zelf vraagt maar één eigen adres op, de rest komt van hier. */
/** Apps zonder achtergrondverkeer: een volledige opstart (3+ eigen adressen in één moment) is altijd echt geopend. */
const START_BURST = new Set(["buienradar.nl"]);
const SHOP_ASSET = /(^|\.)(cdn\.shopify\.com|shopifycdn\.com)$/;

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
const START_ONLY = new Set(["meditopia.com"]);
const SOCIAL = new Set(["x.com", "facebook.com", "instagram.com", "tiktok.com", "reddit.com", "linkedin.com", "snapchat.com", "pinterest.com", "threads.net"]);

/** Het overzicht van alle (of alleen vandaag de) logs: precies dezelfde berekening op de server, in scripts en in de browser. */
/** Meetadressen van een site zelf (telemetry., ct., ...): een open tabblad meldt zich daar, ook als niemand kijkt. */
const METER = /^(telemetry|ct|log|logs|track|tracking|analytics|stats|metrics|beacon|rum|collect)\./;

/** `known`: wat een eerdere berekening over alle dagen leerde (widgets, hulpjes, doorverwijs-adressen), voor het snelle herberekenen van alleen de laatste uren. */
export type Known = { auto?: string[]; helpers?: string[]; followers?: string[]; parts?: string[]; heartbeat?: string[]; fg?: string[] };
export async function buildOverview(client: NextDNSClient, opts: { todayOnly: boolean; hours?: number; known?: Known }): Promise<{ status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const todayOnly = opts.todayOnly;
  const hours = Math.min(24, Math.max(0, Number(opts.hours) || 0));
  const GELEERD = await loadGeleerd(); // wat eerder geleerd is (data/geleerd.json; in de browser na inloggen van de server)

  let rows: string[][];
  let cutAt: number | undefined;
  if (todayOnly) {
    const r = await fetchToday(client, hours);
    if ("error" in r) return ({ status: r.status, body: { error: r.error } });
    rows = r.rows;
    cutAt = r.cutAt;
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
  const [header, ...allBody] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const tCol = col("timestamp");
  // Een afgekapte regel (half overgekomen bij het aanvullen) heeft geen geldige tijd: weglaten, anders "Datum onbekend".
  const body = tCol >= 0 ? allBody.filter((r) => !!Date.parse(r[tCol] ?? "")) : allBody;
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
  const pageLoaded = new Set<Session>(); // vanuit een mail naar de site, waar meteen een hele pagina laadde (zie hieronder)
  const devMailClient = new Map<string, number[]>(); // mailprogramma haalt mail op
  const devMedia = new Map<string, number[]>(); // alle beeld/geluid-verkeer per apparaat (voor tv-apps)
  // Onderdelen van een webwinkel-platform (Shopify) per apparaat: een Shopify-winkel vraagt zelf maar één eigen adres op en haalt
  // de rest van cdn.shopify.com. Komen die in dezelfde seconden, dan is de winkel echt geladen (geen aangeklopte advertentie).
  const devShop = new Map<string, number[]>();
  const siteFirst = new Map<string, number>(); // eerste keer dat een site in de logs staat
  const devAll = new Map<string, number[]>(); // alle verzoeken per apparaat
  const devBase = new Map<string, { t: number; b: string; bl?: 1 }[]>(); // per apparaat: welk hoofddomein wanneer (bl: geblokkeerd)
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
  // Gedeelde Meta-adressen (graph.facebook.com, netwerkmeting) die bij de Instagram-app horen, zie lib/companion.ts.
  const igShared = instagramShared(body.flatMap((r) => {
    const host = extractHost(r[hostCol] ?? "");
    const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    return t && /facebook|fbcdn|instagram/.test(host!) ? [{ t, dev: deviceMap[idOf(r)], host: host! }] : [];
  }));
  // Facebook-pixel op een website: hoort bij die website, geen Facebook-gebruik (lib/companion.ts).
  const fbPixel = facebookPixel(body.flatMap((r) => {
    const host = extractHost(r[hostCol] ?? "");
    const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    if (!t) return [];
    if (/facebook|fbcdn/.test(host!)) return [{ t, dev: deviceMap[idOf(r)], host: host! }];
    // Een Shopify-winkel laadt de rest van de pagina van cdn.shopify.com: telt ook als "website geopend" (3 okt breyerhorses.com).
    if (SHOP_ASSET.test(host!)) return [{ t, dev: deviceMap[idOf(r)], host: host!, page: true }];
    const c = classify(host!);
    return c.main && !c.bg && !c.flag && isPlainSite(c) && !isSystemSite(c.site) ? [{ t, dev: deviceMap[idOf(r)], host: host!, page: true }] : [];
  }));
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
  // Zelf geleerde bewijs-adressen van apps met achtergrondverkeer (lib/selflearn.ts): over alle dagen, plus eerder geleerd.
  let learnedFgList: string[] = [];
  let fgLearnedAll: Record<string, string[]> = {}; // site -> geleerde bewijs-adressen (ook voor live)
  {
    setLearnedFg(new Map());
    const learned = new Map<string, Set<string>>();
    if (!opts.known) {
      const ev: Parameters<typeof learnFg>[0] = [];
      for (const r of body) {
        const host = extractHost(r[hostCol] ?? "");
        const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
        if (!t) continue;
        const blocked = (statusCol >= 0 ? r[statusCol] ?? "" : "").trim().toLowerCase() === "blocked";
        if (blocked) continue;
        const info = classify(host!);
        const app = !!FG_RULES[info.site];
        const page = !app && info.main && !info.bg && !info.flag && isPlainSite(info) && !SEARCH.has(info.site);
        if (!app && !page) continue;
        ev.push({ t, dev: deviceMap[idOf(r)], host: host!, site: info.site, app, known: app && FG_RULES[info.site].test(host!), page });
      }
      for (const [site, hs] of learnFg(ev)) learned.set(site, hs);
      learnedFgList = [...learned].flatMap(([site, hs]) => [...hs].map((h) => site + "|" + h));
    }
    for (const k of [...geldig(GELEERD.fg ?? [], Date.now()), ...(opts.known?.fg ?? [])]) { const i = k.indexOf("|"); (learned.get(k.slice(0, i)) ?? learned.set(k.slice(0, i), new Set()).get(k.slice(0, i))!).add(k.slice(i + 1)); }
    setLearnedFg(learned);
    fgLearnedAll = Object.fromEntries([...learned].map(([k, v]) => [k, [...v]]));
  }
  // Spel-motor/reclame-adressen in spellen (Unity, Amplitude, ...) horen bij het spel dat speelt, zie assignGameSdk in lib/companion.ts.
  const gameOf = new Map<string, string>(); // apparaat|tijdstip -> site van het spel
  {
    const byDev = new Map<string, { t: number; game?: string; nav?: boolean; sdk?: boolean; navSdk?: boolean; other?: boolean }[]>();
    for (const r of body) {
      const host = extractHost(r[hostCol] ?? "");
      const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
      if (!t) continue;
      const info = classify(host!);
      const sdk = GAME_SDK.test(host!);
      const navSdk = NAV_SDK.test(host!);
      // Spellen en navigatie (Waze): tijdens gebruik vooral meetmeldingen, zie lib/companion.ts.
      const nav = NAV_APPS.has(info.site);
      const game = !sdk && !navSdk && info.main && !info.bg && (/ \(spel\)$/.test(info.name) || nav) && info.site !== "unity3d.com" ? info.site : undefined;
      const other = !sdk && !navSdk && !game && info.main && !info.bg && !info.flag && !isPlainSite(info);
      if (!sdk && !navSdk && !game && !other) continue;
      const dev = deviceMap[idOf(r)];
      (byDev.get(dev) ?? byDev.set(dev, []).get(dev)!).push({ t, game, nav: !!game && nav, sdk, navSdk, other });
    }
    for (const [dev, ev] of byDev) for (const [t, site] of assignGameSdk(ev, HEARTBEAT_GAP)) gameOf.set(dev + "|" + t, site);
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
    // Leren over meerdere dagen alleen bij de volledige berekening; bij het snelle herberekenen komt het uit `known`.
    learnedHelpers = opts.known ? [] : [...loadedWith(ev)];
    return new Set([...learnedHelpers, ...geldig(GELEERD.helpers, Date.now()), ...(opts.known?.helpers ?? [])]);
  })();
  // Doorverwijs-adressen (een cloud-adres waar een app naar doorverwijst) horen bij die app, in een keten vanaf echt verkeer
  // van de app (hooguit GAP ertussen), zie followers() in lib/companion.ts.
  const followOf = new Map<string, string>(); // apparaat|adres -> site
  let learnedFollowers: string[] = [];
  let partsAll: string[] = []; // sites die (over alle dagen) altijd als onderdeel van een andere pagina meekomen
  const heartbeat = new Set<string>(); // apparaat|site van apps met een doorverwijs-adres (vaste melding tijdens gebruik)
  const followIn = new Set<string>(); // apparaat|adres|tijdstip dat bij de app hoort
  {
    const ev: Parameters<typeof followers>[0] = [];
    for (const r of body) {
      const host = extractHost(r[hostCol] ?? "");
      const t = host && tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
      if (!t) continue;
      const info = classify(host!);
      if (info.flag) continue;
      ev.push({ t, dev: deviceMap[idOf(r)], host: host!, site: info.site, app: info.main && !info.bg && !isPlainSite(info), cloud: info.bg || !info.main });
    }
    if (!opts.known) for (const [k, site] of followers(ev)) followOf.set(k, site);
    learnedFollowers = [...followOf].map(([k, site]) => k + "|" + site);
    // Eerder geleerd (blijft ook als het logboek is leeggemaakt): apparaat|adres|site.
    for (const k of [...geldig(GELEERD.followers, Date.now()), ...(opts.known?.followers ?? [])]) { const i = k.lastIndexOf("|"); if (!followOf.has(k.slice(0, i))) followOf.set(k.slice(0, i), k.slice(i + 1)); }
    for (const k of opts.known?.heartbeat ?? []) heartbeat.add(k);
    if (followOf.size) {
      const appT = new Map<string, number[]>(), folT = new Map<string, number[]>();
      for (const e of ev) {
        if (e.app) (appT.get(e.dev + "|" + e.site) ?? appT.set(e.dev + "|" + e.site, []).get(e.dev + "|" + e.site)!).push(e.t);
        const site = followOf.get(e.dev + "|" + e.host);
        if (site) (folT.get(e.dev + "|" + e.host) ?? folT.set(e.dev + "|" + e.host, []).get(e.dev + "|" + e.host)!).push(e.t);
      }
      for (const [k, ts] of folT) {
        const dev = k.slice(0, k.indexOf("|"));
        const own = (appT.get(dev + "|" + followOf.get(k)) ?? []).sort((a, b) => a - b);
        for (const t of chainTimes(own, ts, HEARTBEAT_GAP, 0)) followIn.add(k + "|" + t);
        // Een vaste melding (heartbeat): het doorverwijs-adres komt vaak los terug, zonder het eigen adres van de app erbij
        // (Toca Boca: 608 keer, waarvan 361 los). Een CDN dat alleen samen met de app plaatjes laadt (Hue, Spotify) niet.
        let alone = 0;
        for (const t of ts) { let i = own.length - 1; let lo = 0; while (lo < i) { const m = (lo + i) >> 1; if (own[m] < t - 1_000) lo = m + 1; else i = m; } if (!(own[lo] !== undefined && Math.abs(own[lo] - t) <= 1_000)) alone++; }
        if (!opts.known && alone >= 20 && alone >= 0.5 * ts.length) heartbeat.add(dev + "|" + followOf.get(k));
      }
    }
  }
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
    const gsite = t ? gameOf.get(dev + "|" + t) : undefined;
    if (gsite && (GAME_SDK.test(host) || NAV_SDK.test(host))) info = classify(gsite);
    const fol = t ? followOf.get(dev + "|" + host) : undefined;
    if (fol && followIn.has(dev + "|" + host + "|" + t)) info = classify(fol);
    if (t && igShared.has(dev + "|" + t + "|" + host)) info = classify("instagram.com");
    // Op een tv is Amazon-verkeer (api.amazon.com, a2z.com, plaatjes) altijd de Prime Video-app: een tv heeft geen Amazon-winkel
    // (19 okt: "Amazon 2 u 8 min" naast losse Prime Video-stukjes).
    if (info.site === "amazon.com" && /^(Apple TV|TV)( \d+)?$/.test(dev)) info = { ...classify("primevideo.com"), bg: info.bg };
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
      (devBase.get(dev) ?? devBase.set(dev, []).get(dev)!).push(blocked ? { t, b: baseDomain(host), bl: 1 } : { t, b: baseDomain(host) });
      if (isEspHost(host)) (devEsp.get(dev) ?? devEsp.set(dev, []).get(dev)!).push(t);
      if (!blocked && isClickHost(host)) (devClick.get(dev) ?? devClick.set(dev, []).get(dev)!).push(t);
      if (isYouTubeAppHost(host)) (devYtApp.get(dev) ?? devYtApp.set(dev, []).get(dev)!).push(t);
      if (!blocked && /^(www\.google\.[a-z.]+|www\.bing\.com|duckduckgo\.com|www\.ecosia\.org)$/.test(host)) (devSearch.get(dev) ?? devSearch.set(dev, []).get(dev)!).push(t);
      else if (isMailClientHost(host)) (devMailClient.get(dev) ?? devMailClient.set(dev, []).get(dev)!).push(t);
    }
    if (blockedAdult && d === today) devBlockedToday.set(dev, (devBlockedToday.get(dev) ?? 0) + 1);
    if (SHOP_ASSET.test(host)) (devShop.get(dev) ?? devShop.set(dev, []).get(dev)!).push(t);
    if (isQuietHost(host)) continue; // verbinding openhouden: geen bezoek, geen sessie
    if (t && fbPixel.has(dev + "|" + t + "|" + host)) continue; // Facebook-pixel van de website ervoor: geen Facebook-gebruik

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
    // Apps met een vaste melding via een doorverwijs-adres (Toca Boca: elke 2 tot 10 minuten): stukjes met hooguit HEARTBEAT_GAP
    // ertussen zijn één keer spelen.
    const joinGap = NAV_APPS.has(g.site) ? NAV_GAP : heartbeat.has(g.dev + "|" + g.site) ? HEARTBEAT_GAP : 0;
    if (joinGap && sessions.length > 1) {
      const out: Session[] = [];
      for (const x of [...sessions].sort((a, b) => a.s - b.s)) {
        const l = out[out.length - 1];
        if (l && x.s - l.e <= joinGap) { l.e = Math.max(l.e, x.e); l.n = (l.n ?? 0) + (x.n ?? 0); } else out.push({ ...x });
      }
      sessions = out.sort((a, b) => b.e - a.e);
    }
    // Tellen in momenten per site: alles van dezelfde site binnen 1,5 s (www + plaatjes + script) is één moment.
    for (const x of sessions) x.n = moments(all.filter((t) => t >= x.s && t <= x.e));
    // Spellen en leer-apps halen bij het opstarten in één moment 3+ eigen adressen op (TutoTOONS: apps., tutoclub., tutopulse.);
    // daarna speelt het spel soms minuten zonder verkeer. Zo'n opstart is echt geopend (19 okt: 19 van 21 al getoond, 2 gemist).
    // Ook apps die nooit op de achtergrond iets opvragen: Buienradar vraagt bij elke opstart 8-10 eigen adressen tegelijk op, altijd
    // samen met het toestemmingsscherm en advertenties (30 van 30 keer, 20 okt): even naar de radar kijken (1-3 s) is echt gebruik.
    if (/\((spel|leren)\)$/.test(g.name ?? "") || START_BURST.has(g.site)) {
      const sh = siteHosts.get(gkey) ?? [];
      for (const x of sessions) if (sh.some((h) => h.t >= x.s && h.t <= x.e && new Set(sh.filter((o) => o.t >= h.t && o.t - h.t <= MOMENT).map((o) => o.host)).size >= 3)) x.gs = 1;
    }
    // Apps met veel achtergrondverkeer (Facebook, Instagram, WhatsApp, ...): tel hoe vaak er echt inhoud laadde, en meet de duur
    // alleen van de eerste tot de laatste keer inhoud; verversen op de achtergrond rekt de duur dan niet op.
    if (FG_RULES[g.site]) {
      const real = [...(fgTimes.get(gkey) ?? []), ...(mediaTimes.get(gkey) ?? [])];
      // Kijkmeldingen (zie KEEP_ALIVE) die aansluiten op echte inhoud: tellen als inhoud.
      // Niet binnen 30 s van de inhoud zelf: dat is gewoon het laden van de pagina (of een ingebouwde video op een andere site).
      const keep = (siteHosts.get(gkey) ?? []).filter((h) => isKeepAlive(g.site, h.host) && !real.some((t) => Math.abs(t - h.t) <= 30_000)).map((h) => h.t);
      // YouTube: kijkmeldingen tellen als inhoud. WhatsApp: de kale naam verlengt alleen een sessie die al zeker gebruik was.
      const keepCounts = g.site === "youtube.com";
      const keepCh = keep.length && real.length ? chainTimes(real, keep, GAP, 0) : new Set<number>();
      if (keepCounts && keepCh.size) { real.push(...keepCh); (fgTimes.get(gkey) ?? fgTimes.set(gkey, []).get(gkey)!).push(...keepCh); }
      for (const x of sessions) {
        const inX = real.filter((t) => t >= x.s && t <= x.e);
        // Inhoud-momenten, of het aantal verschillende inhoud-adressen als dat meer is: een app die opent haalt in één
        // moment instellingen én plaatjes op (WhatsApp: graph + static); achtergrond raakt hooguit één zo'n adres. Zie OPEN_BURST.
        const sh = OPEN_BURST.has(g.site) ? (siteHosts.get(gkey) ?? []).filter((h) => h.t >= x.s && h.t <= x.e) : [];
        // Alleen als de app zelf opstart (de kale naam, bv. whatsapp.com): een binnenkomend bericht met foto haalt ook static. en
        // media. tegelijk op (g. → static./media. → api.), zonder de kale naam (18 okt, 22 keer onterecht als openen geteld).
        const opened = sh.some((h) => OPEN_BURST.has(h.host));
        const fgSet = new Set(opened ? sh.filter((h) => fgHit(g.site, h.host)).map((h) => h.host) : []);
        // De volledige opstart van de app (zie OPEN_START) telt ook als inhoud-adres: graph. ligt dan soms nog in het geheugen.
        if (sh.some((h) => OPEN_START.every((re) => sh.some((o) => re.test(o.host) && Math.abs(o.t - h.t) <= 5_000)))) fgSet.add("(opstart)");
        const fgHosts = fgSet.size;
        // De kale naam (whatsapp.com) = de app gaat open; komt nooit bij een binnenkomend bericht (18 okt, bevestigd door de eigenaar
        // terwijl hij WhatsApp gebruikte: chat.cdn → whatsapp.com → mmx-ds, zonder foto's). Telt dan als zeker gebruik.
        x.f = Math.max(moments((fgTimes.get(gkey) ?? []).filter((t) => t >= x.s && t <= x.e)), fgHosts, opened ? 2 : 0);
        if (inX.length) { x.s = inX.reduce((a, b) => Math.min(a, b)); x.e = inX.reduce((a, b) => Math.max(a, b)); }
        if (!keepCounts && isHuman(x)) for (const t of [...keepCh].sort((a, b) => a - b)) if (t > x.e && t <= x.e + GAP) x.e = t;
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
      const shopLoaded = (x: Session) => (devShop.get(g.dev) ?? []).some((t) => t >= x.s && t <= x.e + 3_000);
      // Laadt er in de 8 s erna niets nieuws mee (geen lettertype, script, teller of plaatje van een ander domein dan wat de app al
      // gebruikte; een trage pagina haalt zijn onderdelen soms pas na 5-6 s; ook een door NextDNS geblokkeerde teller telt, want
      // die bewijst dat de pagina draaide), dan is de pagina nooit getoond: de app vroeg alleen het adres op voor een voorvertoning
      // of advertentie. Een link die echt opent (ook in de browser in de app) haalt meteen onderdelen op (22 okt: starlink.com,
      // ftmo.com, jobescape.me in X).
      const own = baseDomain(g.site);
      const nothingLoaded = (x: Session) => {
        const near = devBase.get(g.dev) ?? [];
        const before = new Set(near.filter((r) => r.t >= x.s - 60_000 && r.t < x.s - 500).map((r) => r.b));
        return !near.some((r) => r.t >= x.s - 500 && r.t <= x.s + 8_000 && r.b !== own && !before.has(r.b));
      };
      if (cand.length <= 4) for (const x of cand) { x.pv = 1; if (hostsIn(x) < 2 && inSocial(x) && !shopLoaded(x)) { if (nothingLoaded(x)) { delete x.pv; x.res = 1; x.pf = 1; } else { x.uz = 1; x.uw = "reclame"; } } }
      // Laadt de site die dag vaker dan 4 keer los (open tabblad dat Safari herlaadt), dan is een inlog-adres in zo'n los moment
      // geen inloggen maar een vast onderdeel van de pagina (19 okt leukerecepten.nl: mijn. bij elke pagina, ook bij herladen).
      else for (const x of cand) delete x.lg;
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
    // Een adres dat op dit apparaat verder alleen uit mails laadt (minstens 3 keer, nooit los bezocht) en waarbij in de eerste 3 s
    // weinig anders laadt (een echte pagina haalt meteen onderdelen van 9-14 andere domeinen: toestemming, lettertypes, tellers),
    // is een plaatje uit een mail, ook als er net gezocht leek (20 okt 19:12: 4kmedia-market.com uit spam, eigenaar: "niet gebruikt").
    const pendingClick = new Set(clickVisits.map((v) => v.x)); // klik-bezoeken worden hieronder pas mail of klik
    const mailish = (y: Session) => !!y.ml || pendingClick.has(y);
    const bySite = new Map<string, Session[]>(); // alle sessies van een site op een apparaat, over alle dagen
    for (const g of groups.values()) (bySite.get(g.dev + "|" + g.site) ?? bySite.set(g.dev + "|" + g.site, []).get(g.dev + "|" + g.site)!).push(...g.ss);
    for (const g of groups.values()) {
      if (!g.main || g.bg || g.flag || !isPlainSite(g)) continue;
      for (const x of g.ss) {
        if (!x.ml || !(x.mh ?? 0)) continue;
        const others = (bySite.get(g.dev + "|" + g.site) ?? []).filter((y) => y !== x);
        const loaded = new Set((devBase.get(g.dev) ?? []).filter((r) => !r.bl && r.t >= x.s && r.t <= x.s + 3_000).map((r) => r.b)).size;
        if (loaded < 6 && others.filter(mailish).length >= 3 && !others.some((y) => !mailish(y) && isHuman(y))) continue;
        const q = (devSearch.get(g.dev) ?? []).filter((t) => t >= x.s - 60_000 && t <= x.s + 1_000);
        if (q.length && (searchSes.get(g.dev) ?? []).some((y) => q.some((t) => t >= y.s - 60_000 && t <= y.e + 60_000))) { delete x.ml; x.ck = 1; }
      }
    }
    // Vanuit een mail naar de site zelf (www.) en daar laadt meteen een hele pagina (onderdelen van 9+ andere domeinen binnen 3 s):
    // op een link getikt, ook als het klik-adres van het merk zelf is en niet herkend wordt (24 okt 11:39 www.email.happinez.nl →
    // www.happinez.nl). Een geopende mail laadt alleen plaatjes en tellers: hooguit een paar domeinen.
    for (const [gkey, g] of groups) {
      if (!g.main || g.bg || g.flag || !isPlainSite(g)) continue;
      const mt = mainTimes.get(gkey) ?? [];
      for (const x of g.ss) {
        if (!mailish(x) || !(x.mh ?? 0)) continue;
        const t0 = mt.filter((t) => t >= x.s && t <= x.e).sort((a, b) => a - b)[0];
        if (t0 === undefined) continue;
        const loaded = new Set((devBase.get(g.dev) ?? []).filter((r) => !r.bl && r.t >= t0 && r.t <= t0 + 3_000 && r.b !== g.site).map((r) => r.b)).size;
        // Niet als de Mail-app op dat moment nieuwsbrieven ophaalt (veel mail-adressen tegelijk lijkt ook op veel domeinen).
        const espNear = (devEsp.get(g.dev) ?? []).some((t) => t >= t0 - 5_000 && t <= t0 + 3_000) || (devMailClient.get(g.dev) ?? []).some((t) => t >= t0 - 5_000 && t <= t0 + 3_000);
        if (loaded >= 9 && !espNear) { delete x.ml; x.ck = 1; pageLoaded.add(x); }
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
      // Hoort het klik-adres zelf bij één van die sites (url861.xenos.nl → xenos.nl: de sessie begint met de klik), dan is dat de
      // geklikte site; de andere laadde toevallig tegelijk (19 okt: Safari herlaadde leukerecepten.nl in dezelfde seconde).
      // Alleen bij één losse klik: opent de Mail-app veel nieuwsbrieven tegelijk, dan staan er tientallen klik-adressen in dezelfde
      // seconden (Lidl, Kruidvat, ...) en is niets geklikt. Xenos 19 okt: één klik-adres, 2 nieuwsbrief-adressen.
      const alone = (v: (typeof vs)[number]) => (devClick.get(v.g.dev) ?? []).filter((t) => Math.abs(t - v.click) <= 3_000).length === 1 && (devEsp.get(v.g.dev) ?? []).filter((t) => Math.abs(t - v.click) <= 3_000).length <= 3;
      const own = new Set(vs.filter((v) => v.x.s === v.click && alone(v)).map((v) => v.g.site));
      const single = new Set(vs.map((v) => v.g.site)).size === 1;
      for (const { g, x } of vs) if (single || pageLoaded.has(x) || (own.size === 1 && own.has(g.site))) x.ck = 1; else { x.ml = 1; delete x.pv; }
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
      // De pagina met de speler: de laatst geopende. Een zoekmachine die binnen 5 s na een andere pagina opduikt, is een teller
      // die met die pagina meelaadt (Google Ads op een cursussite), niet de pagina zelf (20 okt 11:44: yogavideo telde als Google).
      const cands = on.filter((v) => v.x.s <= x.s + 60_000);
      const tracker = (v: { g: Group; x: Session }) => SEARCH.has(v.g.site) && cands.some((w) => !SEARCH.has(w.g.site) && Math.abs(w.x.s - v.x.s) <= 5_000);
      const host = cands.filter((v) => !tracker(v)).sort((a, b) => b.x.s - a.x.s)[0];
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
    // Hoeveel andere hoofddomeinen vroeg dit apparaat op in de 1,5 s vóór t (een pagina die nog aan het laden is)?
    const sortedBase = new Map<string, { t: number; b: string }[]>();
    const busyBefore = (dev: string, t: number, site: string) => {
      let ev = sortedBase.get(dev);
      if (!ev) sortedBase.set(dev, (ev = [...(devBase.get(dev) ?? [])].sort((a, b) => a.t - b.t)));
      let lo = 0, hi = ev.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ev[mid].t < t - 1_500) lo = mid + 1; else hi = mid; }
      const seen = new Set<string>();
      for (let i = lo; i < ev.length && ev[i].t < t; i++) if (ev[i].b !== site) seen.add(ev[i].b);
      return seen.size;
    };
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
        if (pg.some((p) => p.site !== g.site && x.s > p.t && x.s - p.t <= 3_000)) { delete x.pv; delete x.ck; x.emb = 1; continue; }
        // Ook later (tot 15 s), zolang die pagina nog volop aan het laden is: in de 1,5 s ervoor vroeg het apparaat al 3+ andere
        // domeinen op (lettertypes, tellers, winkel-onderdelen). Een echte nieuwe site komt na een rustige pagina, en laadt zijn
        // onderdelen pas na zichzelf. (24 okt: app.varify.io, chat.stackflowaisolutions.com en placehold.co in webwinkels.)
        const lead = pg.some((p) => p.site !== g.site && x.s > p.t && x.s - p.t <= 15_000);
        if (lead && busyBefore(g.dev, x.s, g.site) >= 3) { delete x.pv; delete x.ck; x.emb = 1; }
      }
    }
    // Een site die elke keer (minstens 2 momenten) tegelijk met een pagina van een andere site opduikt (hooguit 5 s erna), en nooit
    // los, is een onderdeel van die sites: de maker van de website, een hulp- of maatknop, een zustersite in de voettekst.
    // Ook als het een www.-adres is. De pagina die hem laadt blijft altijd staan (twee sites die alleen samen voorkomen: allebei).
    let part: Set<string>;
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
    // (Over alle dagen bepaald; bij het snelle herberekenen van de laatste uren komt het uit `known`.)
    part = opts.known ? new Set((opts.known.parts ?? []).filter((site) => cand.has(site))) : new Set([...cand].filter(([site, xs]) => xs.reduce((n, c) => n + c.m, 0) >= 2 && !loose.has(site)).map(([site]) => site));
    partsAll = opts.known ? opts.known.parts ?? [] : [...part];
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

  // Tabbladen opnieuw geladen: komt de browser weer in beeld, dan ververst hij alle open tabbladen tegelijk. Vier of meer
  // verschillende websites die binnen 20 s beginnen: wie daarvan maar even (hooguit 2 momenten, 5 s) iets laadde, is zo'n
  // tabblad en geen bezoek. Een site waar daarna echt verder gekeken wordt, blijft staan. (Zondag 11 okt 17:09: tien sites in 17 s.)
  // Zelfde merk, andere extensie (ravensburger.nl en ravensburger.cloud) kort na elkaar: onderdeel van de eerste, één bezoek.
  {
    const byDev = new Map<string, { g: Group; x: Session }[]>();
    for (const [, g] of groups) {
      if (!g.main || g.bg || g.flag || g.susp || !isPlainSite(g)) continue;
      // Ook een alleen-aangeklopte pagina (pf) telt mee als tabblad dat de browser tegelijk ververste.
      for (const x of g.ss) if ((isHuman(x) && !x.lg) || x.pf) (byDev.get(g.dev) ?? byDev.set(g.dev, []).get(g.dev)!).push({ g, x });
    }
    const brand = (site: string) => site.split(".")[0];
    for (const [, l] of byDev) {
      l.sort((a, b) => a.x.s - b.x.s);
      for (const a of l) {
        const win = l.filter((b) => b.x.s >= a.x.s && b.x.s - a.x.s <= 20_000);
        if (new Set(win.map((b) => b.g.site)).size < 4) continue;
        for (const b of win) if ((b.x.n ?? 0) <= 2 && b.x.e - b.x.s <= 5_000) b.x.rl = 1;
      }
      for (const b of l) {
        if (b.x.e - b.x.s > 60_000) continue;
        const a = l.find((y) => y.g.site !== b.g.site && brand(y.g.site) === brand(b.g.site) && brand(b.g.site).length >= 4 && y.x.s <= b.x.s && b.x.s - y.x.s <= 30_000);
        if (a) { delete b.x.pv; delete b.x.ck; delete b.x.uz; b.x.emb = 1; }
      }
    }
  }

  // App gestart, maar geen inhoud gezien: Instagram vraagt bij het openen www.instagram.com op. Gemeten over alle dagen: 85 keer,
  // nooit 's nachts (ook niet bij de nachtelijke achtergrond-starts met test-gateway/i.instagram). Vaak laadt er daarna geen foto
  // (uit het geheugen getoond, of meteen weer weg), dus geen bewijs van kijken: tonen als onzeker (17 okt 14:50, Shazam → Instagram).
  for (const g of groups.values()) {
    if (g.site !== "instagram.com") continue;
    const hs = siteHosts.get(g.d + "|" + g.dev + "|" + g.site) ?? [];
    for (const x of g.ss) {
      if (isHuman(x) || x.emb || x.res || x.rf || x.rl) continue;
      if (hs.some((y) => y.host === "www.instagram.com" && y.t >= x.s - MOMENT && y.t <= x.e + MOMENT)) { x.ao = 1; x.uz = 1; x.uw = "opstart"; }
    }
  }

  // Apps die alleen even starten (een paar seconden, telkens als eerste bij het ontgrendelen 's ochtends) en daarna niets: kan
  // ook vanzelf verversen (widget, dagelijkse quote). Gemeten: Meditopia 9 ochtenden, steeds 5-6 s, nooit langer. Onzeker tonen.
  for (const g of groups.values()) if (START_ONLY.has(g.site)) for (const x of g.ss) if (x.e - x.s < 60_000 && isHuman(x)) { x.ao = 1; x.uz = 1; x.uw = "opstart"; }

  // "Altijd tonen"-apps die pas tellen als ze echt opengaan (eufy): sessies met de vaste start-adressen merken.
  for (const g of groups.values()) {
    const re = ALWAYS_SHOW_OPEN[g.site];
    if (!re) continue;
    const hs = siteHosts.get(g.d + "|" + g.dev + "|" + g.site) ?? [];
    for (const x of g.ss) if (hs.some((y) => re.test(y.host) && y.t >= x.s - MOMENT && y.t <= x.e + MOMENT)) x.op = 1;
  }

  const SDK_IN_APP = /^(star|star-mini)(\.fallback)?\.c10r\.facebook\.com$|^graph\.facebook\.com$|^connect\.facebook\.net$|^ep\d\.facebook\.com$/;
  // Telefoon wordt ontgrendeld of komt op wifi: veel apps verversen in dezelfde seconden (Instagram, Facebook, WhatsApp, widgets).
  // Een korte app-rij (hooguit 3 momenten, < 1 min) die begint in dezelfde 3 s als minstens 2 andere apps die zelf niet echt
  // gebruikt werden: of die app ook echt geopend is, ziet DNS niet. Tonen als onzeker, niet als feit (17 okt 07:24 WhatsApp).
  {
    const named = [...groups.values()].filter((g) => g.main && !g.bg && !g.flag && !isPlainSite(g));
    for (const g of named) {
      for (const x of g.ss) {
        if (!isHuman(x) || (x.n ?? 0) > 3 || x.e - x.s >= 60_000 || x.lg) continue;
        // Andere apps die in dezelfde 3 s zelf iets opvragen. Meetmodules die ín een app zitten (de Facebook-module, reclame- en
        // spelnetwerken) tellen niet: Vinted die opstart vraagt ook star.c10r.facebook.com en applovin op.
        const wake = named.filter((h) => h !== g && h.dev === g.dev && (siteHosts.get(h.d + "|" + h.dev + "|" + h.site) ?? []).some((y) => Math.abs(y.t - x.s) <= 3_000 && !GAME_SDK.test(y.host) && !SDK_IN_APP.test(y.host)));
        if (wake.length < 2) continue;
        const used = wake.some((h) => h.ss.some((y) => isHuman(y) && y.s <= x.s + 60_000 && y.e >= x.s - 60_000));
        if (!used) { x.uz = 1; x.uw = "ontgrendel"; }
      }
    }
  }

  // Google: één moment met alleen www.google.nl/.com en niets van een zoekpagina (resultaten, plaatjes, zoekbalk) is geen
  // zoekopdracht, maar de meetcode van een andere site (Squla laadt Google Analytics) of een app die opstart. Over alle dagen:
  // alle 24 zulke losse Google-rijen vielen samen met een app of met meetcode van een andere site, geen enkele met een zoekpagina.
  for (const [gkey, g] of groups) {
    if (g.site !== "google.com" || !g.main || g.flag) continue;
    for (const x of g.ss) {
      if ((x.n ?? 0) > 1 || x.lg || x.ck) continue;
      const hs = (siteHosts.get(gkey) ?? []).filter((h) => h.t >= x.s - 1_500 && h.t <= x.e + 1_500);
      if (hs.length && hs.every((h) => /^www\.google\.[a-z.]+$/.test(h.host))) { delete x.pv; delete x.uz; x.emb = 1; }
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
  const autoNow = todayOnly || opts.known ? [] : autoRefreshing(singles);
  const auto = [...new Set([...autoNow, ...geldig(GELEERD.auto, Date.now()), ...(opts.known?.auto ?? [])])];
  if (auto.length) {
    const set = new Set(auto);
    for (const g of groups.values()) if (set.has(g.dev + "|" + g.site)) for (const x of g.ss) delete x.pv;
    // Een verversing die toevallig vlak na een zoekopdracht valt, is geen getikt zoekresultaat: alleen de kale naam en www.
    // (18 okt 09:19: onsoranje26.nl en voetbalkrant.com verversen zich ~15 keer per dag samen; 4 keer leek het een klik).
    for (const g of groups.values()) {
      if (!set.has(g.dev + "|" + g.site)) continue;
      const hs = siteHosts.get(g.d + "|" + g.dev + "|" + g.site) ?? [];
      const bare = (h: string) => h === g.site || h === "www." + g.site;
      for (const x of g.ss) if (x.ck && !x.lg && hs.filter((y) => y.t >= x.s - MOMENT && y.t <= x.e + MOMENT).every((y) => bare(y.host))) { delete x.ck; x.rf = 1; }
    }
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
    learned: todayOnly ? undefined : { auto: autoNow, helpers: learnedHelpers, followers: learnedFollowers, fg: learnedFgList },
    fgLearned: fgLearnedAll, // live: dezelfde geleerde bewijs-adressen
    parts: todayOnly ? undefined : partsAll, // voor het snelle herberekenen (lib/recent.ts)
    heartbeat: todayOnly ? undefined : [...heartbeat],
    followers: Object.fromEntries(followOf), // live: dezelfde doorverwijs-adressen (apparaat|adres -> site) // wat nu uit de logboeken blijkt (scripts/leer.ts legt het vast)
    // Alleen het laatste stuk van vandaag opgehaald: vanaf dit moment klopt het, daarvoor komt nog.
    partial: !todayOnly ? undefined : cutAt ? Math.max(cutAt, hours > 0 ? windowStart(hours) : 0) : hours > 0 && windowStart(hours) > windowStart(0) + 60_000 ? windowStart(hours) : undefined,
    meta: { columns: header, statuses: Object.fromEntries(statuses), reasons: [...reasonSamples] }, // om de kolommen te controleren
  };
  return ({ status: 200, body: result });
}
