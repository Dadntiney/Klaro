"use client";

import { labelDevices } from "@/lib/names";
import { clusterSessions, extendAll, extendSessions, minutes, totalMinutes, type Session } from "@/lib/sessions";
import { isSilent } from "@/lib/devstats";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Group {
  d: string;
  dev: string;
  site: string;
  name: string;
  icon: string;
  last: number;
  n: number;
  bg: boolean;
  adult?: boolean;
  main?: boolean;
  flag?: string;
  ts?: number[];
  ss?: Session[];
  mins?: number;
  cat?: string;
  bl?: number;
  isNew?: boolean;
  flash?: number;
}
interface Event {
  t: number;
  devId: string;
  type: string;
  site: string;
  name: string;
  icon: string;
  bg: boolean;
  adult?: boolean;
  main?: boolean;
  flag?: string;
  cat?: string;
  blocked?: boolean;
}
interface Device {
  name: string;
  n: number;
  last?: number; // laatste verzoek (alle verkeer)
  gap?: number; // normale pauze overdag (ms)
  days?: number; // dagen met activiteit
  ss?: Session[]; // sessies van vandaag (zichtbaar verkeer)
  avg?: number; // gemiddeld aantal actieve minuten op eerdere dagen
  blocked?: number; // geblokkeerde 18+/dating-pogingen vandaag
}

/** Zoekmachines en beeldzoekers: bij een 18+-adres kort erna/ervoor markeren we ook deze regel. */
const isSearch = (site: string) => /^google\.[a-z.]+$/.test(site) || ["bing.com", "duckduckgo.com", "ecosia.org", "yahoo.com", "startpage.com", "qwant.com", "yandex.com", "brave.com", "pinterest.com", "pinterest.nl"].includes(site);

const tz = "Europe/Amsterdam";
const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: tz });
const timeSecFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
const dayLabelFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: tz });

const sumMin = (ss: Session[]) => ss.reduce((n, x) => n + minutes(x), 0);
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz });
const hourOf = (t: number) => parseInt(hourFmt.format(t), 10) % 24;
const isNight = (t: number) => hourOf(t) >= 23 || hourOf(t) < 6;

/** 45 -> "45 min", 75 -> "1 u 15 min". */
function dur(min: number) {
  return min >= 60 ? `${Math.floor(min / 60)} u${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`;
}

/**
 * Rustige kleur per apparaat (soort bepaalt de tint, een nummer de helderheid). Bewust geen rood, oranje, groen of felblauw:
 * die kleuren betekenen waarschuwing, live of nieuw.
 */
function devColor(name: string): string {
  const m = name.match(/^(.*?)(?: (\d+))?$/);
  const type = (m?.[1] ?? name).toLowerCase();
  const n = Number(m?.[2] ?? 1);
  const hue = type.includes("iphone") ? 262 : type.includes("ipad") ? 172 : type.includes("mac") ? 292 : type.includes("tv") ? 195 : type.includes("android") ? 330 : type.includes("windows") || type.includes("laptop") ? 225 : 30;
  const sat = hue === 30 ? 8 : 55;
  const light = [46, 62, 33, 72][(n - 1) % 4];
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function dayLabel(d: string) {
  if (d === "onbekend") return "Datum onbekend";
  const today = Date.now();
  if (d === dayKeyFmt.format(today)) return "Vandaag";
  if (d === dayKeyFmt.format(today - 86400_000)) return "Gisteren";
  const label = dayLabelFmt.format(new Date(d + "T12:00:00Z"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Favicon, of niets (een leeg vakje voor de uitlijning) als de site er geen heeft. */
/** Twee korte tonen (660 en 880 Hz) als WAV, zodat er geen geluidsbestand nodig is. */
function beepDataUri(urgent = false): string {
  const rate = 22050;
  const tone = (f: number, sec: number) =>
    Array.from({ length: Math.floor(rate * sec) }, (_, i) => {
      const t = i / rate;
      const env = Math.min(1, t / 0.01, (sec - t) / 0.03); // korte in- en uitfade tegen klikjes
      return Math.sin(2 * Math.PI * f * t) * 0.6 * Math.max(0, env);
    });
  const gap = () => new Array(Math.floor(rate * 0.04)).fill(0);
  // Gewoon: twee tonen omhoog. Alarm (rood): drie snelle, hogere tonen.
  const samples = urgent ? [...tone(988, 0.12), ...gap(), ...tone(988, 0.12), ...gap(), ...tone(1319, 0.22)] : [...tone(660, 0.14), ...gap(), ...tone(880, 0.18)];
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(x * 32767), true));
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(bin);
}

function Favicon({ domain }: { domain: string }) {
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  if (state === "none") return <span className="fav" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={"fav" + (state === "ok" ? " ok" : "")}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      // Heeft een site geen icoon, dan geeft Google een standaard wereldbolletje van 16x16: dat tonen we niet.
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      onLoad={(e) => setState(e.currentTarget.naturalWidth > 16 ? "ok" : "none")}
      onError={() => setState("none")}
    />
  );
}

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [device, setDevice] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moreKey, setMoreKey] = useState<string | null>(null);
  const sound = useRef<HTMLAudioElement | null>(null);
  const alarm = useRef<HTMLAudioElement | null>(null);
  const [tick, setTick] = useState(0); // elke minuut: "ongewoon stil" opnieuw beoordelen
  const deviceRef = useRef<string | null>(null);
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  const [live, setLive] = useState<"ok" | "fail">("ok");
  const [liveError, setLiveError] = useState("");
  const lastSeen = useRef(0);
  const deviceMap = useRef<Record<string, string>>({});

  useEffect(() => {
    // 1) Snel: de nieuwste verzoeken direct tonen. 2) Volledige geschiedenis op de achtergrond.
    fetch("/api/nextdns/live?since=0")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { events: Event[] } | null) => {
        if (!data || fullRef.current || !data.events.length) return;
        const map = labelDevices(data.events.map((e) => ({ id: e.devId, type: e.type })));
        const byKey = new Map<string, Group>();
        const counts = new Map<string, number>();
        for (const e of data.events) {
          const dev = map[e.devId];
          const d = dayKeyFmt.format(e.t);
          const key = `${d}|${dev}|${e.site}`;
          const g = byKey.get(key);
          if (g) {
            g.n++;
            g.last = Math.max(g.last, e.t);
            g.main = g.main || e.main;
            g.ts = [...(g.ts ?? []), e.t].sort((a, b) => b - a).slice(0, 8);
            g.ss = clusterSessions(g.ts);
            g.mins = totalMinutes(g.ts);
          } else byKey.set(key, { d, dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, main: e.main, flag: e.flag, ts: [e.t], ss: [{ s: e.t, e: e.t }], mins: 0, cat: e.cat, bl: e.blocked ? 1 : 0, isNew: false });
          counts.set(dev, (counts.get(dev) ?? 0) + 1);
        }
        deviceMap.current = map;
        lastSeen.current = Math.max(...data.events.map((e) => e.t));
        setGroups([...byKey.values()]);
        setDevices([...counts].map(([name, n]) => ({ name, n, last: Math.max(...data.events.filter((e) => map[e.devId] === name).map((e) => e.t)) })));
        setTotal(data.events.length);
        setUpdated(new Date());
        setState((s) => (s === "loading" ? "ready" : s));
      })
      .catch(() => {});

    fetch("/api/nextdns")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        fullRef.current = true;
        setGroups(data.groups);
        setDevices(data.devices);
        setTotal(data.total);
        deviceMap.current = data.deviceMap ?? {};
        lastSeen.current = Math.max(0, ...(data.groups as Group[]).map((g) => g.last));
        setUpdated(new Date());
        setFull(true);
        setState("ready");
      })
      .catch((e: Error) => {
        if (fullRef.current) return;
        setError(e.message);
        setState((s) => (s === "ready" ? s : "error"));
        setFull(true);
      });
  }, []);

  useEffect(() => { deviceRef.current = device; }, [device]);

  // Geluid staat altijd aan. Een gewoon <audio>-element (met een zelfgemaakte piep) is op iPhone betrouwbaarder dan
  // Web Audio: het wordt niet gedempt door de stilteschakelaar en blijft na één ontgrendeling bruikbaar.
  const unlocked = useRef(false);
  useEffect(() => {
    try {
      // iOS 16.4+: geluid van de pagina telt als "afspelen" (niet als beltoon), dus ook hoorbaar met stille modus.
      (navigator as unknown as { audioSession?: { type: string } }).audioSession && ((navigator as unknown as { audioSession: { type: string } }).audioSession.type = "playback");
    } catch {}
    const el = new Audio(beepDataUri());
    const al = new Audio(beepDataUri(true));
    el.preload = al.preload = "auto";
    sound.current = el;
    alarm.current = al;
    const unlock = () => {
      if (unlocked.current) return;
      // Moet binnen een klik/aanraking: één keer stil afspelen, daarna mag de pagina zelf geluid starten.
      for (const a of [el, al]) {
        a.muted = true;
        a.play()
          .then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
            unlocked.current = true;
          })
          .catch(() => { a.muted = false; });
      }
    };
    // iOS telt alleen touchend/click/keydown als gebaar (niet touchstart/pointerdown).
    const events = ["click", "touchend", "keydown"] as const;
    events.forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, unlock));
  }, []);

  const beep = useCallback((urgent = false) => {
    const el = urgent ? alarm.current : sound.current;
    if (!el) return;
    el.muted = false;
    el.currentTime = 0;
    el.play().catch(() => {});
  }, []);

  const seen = useRef<Set<string>>(new Set());

  /** Verwerk nieuwe verzoeken (uit de rechtstreekse stroom of de periodieke controle). */
  const applyEvents = useCallback((incoming: Event[]) => {
    // Dubbelen voorkomen (stroom en controle kunnen hetzelfde verzoek leveren).
    const events = incoming
      .filter((e) => {
        const k = `${e.t}|${e.devId}|${e.site}`;
        if (seen.current.has(k)) return false;
        seen.current.add(k);
        if (seen.current.size > 5000) seen.current = new Set([...seen.current].slice(-2500));
        return true;
      })
      .sort((a, b) => a.t - b.t);
    if (!events.length) return;
    lastSeen.current = Math.max(lastSeen.current, ...events.map((e) => e.t));
    setUpdated(new Date());
    // Geluid alleen voor nieuwe bezoeken die je nu ook in de lijst ziet.
    // Rood (18+, dating, VPN, geblokkeerd) klinkt altijd, ongeacht filter, met een ander, dringender geluid.
    if (events.some((e) => e.flag)) beep(true);
    else if (events.some((e) => !e.bg && e.main && (!deviceRef.current || deviceMap.current[e.devId] === deviceRef.current))) beep();
    setTotal((n) => n + events.length);
    // Label per apparaat: bekende apparaten uit de eerste lading, nieuwe krijgen hun soort (met nummer bij dubbelen).
    for (const e of events) {
      if (deviceMap.current[e.devId]) continue;
      const same = Object.values(deviceMap.current).filter((l) => l === e.type || l.startsWith(e.type + " ")).length;
      deviceMap.current[e.devId] = same ? `${e.type} ${same + 1}` : e.type;
    }
    setGroups((prev) => {
      const next = [...prev];
      for (const ev of events) {
        const e = { ...ev, dev: deviceMap.current[ev.devId] };
        const d = dayKeyFmt.format(e.t);
        const i = next.findIndex((g) => g.d === d && g.dev === e.dev && g.site === e.site);
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1, bl: (next[i].bl ?? 0) + (e.blocked ? 1 : 0), flag: next[i].flag ?? e.flag, last: Math.max(next[i].last, e.t), main: next[i].main || e.main, ts: [e.t, ...(next[i].ts ?? [])].slice(0, 8), ss: extendSessions(next[i].ss ?? [], e.t), mins: (next[i].mins ?? 0) + Math.max(0, sumMin(extendSessions(next[i].ss ?? [], e.t)) - sumMin(next[i].ss ?? [])), flash: Date.now() };
        else {
          // Staat de site nog nergens in de lijst, dan is hij voor het eerst gezien.
          const known = next.some((g) => g.site === e.site);
          next.push({ d, dev: e.dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, main: e.main, flag: e.flag, ts: [e.t], ss: [{ s: e.t, e: e.t }], mins: 0, cat: e.cat, bl: e.blocked ? 1 : 0, isNew: !known && !e.bg && !!e.main, flash: Date.now() });
        }
      }
      return next;
    });
    setDevices((prev) => {
      const next = [...prev];
      const todayKey = dayKeyFmt.format(Date.now());
      for (const e of events) {
        const dev = deviceMap.current[e.devId];
        let i = next.findIndex((x) => x.name === dev);
        if (i < 0) {
          next.push({ name: dev, n: 0, last: 0, gap: 2 * 3_600_000, days: 0, ss: [], avg: 0, blocked: 0 });
          i = next.length - 1;
        }
        const x = next[i];
        const visible = (!e.bg && e.main) || e.flag;
        next[i] = {
          ...x,
          n: x.n + 1,
          last: Math.max(x.last ?? 0, e.t),
          ss: visible && dayKeyFmt.format(e.t) === todayKey ? extendAll(x.ss ?? [], e.t) : x.ss,
          blocked: (x.blocked ?? 0) + (e.blocked && e.flag === "Geblokkeerd" ? 1 : 0),
        };
      }
      return next;
    });
  }, [beep]);

  // Vangnet: alleen controleren als de rechtstreekse stroom niet werkt (anders gaan we over de limiet van NextDNS).
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/nextdns/live?since=${lastSeen.current}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Live mislukt");
      setLive("ok");
      applyEvents(data.events as Event[]);
    } catch (e) {
      setLive("fail");
      setLiveError((e as Error).message);
    }
  }, [applyEvents]);

  const liveFailedRef = useRef(false);
  useEffect(() => { liveFailedRef.current = live === "fail"; }, [live]);

  // Live: elke ~1,5 seconde nieuwe verzoeken ophalen, ook als het tabblad op de achtergrond staat.
  // De klok draait in een aparte Web Worker: tabbladen op de achtergrond krijgen anders na een tijdje
  // maar één klokslag per minuut, een worker niet. Terwijl een antwoord nog loopt, slaan we een slag over.
  useEffect(() => {
    if (state !== "ready") return;
    let busy = false;
    let pauseUntil = 0;
    const run = async () => {
      if (busy || Date.now() < pauseUntil) return;
      busy = true;
      await poll();
      if (liveFailedRef.current) pauseUntil = Date.now() + 15000; // bij een fout (bijv. rate limit) afremmen
      busy = false;
    };

    let worker: Worker | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    try {
      const url = URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),1500)"], { type: "text/javascript" }));
      worker = new Worker(url);
      worker.onmessage = run;
      URL.revokeObjectURL(url);
    } catch {
      fallback = setInterval(run, 1500); // zonder worker: gewone klok (wordt op de achtergrond vertraagd)
    }
    run();
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      worker?.terminate();
      if (fallback) clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, poll]);

  // Uitklapoverzicht: wat vroeg hetzelfde apparaat nog meer op rond de laatste bezoeken aan deze site (±30 s), ook verborgen adressen.
  const around = useCallback(
    (g: Group) => {
      const mine = (g.ts ?? [g.last]).slice(0, 3);
      const out: { name: string; site: string; t: number; hidden: boolean; flag?: string }[] = [];
      for (const o of groups) {
        if (o.dev !== g.dev || o.site === g.site) continue;
        const t = (o.ts ?? [o.last]).find((x) => mine.some((m) => Math.abs(x - m) <= 30_000));
        if (t) out.push({ name: o.name, site: o.site, t, hidden: o.bg || !o.main, flag: o.flag });
      }
      return out.sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1) || b.t - a.t).slice(0, 15);
    },
    [groups]
  );

  // Alle 18+/WhatsApp-bezoeken in de logs (ongeacht apparaat of filter), nieuwste eerst.
  // Zoekregels waar rond hetzelfde moment (±30 s, zelfde apparaat) een 18+/dating-adres is opgevraagd.
  const ctx = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) {
      if (g.flag || !isSearch(g.site)) continue;
      const hit = around(g).find((o) => o.flag);
      if (hit) m.set(g.d + g.site + g.dev, `${hit.name} (${hit.flag})`);
    }
    return m;
  }, [groups, around]);

  // Alle andere zichtbare regels van hetzelfde apparaat die rond (±30 s) een rood adres zijn opgevraagd: zachte waarschuwing.
  const soft = useMemo(() => {
    const times = new Map<string, { t: number; label: string }[]>();
    for (const g of groups) {
      if (!g.flag) continue;
      for (const t of g.ts ?? [g.last]) times.set(g.dev, [...(times.get(g.dev) ?? []), { t, label: `${g.name} (${g.flag})` }]);
    }
    const m = new Map<string, string>();
    if (!times.size) return m;
    for (const g of groups) {
      if (g.flag || g.bg || !g.main || isSearch(g.site)) continue;
      const list = times.get(g.dev);
      if (!list) continue;
      for (const t of g.ts ?? [g.last]) {
        const hit = list.find((x) => Math.abs(x.t - t) <= 30_000);
        if (hit) {
          m.set(g.d + g.site + g.dev, hit.label);
          break;
        }
      }
    }
    return m;
  }, [groups]);

  const flagged = useMemo(
    () => groups.filter((g) => g.flag || ctx.has(g.d + g.site + g.dev)).sort((a, b) => b.last - a.last),
    [groups, ctx]
  );

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Apparaten die ongewoon lang niets hebben doorgegeven: uitgezet, offline, of de filtering omzeild (VPN, mobiel internet)?
  const silent = useMemo(() => {
    if (!full) return [];
    const now = Date.now();
    // Alleen telefoons en tablets: laptops en tv's staan gewoon vaak uit of dicht.
    return devices
      .filter((d) => /iphone|ipad|android|tablet/i.test(d.name))
      .map((d) => ({ d, r: isSilent(now, d.last ?? 0, d.gap ?? 2 * 3_600_000, hourOf(now), d.days ?? 0) }))
      .filter((x) => x.r.silent && x.d.last)
      .map((x) => ({ name: x.d.name, last: x.d.last!, since: x.r.since, gap: x.d.gap ?? 0 }));
  }, [devices, full, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const silentNames = useMemo(() => new Set(silent.map((x) => x.name)), [silent]);

  // Samenvatting van vandaag voor het gekozen apparaat (of alle apparaten).
  const summary = useMemo(() => {
    const today = dayKeyFmt.format(Date.now());
    const devs = devices.filter((d) => !device || d.name === device);
    const ss = devs.flatMap((d) => d.ss ?? []);
    const mins = devs.reduce((n, d) => n + sumMin(d.ss ?? []), 0);
    const avg = devs.reduce((n, d) => n + (d.avg ?? 0), 0);
    const night = device ? ss.filter((x) => isNight(x.s) || isNight(x.e)) : [];
    const vis = groups.filter((g) => g.d === today && !g.bg && g.main && (!device || g.dev === device));
    const cats = new Map<string, number>();
    for (const g of vis) if ((g.mins ?? 0) > 0 && g.cat && g.cat !== "Overig") cats.set(g.cat, (cats.get(g.cat) ?? 0) + (g.mins ?? 0));
    const top = [...vis].filter((g) => (g.mins ?? 0) > 0).sort((a, b) => (b.mins ?? 0) - (a.mins ?? 0)).slice(0, 3);
    return {
      mins,
      avg,
      first: ss.length ? Math.min(...ss.map((x) => x.s)) : 0,
      last: ss.length ? Math.max(...ss.map((x) => x.e)) : 0,
      night,
      cats: [...cats].sort((a, b) => b[1] - a[1]).slice(0, 5),
      top,
      blocked: devs.reduce((n, d) => n + (d.blocked ?? 0), 0),
    };
  }, [groups, devices, device, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const days = useMemo(() => {
    const byDay = new Map<string, Group[]>();
    for (const g of groups) {
      if ((device && g.dev !== device) || g.bg || !g.main) continue;
      byDay.set(g.d, [...(byDay.get(g.d) ?? []), g]);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([d, list]) => ({ d, list: list.sort((a, b) => b.last - a.last) }));
  }, [groups, device]);

  return (
    <main>
      <header>
        <div className="title">
          <h1>Bezochte websites &amp; apps</h1>
          {flagged.length + silent.length > 0 && (
            <button className="bang" onClick={() => setOpen(true)} aria-label={`${flagged.length + silent.length} waarschuwingen bekijken`} title="Waarschuwingen bekijken">
              !<span className="count">{flagged.length + silent.length}</span>
            </button>
          )}
        </div>
        <p className="muted">
          {state === "loading" && "Logs ophalen van NextDNS…"}
          {state === "ready" && (
            <>
              <span className={"dot " + (live === "ok" ? "ok" : "fail")} />{" "}
              {live === "fail" ? "Live niet beschikbaar" : "Live"} · {total.toLocaleString("nl-NL")} DNS-verzoeken · {devices.length} {devices.length === 1 ? "apparaat" : "apparaten"} · bijgewerkt om {timeFmt.format(updated!)}
            </>
          )}
          {state === "error" && "Ophalen mislukt"}
        </p>
      </header>

      {state === "error" && <p className="err">{error}</p>}
      {state === "ready" && !full && <p className="muted">Nieuwste activiteit getoond, volledige geschiedenis wordt geladen…</p>}
      {state === "ready" && live === "fail" && <p className="err">Live bijwerken lukt niet: {liveError}</p>}
      {state === "loading" && <div className="loader" aria-label="Laden" />}

      {state === "ready" && (
        <>
          <div className="bar">
            <div className="chips">
              <button className={"chip" + (device === null ? " on" : "")} onClick={() => setDevice(null)}>Alle</button>
              {devices.map((d) => (
                <button key={d.name} className={"chip" + (device === d.name ? " on" : "")} onClick={() => setDevice(d.name)}>
                  {silentNames.has(d.name) && "⚠ "}<span className="dd" style={{ background: devColor(d.name) }} />{d.name}
                  {sumMin(d.ss ?? []) > 0 && <span className="chip-min"> · {dur(sumMin(d.ss ?? []))}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="summary">
            <div className="s-row">
              <strong>{summary.mins > 0 ? `Vandaag ${dur(summary.mins)} actief` : "Vandaag nog niets actiefs"}</strong>
              <span className="muted">
                {summary.avg > 0 && ` · gem. ${dur(summary.avg)}`}
                {device && summary.first > 0 && ` · ${timeFmt.format(summary.first)}–${timeFmt.format(summary.last)}`}
              </span>
            </div>
            {summary.cats.length > 0 && (
              <div className="cats">
                {summary.cats.map(([c, m]) => (
                  <span className="cat" key={c}>{c} <b>{dur(m)}</b></span>
                ))}
              </div>
            )}
            {summary.night.length > 0 && <div className="s-warn">🌙 Actief 's nachts: {summary.night.slice(0, 3).map((x) => timeFmt.format(x.s) + (minutes(x) ? `–${timeFmt.format(x.e)}` : "")).join(", ")}</div>}
            {summary.blocked > 0 && <div className="s-warn">🚫 {summary.blocked}× een geblokkeerde 18+/dating-site geprobeerd te openen</div>}
            {device && silentNames.has(device) && <div className="s-warn">⚠ Ongewoon lang niets doorgegeven: uitgezet, offline of filtering omzeild?</div>}
          </div>

          {days.length === 0 && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list }) => (
            <section key={d}>
              <h2>{dayLabel(d)} <span className="muted">· {list.length}</span></h2>
              <div className="list">
                {list.map((g) => {
                  const key = g.d + g.site + g.dev;
                  const isOpen = expanded === key;
                  return (
                    <div key={key}>
                      <div
                        className={"item clickable" + (g.flag || ctx.has(key) ? " adult" : soft.has(key) ? " near-flag" : "") + (g.flash && Date.now() - g.flash < 4000 ? " fresh" : "")}
                        onClick={() => setExpanded(isOpen ? null : key)}
                        role="button"
                        aria-expanded={isOpen}
                      >
                        {g.flag ? <span className="fav badge">{g.flag === "18+" ? "18+" : g.flag === "Dating" ? "♥" : g.flag === "VPN/proxy" ? "VPN" : g.flag === "Geblokkeerd" ? "🚫" : "!"}</span> : <Favicon domain={g.icon} />}
                        <div className="main">
                          <div className="name">{g.name}{g.isNew && <span className="newtag">Nieuw</span>}</div>
                          <div className="sub"><span className="dd" style={{ background: devColor(g.dev) }} />{g.dev}{(g.mins ?? 0) > 0 && <> · <span className="dur">{dur(g.mins!)}</span></>}{g.flag && g.flag !== "18+" && g.flag !== "Dating" && <> · {g.flag}{(g.bl ?? 0) > 0 && ` (${g.bl}× geblokkeerd)`}</>}{ctx.has(key) && <> · ⚠ rond dit bezoek: {ctx.get(key)}</>}{!ctx.has(key) && soft.has(key) && <> · ⚠ rond 18+: {soft.get(key)}</>}</div>
                        </div>
                        <div className="time">{g.last ? timeFmt.format(g.last) : "–"}</div>
                        <span className={"chev" + (isOpen ? " up" : "")} aria-hidden>›</span>
                      </div>
                      {isOpen && (() => {
                        const near = around(g);
                        const redNear = near.some((o) => o.flag);
                        const showNear = redNear || moreKey === key;
                        return (
                          <div className="detail">
                            {(() => {
                              const ss = g.ss ?? [{ s: g.last, e: g.last }];
                              const total = g.mins ?? ss.reduce((n, x) => n + minutes(x), 0);
                              const fmt = (x: Session) =>
                                minutes(x) === 0 ? `${timeFmt.format(x.e)} · kort` : `${timeFmt.format(x.s)} – ${timeFmt.format(x.e)} · ${minutes(x)} min`;
                              return (
                                <>
                                  <div className="dh">{total > 0 ? `${dayLabel(g.d)} ± ${dur(total)} actief` : dayLabel(g.d)}</div>
                                  <div className="timelist">
                                    {ss.slice(0, 3).map((x) => (
                                      <div key={x.s}>{fmt(x)}</div>
                                    ))}
                                    {ss.length > 3 && <div className="sub">+ {ss.length - 3} eerdere</div>}
                                  </div>
                                </>
                              );
                            })()}
                            {(g.cat && g.cat !== "Overig") || g.isNew ? (
                              <div className="sub" style={{ marginTop: 6 }}>
                                {g.cat && g.cat !== "Overig" && <>Categorie: {g.cat}</>}{g.isNew && <>{g.cat && g.cat !== "Overig" ? " · " : ""}Voor het eerst gezien in de afgelopen 24 uur</>}
                              </div>
                            ) : null}
                            {near.length > 0 && !showNear && (
                              <button className="more-link" onClick={() => setMoreKey(key)}>Wat gebeurde er nog meer? ›</button>
                            )}
                            {showNear && (
                              <>
                                <div className="dh">Op hetzelfde moment (±30 sec.)</div>
                                {near.map((o) => (
                                  <div className="near" key={o.site}>
                                    <span className="nt">{timeSecFmt.format(o.t)}</span>
                                    <span className="nn">{o.name}</span>
                                    {o.flag && <span className="tag">{o.flag}</span>}
                                    {o.hidden && !o.flag && <span className="sub">achtergrond</span>}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="panel" role="dialog" aria-label="Waarschuwingen" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Waarschuwingen</h3>
              <button className="close" onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
            {silent.length > 0 && (
              <>
                <div className="dh">Apparaat ongewoon stil</div>
                {silent.map((x) => (
                  <div className="hit" key={x.name}>
                    <span className="tag amber">Stil</span>
                    <div className="main">
                      <div className="name">{x.name}</div>
                      <div className="sub">Geen verzoeken sinds {timeFmt.format(x.last)} ({dur(Math.round(x.since / 60000))}); normaal ±{dur(Math.max(1, Math.round(x.gap / 60000)))} overdag. Uitgezet, offline, of VPN / mobiel internet?</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <p className="muted">Gemarkeerde sites (18+, dating, VPN/proxy, geblokkeerd) in de logs, nieuwste eerst.</p>
            {flagged.map((g) => (
              <div className="hit" key={g.d + g.dev + g.site}>
                <span className="tag">{g.flag ?? "In de buurt"}</span>
                <div className="main">
                  <div className="name">{g.name}</div>
                  <div className="sub">{ctx.get(g.d + g.site + g.dev) && <>rond dit bezoek: {ctx.get(g.d + g.site + g.dev)} · </>}{g.dev} · laatst {dayLabel(g.d).toLowerCase()} om {timeFmt.format(g.last)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
