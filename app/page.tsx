"use client";

import { extendAll, extendSessions, minutes, type Session } from "@/lib/sessions";
import { isSilent } from "@/lib/devstats";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Device, Event, Group, Insights, PayMoment } from "./types";
import { DevIcon, dayKeyFmt, dayLabel, dur, hourOf, isNight, sumMin, timeFmt, timeSecFmt } from "./ui";

/** Zoekmachines en beeldzoekers: bij een 18+-adres kort erna/ervoor markeren we ook deze regel. */
const isSearch = (site: string) => /^google\.[a-z.]+$/.test(site) || ["bing.com", "duckduckgo.com", "ecosia.org", "yahoo.com", "startpage.com", "qwant.com", "yandex.com", "brave.com", "pinterest.com", "pinterest.nl"].includes(site);


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

/** Favicon; heeft een site er geen, dan een rustig grijs vakje met de beginletter (zo blijft alles uitgelijnd). */
function Favicon({ domain, name }: { domain: string; name: string }) {
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const initial = (name.replace(/^www\./, "")[0] ?? "?").toUpperCase();
  return (
    <>
      {state !== "ok" && <span className="fav ph" aria-hidden>{initial}</span>}
      {state !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={state === "ok" ? "fav ok" : "fav-hidden"}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          // Heeft een site geen icoon, dan geeft Google een standaard wereldbolletje van 16x16: dat tonen we niet.
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 16 ? "ok" : "none")}
          onError={() => setState("none")}
        />
      )}
    </>
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
  const [insights, setInsights] = useState<Insights | null>(null);
  const [livePay, setLivePay] = useState<PayMoment[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hist, setHist] = useState(0); // voortgang van het laden van alle logs (na het tonen van vandaag)
  const [histDone, setHistDone] = useState(false);
  const [histErr, setHistErr] = useState(false);
  const loadStart = useRef(Date.now());
  const [goOpen, setGoOpen] = useState(false); // "Ga naar dag en tijd"
  const [goDay, setGoDay] = useState("");
  const [goTime, setGoTime] = useState("10:00");
  const [gotoKey, setGotoKey] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set()); // oudere dagen die de gebruiker heeft opengeklapt
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

  // Eerst alles laden en pas tonen als het klaar is (geen half scherm dat daarna verspringt).
  const [progress, setProgress] = useState(0);
  const finishing = useRef(false);

  useEffect(() => {
    const t0 = Date.now();
    let fullDone = false;
    const apply = (data: { groups: Group[]; devices: Device[]; total: number; deviceMap?: Record<string, string>; insights?: Insights }, isFull: boolean) => {
      fullRef.current = true;
      setGroups(data.groups);
      setDevices(data.devices);
      setTotal(data.total);
      deviceMap.current = data.deviceMap ?? {};
      setInsights(data.insights ?? null);
      lastSeen.current = Math.max(0, ...data.groups.map((g) => g.last));
      setUpdated(new Date());
      if (isFull) {
        setFull(true);
        setHist(1);
        setHistDone(true);
        setTimeout(() => setHistDone(false), 900);
        try { localStorage.setItem("csv-load-ms", String(Date.now() - loadStart.current)); } catch {}
      }
      finishing.current = true;
      setProgress(1);
      setTimeout(() => setState("ready"), 450); // de cirkel even op 100% laten zien
    };
    // Vandaag komt snel binnen en wordt meteen getoond; de volledige geschiedenis volgt en vervangt dit.
    fetch("/api/nextdns?scope=today")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || fullDone) return;
        try { localStorage.setItem("csv-today-ms", String(Date.now() - t0)); } catch {}
        apply(data, false);
      })
      .catch(() => {});
    fetch("/api/nextdns")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        fullDone = true;
        apply(data, true);
      })
      .catch((e: Error) => {
        if (fullRef.current) { setHistErr(true); return; } // vandaag staat al op het scherm
        setError(e.message);
        setState("error");
        setFull(true);
      });
  }, []);

  // Laadbalk voor de volledige geschiedenis: schatting op basis van de vorige keer.
  useEffect(() => {
    if (state !== "ready" || full || histErr) return;
    let expected = 25_000;
    try {
      const v = Number(localStorage.getItem("csv-load-ms"));
      if (v > 3000 && v < 180_000) expected = v;
    } catch {}
    const id = setInterval(() => setHist(0.95 * (1 - Math.exp((-3 * (Date.now() - loadStart.current)) / expected))), 150);
    return () => clearInterval(id);
  }, [state, full, histErr]);

  // Voortgang is een schatting (NextDNS meldt zelf niets): loopt op naar ~90% over de tijd die het de vorige keer duurde.
  useEffect(() => {
    if (state !== "loading") return;
    let expected = 6_000;
    try {
      const v = Number(localStorage.getItem("csv-today-ms"));
      if (v > 500 && v < 120_000) expected = v;
    } catch {}
    const t0 = Date.now();
    const id = setInterval(() => {
      if (finishing.current) return;
      setProgress(0.95 * (1 - Math.exp((-3 * (Date.now() - t0)) / expected)));
    }, 100);
    return () => clearInterval(id);
  }, [state]);

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
    if (events.some((e) => e.flag || e.pay?.level === "checkout")) beep(true);
    else if (events.some((e) => !e.bg && e.main && (!deviceRef.current || deviceMap.current[e.devId] === deviceRef.current))) beep();
    setTotal((n) => n + events.length);
    // Label per apparaat: bekende apparaten uit de eerste lading, nieuwe krijgen hun soort (met nummer bij dubbelen).
    for (const e of events) {
      if (deviceMap.current[e.devId]) continue;
      const same = Object.values(deviceMap.current).filter((l) => l === e.type || l.startsWith(e.type + " ")).length;
      deviceMap.current[e.devId] = same ? `${e.type} ${same + 1}` : e.type;
    }
    const pays = events.filter((e) => e.pay);
    if (pays.length) setLivePay((prev) => [...pays.map((e) => ({ t: e.t, dev: deviceMap.current[e.devId], kind: e.pay!.kind, level: e.pay!.level })), ...prev].slice(0, 60));
    setGroups((prev) => {
      const next = [...prev];
      for (const ev of events) {
        const e = { ...ev, dev: deviceMap.current[ev.devId] };
        const d = dayKeyFmt.format(e.t);
        const i = next.findIndex((g) => g.d === d && g.dev === e.dev && g.site === e.site);
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1, bl: (next[i].bl ?? 0) + (e.blocked ? 1 : 0), flag: next[i].flag ?? e.flag, last: Math.max(next[i].last, e.t), main: next[i].main || e.main, ts: [e.t, ...(next[i].ts ?? [])].slice(0, 8), ss: extendSessions(next[i].ss ?? [], e.t), sc: (next[i].sc ?? 0) + ((next[i].ss ?? []).some((x) => e.t >= x.s - 300_000 && e.t <= x.e + 300_000) ? 0 : 1), mins: (next[i].mins ?? 0) + Math.max(0, sumMin(extendSessions(next[i].ss ?? [], e.t)) - sumMin(next[i].ss ?? [])), flash: Date.now() };
        else {
          // Staat de site nog nergens in de lijst, dan is hij voor het eerst gezien.
          const known = next.some((g) => g.site === e.site);
          next.push({ d, dev: e.dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, main: e.main, flag: e.flag, ts: [e.t], ss: [{ s: e.t, e: e.t }], sc: 1, rc: 0, mins: 0, cat: e.cat, bl: e.blocked ? 1 : 0, isNew: !known && !e.bg && !!e.main, flash: Date.now() });
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

  // Elke 5 minuten de inzichten verversen (thuis/onderweg, slaaptijd, bedreigingen, ...); de lijst zelf blijft live bijgewerkt.
  useEffect(() => {
    if (state !== "ready") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/nextdns");
        const data = await res.json();
        if (!res.ok) return;
        setInsights(data.insights ?? null);
        setDevices((prev) =>
          prev.map((p) => {
            const f = (data.devices as Device[]).find((x) => x.name === p.name);
            return f ? { ...p, first: f.first, away: f.away, sleep: f.sleep, dm: f.dm, threats: f.threats, avg: f.avg, gap: f.gap, days: f.days } : p;
          })
        );
        const fresh = new Map<string, Group>();
        for (const g of data.groups as Group[]) fresh.set(g.d + "|" + g.dev + "|" + g.site, g);
        setGroups((prev) =>
          prev.map((g) => {
            const f = fresh.get(g.d + "|" + g.dev + "|" + g.site);
            return f ? { ...g, mm: f.mm, susp: f.susp, cc: f.cc, isNew: f.isNew || g.isNew } : g;
          })
        );
      } catch {}
    }, 300_000);
    return () => clearInterval(id);
  }, [state]);

  // Betaalmomenten: live gevonden en uit de geschiedenis, zonder dubbelen (binnen 3 minuten).
  const payments = useMemo(() => {
    const all = [...livePay, ...(insights?.payments ?? [])].sort((a, b) => b.t - a.t);
    const out: PayMoment[] = [];
    for (const p of all) if (!out.some((x) => x.dev === p.dev && x.kind === p.kind && Math.abs(x.t - p.t) <= 180_000)) out.push(p);
    return out;
  }, [livePay, insights]);

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

  // Meer meldingen: aankopen (laatste 24 uur), nieuw apparaat, verdachte nieuwe adressen.
  const extraAlerts = useMemo(() => {
    const now = Date.now();
    const out: { key: string; tag: string; title: string; sub: string }[] = [];
    for (const p of payments) if (p.level === "checkout" && now - p.t < 86_400_000) out.push({ key: "p" + p.t + p.dev, tag: "Aankoop", title: p.kind, sub: `${p.dev} · ${timeFmt.format(p.t)}: afrekenen` });
    for (const d of devices) if (d.first && now - d.first < 86_400_000 && insights?.since && now - insights.since > 3 * 86_400_000) out.push({ key: "d" + d.name, tag: "Nieuw", title: d.name, sub: `Nieuw apparaat in NextDNS, voor het eerst gezien om ${timeFmt.format(d.first)}` });
    for (const g of groups) if (g.susp && g.isNew && g.main && !g.bg) out.push({ key: "s" + g.d + g.dev + g.site, tag: "Verdacht", title: g.site, sub: `${g.dev} · ${g.susp}` });
    return out;
  }, [payments, devices, groups, insights, tick]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const night = device ? ss.filter((x) => minutes(x) >= 2 && (isNight(x.s) || isNight(x.e))) : [];
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

  // Actieve minuten per dag voor het gekozen apparaat (of alle): vandaag live, eerdere dagen van de server.
  const dayMins = useCallback(
    (d: string) => {
      const today = dayKeyFmt.format(Date.now());
      return devices.filter((x) => !device || x.name === device).reduce((n, x) => n + (d === today ? sumMin(x.ss ?? []) : x.dm?.[d] ?? 0), 0);
    },
    [devices, device]
  );

  const days = useMemo(() => {
    const byDay = new Map<string, Group[]>();
    for (const g of groups) {
      if ((device && g.dev !== device) || g.bg || !g.main) continue;
      if ((g.bl ?? 0) >= g.n && !g.flag) continue; // alles geblokkeerd door NextDNS: niet bezocht
      byDay.set(g.d, [...(byDay.get(g.d) ?? []), g]);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([d, list]) => ({
        d,
        list,
        // Elk bezoek (sessie) is een eigen regel, nieuwste bovenaan: zo bouwt de dag zich op in de volgorde van wat er gebeurde.
        rows: list
          .flatMap((g) => {
            const ss = g.ss && g.ss.length ? g.ss : [{ s: g.last, e: g.last }];
            const oldest = Math.min(...ss.map((x) => x.s));
            return ss.map((x) => ({ g, t: x.s, first: x.s === oldest && (g.sc ?? ss.length) <= ss.length, newest: x.e === Math.max(...ss.map((y) => y.e)) }));
          })
          .sort((a, b) => b.t - a.t),
      }));
  }, [groups, device]);

  return (
    <main>
      {state === "error" && <p className="err">{error}</p>}
      {state === "ready" && live === "fail" && <p className="err">Live bijwerken lukt niet: {liveError}</p>}
      {state === "loading" && (
        <div className="loading" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <svg viewBox="0 0 100 100" width="132" height="132">
            <circle cx="50" cy="50" r="44" className="ring-bg" />
            <circle cx="50" cy="50" r="44" className="ring" style={{ strokeDasharray: 276.46, strokeDashoffset: 276.46 * (1 - progress) }} />
          </svg>
          <div className="pct">{Math.round(progress * 100)}%</div>
          <p className="muted">{progress >= 1 ? "Klaar" : progress > 0.85 ? "Bijna klaar…" : "Logs ophalen van NextDNS…"}</p>
        </div>
      )}

      {state === "ready" && (!full || histDone) && (
        <div className={"histbar" + (histErr ? " err" : "")} role="progressbar" aria-label="Alle logs laden" aria-valuenow={Math.round(hist * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="histfill" style={{ width: `${Math.round((histErr ? 1 : hist) * 100)}%` }} />
        </div>
      )}
      {state === "ready" && (
        <>
          <div className="bar">
            <div className="bar-in">
            <div className="chips">
              <button className={"chip" + (device === null ? " on" : "")} onClick={() => setDevice(null)}>Alle</button>
              {devices.map((d) => (
                <button key={d.name} className={"chip" + (device === d.name ? " on" : "")} onClick={() => setDevice(d.name)}>
                  {silentNames.has(d.name) && "⚠ "}<DevIcon name={d.name} />{d.name}
                                  </button>
              ))}
            </div>
            {flagged.length + silent.length + extraAlerts.length > 0 && (
              <button className="bang" onClick={() => setOpen(true)} aria-label={`${flagged.length + silent.length + extraAlerts.length} waarschuwingen bekijken`} title="Waarschuwingen bekijken">
                !<span className="count">{flagged.length + silent.length + extraAlerts.length}</span>
              </button>
            )}
            {days.length > 0 && (
              <button
                className={"goto-btn" + (goOpen ? " on" : "")}
                onClick={() => { setGoOpen((v) => !v); if (!goDay) setGoDay(days[0].d); }}
                aria-expanded={goOpen}
                aria-label="Ga naar dag en tijd"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                Ga naar
              </button>
            )}
            </div>
          </div>

          {goOpen && days.length > 0 && (
            <form
              className="goto"
              onSubmit={(e) => {
                e.preventDefault();
                const day = days.find((x) => x.d === (goDay || days[0].d));
                if (!day || !goTime) return;
                const [h, m] = goTime.split(":").map(Number);
                const want = h * 60 + m;
                const minOf = (t: number) => { const [a, b] = timeFmt.format(t).split(":").map(Number); return a * 60 + b; };
                let best = day.rows[0];
                for (const r of day.rows) if (Math.abs(minOf(r.t) - want) < Math.abs(minOf(best.t) - want)) best = r;
                if (!best) return;
                const rk = best.g.d + best.g.site + best.g.dev + ":" + best.t;
                setOpenDays((prev) => new Set(prev).add(day.d));
                setGotoKey(rk);
                setTimeout(() => {
                  document.querySelector(`[data-rk="${CSS.escape(rk)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
                }, 60);
                setTimeout(() => setGotoKey((k) => (k === rk ? null : k)), 3500);
                setGoOpen(false);
              }}
            >
              <label>
                <span>Dag</span>
              <select value={goDay || days[0].d} onChange={(e) => setGoDay(e.target.value)} aria-label="Dag">
                {days.map((x) => (
                  <option key={x.d} value={x.d}>{dayLabel(x.d)}</option>
                ))}
              </select>
              </label>
              <label>
                <span>Tijd</span>
                <input type="time" value={goTime} onChange={(e) => setGoTime(e.target.value)} aria-label="Tijd" />
              </label>
              <button type="submit">Ga</button>
            </form>
          )}

          {((device && summary.first > 0) || summary.night.length > 0 || summary.blocked > 0 || (device && silentNames.has(device))) && (
            <div className="summary">
              {device && summary.first > 0 && (
                <div className="s-row">
                  <span className="muted">Actief {timeFmt.format(summary.first)}–{timeFmt.format(summary.last)}</span>
                </div>
              )}
              {summary.night.length > 0 && <div className="s-warn">🌙 Actief 's nachts: {summary.night.slice(0, 3).map((x) => timeFmt.format(x.s) + (minutes(x) ? `–${timeFmt.format(x.e)}` : "")).join(", ")}</div>}
              {summary.blocked > 0 && <div className="s-warn">🚫 {summary.blocked}× een geblokkeerde 18+/dating-site geprobeerd te openen</div>}
              {device && silentNames.has(device) && <div className="s-warn">⚠ Ongewoon lang niets doorgegeven: uitgezet, offline of filtering omzeild?</div>}
            </div>
          )}

          {days.length === 0 && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list, rows }) => {
            const today = dayKeyFmt.format(Date.now());
            const recent = d === today; // alleen vandaag staat open; gisteren en ouder zijn ingeklapt
            const isDayOpen = recent || openDays.has(d);
            const dm = dayMins(d);
            return (
            <section key={d}>
              <h2
                className={recent ? "" : "fold"}
                onClick={recent ? undefined : () => setOpenDays((prev) => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; })}
                role={recent ? undefined : "button"}
                aria-expanded={recent ? undefined : isDayOpen}
              >
                {dayLabel(d)}{!recent && <span className="muted"> · {list.length} {list.length === 1 ? "site" : "sites"}{dm > 0 ? ` · ${dur(dm)} actief` : ""}</span>}
                {!recent && <span className={"fold-chev" + (isDayOpen ? " up" : "")} aria-hidden>›</span>}
              </h2>
              {isDayOpen && (
              <div className="list">
                {rows.map(({ g, t, first, newest }) => {
                  const key = g.d + g.site + g.dev;
                  const rowKey = key + ":" + t;
                  const isOpen = expanded === rowKey;
                  return (
                    <div key={rowKey} data-rk={rowKey}>
                      <div
                        className={"item clickable" + (g.flag || ctx.has(key) ? " adult" : soft.has(key) ? " near-flag" : "") + (newest && g.flash && Date.now() - g.flash < 4000 ? " fresh" : "") + (gotoKey === rowKey ? " goto-hit" : "")}
                        onClick={() => setExpanded(isOpen ? null : rowKey)}
                        role="button"
                        aria-expanded={isOpen}
                      >
                        {g.flag ? <span className="fav badge">{g.flag === "18+" ? "18+" : g.flag === "Dating" ? "♥" : g.flag === "VPN/proxy" ? "VPN" : g.flag === "Geblokkeerd" ? "🚫" : "!"}</span> : <Favicon domain={g.icon} name={g.name} />}
                        <div className="main">
                          <div className="name">{g.name}{g.isNew && first && <span className="newtag">Nieuw</span>}</div>
                          {(() => {
                            const parts: React.ReactNode[] = [];
                            parts.push(<span key="d" className="dev"><DevIcon name={g.dev} />{g.dev}</span>);
                            if (g.flag && g.flag !== "18+" && g.flag !== "Dating") parts.push(<span key="f">{g.flag}{(g.bl ?? 0) > 0 && ` (${g.bl}× geblokkeerd)`}</span>);
                            if (ctx.has(key)) parts.push(<span key="c">⚠ rond dit bezoek: {ctx.get(key)}</span>);
                            else if (soft.has(key)) parts.push(<span key="s">⚠ rond 18+: {soft.get(key)}</span>);
                            return <div className="sub">{parts.flatMap((x, i) => (i ? [" · ", x] : [x]))}</div>;
                          })()}
                        </div>
                        <div className="time">
                          {(() => {
                            // Duur van dit ene bezoek (sessie), alleen als het minstens een minuut was.
                            const sess = (g.ss ?? []).find((x) => x.s === t);
                            const m = sess ? minutes(sess) : 0;
                            return m > 0 ? <><span className="vdur">{dur(m)}</span><span className="vsep" aria-hidden>|</span></> : null;
                          })()}
                          {t ? timeFmt.format(t) : "–"}
                        </div>
                      </div>
                      {isOpen && (() => {
                        const near = around(g);
                        const redNear = near.some((o) => o.flag);
                        const showNear = redNear;
                        return (
                          <div className="detail">
                            <a
                              className="open-link"
                              href={`https://${g.site}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              referrerPolicy="no-referrer"
                              onClick={(e) => {
                                // Gemarkeerde of verdachte sites niet per ongeluk openen.
                                const risk = g.flag ? `gemarkeerd als ${g.flag}` : g.susp ? `verdacht (${g.susp})` : "";
                                if (risk && !window.confirm(`${g.site} is ${risk}. Toch openen?`)) e.preventDefault();
                              }}
                            >
                              Open {g.site} ↗
                            </a>
                            {showNear && (
                              <>
                                <div className="dh">Let op: op hetzelfde moment (±30 sec.) op de lijst</div>
                                {near.filter((o) => o.flag).map((o) => (
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
              )}
            </section>
            );
          })}
        </>
      )}
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="panel" role="dialog" aria-label="Waarschuwingen" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Waarschuwingen</h3>
              <button className="close" onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
            {extraAlerts.length > 0 && (
              <>
                <div className="dh">Aandacht</div>
                {extraAlerts.map((a) => (
                  <div className="hit" key={a.key}>
                    <span className="tag amber">{a.tag}</span>
                    <div className="main">
                      <div className="name">{a.title}</div>
                      <div className="sub">{a.sub}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
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
            {flagged.length > 0 && <p className="muted">Gemarkeerde sites (18+, dating, VPN/proxy, geblokkeerd) in de logs, nieuwste eerst.</p>}
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
