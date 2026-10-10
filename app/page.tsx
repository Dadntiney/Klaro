"use client";

import { extendAll, extendSessions, minutes, type Session, isHuman } from "@/lib/sessions";
import { mergeRows } from "@/lib/merge";
import { isPlainSite, isSystemSite } from "@/lib/system";
import { isMailSession } from "@/lib/mail";
import { isSilent } from "@/lib/devstats";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Device, Event, Group, Insights } from "./types";
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

// Altijd tonen, ook bij weinig verzoeken (zelf gekozen sites).
const ALWAYS_SHOW = new Set(["gofiev.nl", "meethue.com", "eufy.com"]);

interface DetailData {
  matched: { h: string; n: number; b: number }[];
  matchedTotal: number;
  other: { h: string; n: number; b: number }[];
  otherTotal: number;
  total: number;
  capped: boolean;
}

/** Tv-apparaten: een "bezoek" korter dan een minuut is een voorvertoning op het beginscherm of de screensaver, geen kijken. */
const isTv = (dev: string) => /^(Apple TV|TV)( \d+)?$/.test(dev);
const tvBlip = (dev: string, x: { s: number; e: number }) => isTv(dev) && x.e - x.s < 60_000;
const MSG = /^(whatsapp|telegram|signal|messenger|snapchat)\./; // berichten-apps worden ook op de achtergrond regelmatig wakker

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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, { state: "loading" | "ok" | "err"; data?: DetailData }>>({}); // wat er rond een bezoek gebeurde, per geopende regel
  const [showOther, setShowOther] = useState<Set<string>>(new Set());
  const [goOpen, setGoOpen] = useState(false); // "Ga naar dag en tijd"
  const [goDay, setGoDay] = useState("");
  const [goTime, setGoTime] = useState("10:00");
  const [gotoKey, setGotoKey] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set()); // oudere dagen die de gebruiker heeft opengeklapt
  const sound = useRef<HTMLAudioElement | null>(null);
  const alarm = useRef<HTMLAudioElement | null>(null);
  const [clock, setClock] = useState(() => Date.now()); // elke 20 sec: "nu actief" opnieuw beoordelen
  const [tick, setTick] = useState(0); // elke minuut: "ongewoon stil" opnieuw beoordelen
  const deviceRef = useRef<string | null>(null);
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  const [live, setLive] = useState<"ok" | "fail">("ok");
  const [liveError, setLiveError] = useState("");
  const lastSeen = useRef(0);
  const deviceMap = useRef<Record<string, string>>({});

  // Eerst vandaag laden en tonen (skelet met voortgang tot dan), daarna de oudere dagen eronder.
  const [progress, setProgress] = useState(0);
  const [histErr, setHistErr] = useState(false); // oudere dagen laden lukte niet
  // Eerst alleen het laatste uur getoond: regels die vóór dit moment begonnen komen nog (0 = vandaag is compleet).
  const [cut, setCut] = useState(0);
  const finishing = useRef(false);

  useEffect(() => {
    const t0 = Date.now();
    const apply = (data: { groups: Group[]; devices: Device[]; total: number; deviceMap?: Record<string, string>; insights?: Insights; partial?: number }, isFull: boolean) => {
      fullRef.current = true;
      // Bij alleen het laatste stuk: de eerste 15 minuten van dat stuk niet tonen (een bezoek dat eerder begon zou daar te laat lijken te beginnen).
      setCut(data.partial ? data.partial + 15 * 60_000 : 0);
      setGroups(data.groups);
      setDevices(data.devices);
      setTotal(data.total);
      deviceMap.current = data.deviceMap ?? {};
      setInsights(data.insights ?? null);
      lastSeen.current = Math.max(0, ...data.groups.map((g) => g.last));
      setUpdated(new Date());
      if (data.partial) {
        // alleen het laatste uur: geen tijdsmeting opslaan
      } else if (isFull) {
        setFull(true);
        // Live-gegevens van na het ophalen opnieuw laten binnenkomen bovenop de volledige lijst.
        seen.current = new Set();
        lastHost.current = new Map();
        try { localStorage.setItem("csv-load-ms", String(Date.now() - t0)); } catch {}
      } else {
        try { localStorage.setItem("csv-today-ms", String(Date.now() - t0)); } catch {}
      }
      if (!finishing.current) try { localStorage.setItem("csv-first-ms", String(Date.now() - t0)); } catch {}
      finishing.current = true;
      setProgress(1);
      setTimeout(() => setState("ready"), 450); // de cirkel even op 100% laten zien
    };
    // Eerst vandaag (snel), daarna de oudere dagen. Beide bronnen tellen precies gelijk, dus vandaag verandert daarna niet meer.
    // Nog eerder: alleen het laatste anderhalf uur (één pagina bij NextDNS, ~1 sec.), zodat bovenaan meteen iets staat.
    let fullDone = false;
    let todayShown = false;
    fetch("/api/nextdns?scope=today&hours=1.5")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || fullDone || todayShown) return;
        apply(data, false);
      })
      .catch(() => {});
    fetch("/api/nextdns?scope=today")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || fullDone) return;
        todayShown = true;
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
        if (todayShown) { setHistErr(true); return; } // vandaag staat er al; alleen de oudere dagen lukken niet
        setError(e.message);
        setState("error");
        setFull(true);
      });
  }, []);

  // Voortgang is een schatting (NextDNS meldt zelf niets): loopt op naar ~90% over de tijd die het de vorige keer duurde.
  useEffect(() => {
    if (state !== "loading") return;
    let expected = 3_000;
    try {
      const v = Number(localStorage.getItem("csv-first-ms"));
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
  const lastHost = useRef<Map<string, number>>(new Map());
  const [mailT, setMailT] = useState<Map<string, { esp: number[]; mc: number[] }>>(new Map());

  /** Verwerk nieuwe verzoeken (uit de rechtstreekse stroom of de periodieke controle). */
  const applyEvents = useCallback((incoming: Event[]) => {
    // Mailverkeer onthouden (per apparaat, laatste half uur): korte "bezoeken" tegelijk met een geopende nieuwsbrief zijn geen bezoek.
    const mailEv = incoming.filter((e) => e.esp || e.mc);
    if (mailEv.length) setMailT((prev) => {
      const next = new Map(prev);
      const cut = Date.now() - 1_800_000;
      for (const e of mailEv) {
        const dev = deviceMap.current[e.devId] ?? e.type;
        const cur = next.get(dev) ?? { esp: [], mc: [] };
        next.set(dev, { esp: e.esp ? [...cur.esp.filter((t) => t > cut), e.t] : cur.esp, mc: e.mc ? [...cur.mc.filter((t) => t > cut), e.t] : cur.mc });
      }
      return next;
    });
    // Dubbelen voorkomen (stroom en controle kunnen hetzelfde verzoek leveren).
    const events = incoming
      .filter((e) => !e.quiet)
      .filter((e) => {
        const k = `${e.t}|${e.devId}|${e.site}`;
        if (seen.current.has(k)) return false;
        seen.current.add(k);
        // Hetzelfde adres binnen 1,5 seconde is één opvraging (zelfde telling als de server).
        if (e.host) {
          const hk = `${e.devId}|${e.host}`;
          const prev = lastHost.current.get(hk);
          if (prev !== undefined && Math.abs(e.t - prev) <= 1_500 && !e.flag) return false;
          lastHost.current.set(hk, e.t);
          if (lastHost.current.size > 5000) lastHost.current = new Map([...lastHost.current].slice(-2500));
        }
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
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1, bl: (next[i].bl ?? 0) + (e.blocked ? 1 : 0), flag: next[i].flag ?? e.flag, last: Math.max(next[i].last, e.t), main: next[i].main || e.main, ts: [e.t, ...(next[i].ts ?? [])].slice(0, 8), lm: e.media ? Math.max(next[i].lm ?? 0, e.t) : next[i].lm, ss: extendSessions(next[i].ss ?? [], e.t, !!e.media, e.fg, isPlainSite(next[i]) && e.fg === undefined ? !!e.res : undefined), sc: (next[i].sc ?? 0) + ((next[i].ss ?? []).some((x) => e.t >= x.s - 300_000 && e.t <= x.e + 300_000) ? 0 : 1), mins: (next[i].mins ?? 0) + Math.max(0, sumMin(extendSessions(next[i].ss ?? [], e.t, !!e.media, e.fg)) - sumMin(next[i].ss ?? [])), flash: Date.now() };
        else {
          // Staat de site nog nergens in de lijst, dan is hij voor het eerst gezien.
          const known = next.some((g) => g.site === e.site);
          next.push({ d, dev: e.dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, main: e.main, flag: e.flag, ts: [e.t], ss: [{ s: e.t, e: e.t, n: 1, ...(e.media ? { m: 1 } : {}), ...(e.fg !== undefined ? { f: e.fg ? 1 : 0 } : {}), ...(e.res && e.name === e.site ? { res: 1 as const } : {}) }], lm: e.media ? e.t : undefined, sc: 1, rc: 0, mins: 0, cat: e.cat, bl: e.blocked ? 1 : 0, isNew: !known && !e.bg && !!e.main, flash: Date.now() });
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

  // De volledige lijst (alle regels van NextDNS) opnieuw ophalen en bijwerken: elke 5 minuten, en zodra de pagina weer zichtbaar wordt na een tijd op de achtergrond.
  // Zo komt ook alles binnen wat de live-controle gemist heeft (bijvoorbeeld als de telefoon vergrendeld was), inclusief rode sites.
  const lastFull = useRef(Date.now());
  const refreshFull = useCallback(async () => {
    try {
      const res = await fetch("/api/nextdns");
      const data = await res.json();
      if (!res.ok) return;
      lastFull.current = Date.now();
      setInsights(data.insights ?? null);
      setDevices((prev) =>
        prev.map((p) => {
          const f = (data.devices as Device[]).find((x) => x.name === p.name);
          return f ? { ...p, first: f.first, away: f.away, sleep: f.sleep, dm: f.dm, threats: f.threats, avg: f.avg, gap: f.gap, days: f.days } : p;
        })
      );
      const fresh = new Map<string, Group>();
      for (const g of data.groups as Group[]) fresh.set(g.d + "|" + g.dev + "|" + g.site, g);
      setGroups((prev) => {
        const seenKeys = new Set<string>();
        const next = prev.map((g) => {
          const k = g.d + "|" + g.dev + "|" + g.site;
          seenKeys.add(k);
          const f = fresh.get(k);
          if (!f) return g;
          // Is de volledige lijst even recent of recenter dan wat we live hebben, dan is die leidend (nieuwe bezoeken, sessies, rode markering).
          return f.last >= g.last ? { ...f, isNew: f.isNew || g.isNew, flash: g.flash } : { ...g, mm: f.mm, susp: f.susp, cc: f.cc, isNew: f.isNew || g.isNew };
        });
        // Groepen die live gemist zijn, komen er alsnog bij.
        for (const [k, f] of fresh) if (!seenKeys.has(k)) next.push(f);
        return next;
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    const id = setInterval(refreshFull, 300_000);
    const onVisible = () => document.visibilityState === "visible" && Date.now() - lastFull.current > 60_000 && refreshFull();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, refreshFull]);

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
    for (const d of devices) if (d.first && now - d.first < 86_400_000 && insights?.since && now - insights.since > 3 * 86_400_000) out.push({ key: "d" + d.name, tag: "Nieuw", title: d.name, sub: `Nieuw apparaat in NextDNS, voor het eerst gezien om ${timeFmt.format(d.first)}` });
    for (const g of groups) if (g.susp && g.isNew && g.main && !g.bg) out.push({ key: "s" + g.d + g.dev + g.site, tag: "Verdacht", title: g.site, sub: `${g.dev} · ${g.susp}` });
    return out;
  }, [devices, groups, insights, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const flagged = useMemo(
    () => groups.filter((g) => g.flag || ctx.has(g.d + g.site + g.dev)).sort((a, b) => b.last - a.last),
    [groups, ctx]
  );

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    const id2 = setInterval(() => setClock(Date.now()), 10_000);
    return () => { clearInterval(id); clearInterval(id2); };
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
  const lastUse = useMemo(() => {
    const hits = new Map<string, { t: number; site: string; fgApp: boolean }[]>();
    const media = new Map<string, number>();
    const steady = new Map<string, number>();
    const human = new Map<string, number>(); // einde van de laatste sessie die als echt gebruik telt
    for (const g of groups) {
      const fgApp = (g.ss ?? []).some((x) => x.f !== undefined);
      // Afspeelsignalen (ook van achtergrond- of geblokkeerde adressen zoals Conviva) tellen altijd mee voor "er wordt gekeken".
      // Beeld/geluid van een app met achtergrondverkeer telt alleen als die sessie echt gebruik was (geen voorgeladen plaatje).
      // Op een tv telt beeld pas als er langer dan een minuut gekeken wordt (geen voorvertoning op het beginscherm).
      if (g.lm && (!fgApp || (g.ss?.[0] && isHuman(g.ss[0]))) && !(g.ss?.[0] && tvBlip(g.dev, g.ss[0])) && g.lm > (media.get(g.dev) ?? 0)) media.set(g.dev, g.lm);
      // Herkende apps (Facebook, WhatsApp, ...) tellen altijd mee; losse systeemdomeinen (apple.com, google.com) niet.
      if (!g.flag && (g.bg || !g.main || (isSystemSite(g.site) && isPlainSite(g)) || (g.bl ?? 0) >= g.n)) continue;
      for (const x of g.ss ?? []) {
        if (!isHuman(x) || tvBlip(g.dev, x)) continue;
        // Bij apps als Facebook/Instagram laadt scrollen niet elke minuut iets nieuws (alles staat al klaar): 5 minuten speling.
        const until = x.e + (fgApp ? 120_000 : 0);
        if (until > (human.get(g.dev) ?? 0)) human.set(g.dev, until);
        if (!MSG.test(g.site) && x.e - x.s >= 600_000 && (x.n ?? 0) >= 3 && x.e > (steady.get(g.dev) ?? 0)) steady.set(g.dev, x.e);
      }
      const a = hits.get(g.dev) ?? [];
      for (const t of g.ts ?? []) a.push({ t, site: g.site, fgApp });
      hits.set(g.dev, a);
    }
    return { hits, media, steady, human };
  }, [groups]);
  // In gebruik (per apparaat, niet per app):
  // - net een bezoek dat als echt gebruik telt (laatste 3 minuten), of langdurig spelen, of beeld/geluid (laatste 5 minuten);
  // - of activiteit in de laatste 3 minuten, verspreid over minstens 45 seconden, en de laatste minder dan 2 minuten geleden,
  //   met minstens 2 verschillende apps/sites (wisselen tussen apps = een mens), of 1 gewone site. Eén app die op de achtergrond
  //   ververst (Facebook, WhatsApp) doet alles binnen een paar seconden of blijft bij één app, en telt dus niet.
  const activeNow = (name: string) => {
    if (clock - (lastUse.media.get(name) ?? 0) < 300_000) return true;
    if (clock - (lastUse.steady.get(name) ?? 0) < 360_000) return true;
    if (clock - (lastUse.human.get(name) ?? 0) < 180_000) return true;
    const t = (lastUse.hits.get(name) ?? []).filter((x) => clock - x.t < 180_000);
    if (t.length < 3) return false;
    const hi = Math.max(...t.map((x) => x.t));
    if (clock - hi >= 120_000 || hi - Math.min(...t.map((x) => x.t)) < 45_000) return false;
    return new Set(t.map((x) => x.site)).size >= 2 || t.some((x) => !x.fgApp);
  };
  // Haal op wat er rond dit bezoek gebeurde (alle adressen van het apparaat in dat tijdvak).
  const loadDetail = (g: Group, rss: Session[], rk: string) => {
    if (details[rk]) return;
    const from = Math.min(...rss.map((x) => x.s)) - 30_000;
    const to = Math.max(...rss.map((x) => x.e)) + 30_000;
    const devId = Object.entries(deviceMap.current).find(([, label]) => label === g.dev)?.[0] ?? "";
    setDetails((d) => ({ ...d, [rk]: { state: "loading" } }));
    fetch(`/api/nextdns/detail?site=${encodeURIComponent(g.site)}&dev=${encodeURIComponent(devId)}&from=${from}&to=${to}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "mislukt");
        setDetails((d) => ({ ...d, [rk]: { state: "ok", data } }));
      })
      .catch(() => setDetails((d) => ({ ...d, [rk]: { state: "err" } })));
  };

  const silentNames = useMemo(() => new Set(silent.map((x) => x.name)), [silent]);

  // Samenvatting van vandaag voor het gekozen apparaat (of alle apparaten).
  const summary = useMemo(() => {
    const today = dayKeyFmt.format(Date.now());
    const devs = devices.filter((d) => !device || d.name === device);
    const ss = devs.flatMap((d) => d.ss ?? []);
    const mins = devs.reduce((n, d) => n + sumMin(d.ss ?? []), 0);
    const avg = devs.reduce((n, d) => n + (d.avg ?? 0), 0);
    const vis = groups.filter((g) => g.d === today && !g.bg && g.main && (!device || g.dev === device));
    const cats = new Map<string, number>();
    for (const g of vis) if ((g.mins ?? 0) > 0 && g.cat && g.cat !== "Overig") cats.set(g.cat, (cats.get(g.cat) ?? 0) + (g.mins ?? 0));
    const top = [...vis].filter((g) => (g.mins ?? 0) > 0).sort((a, b) => (b.mins ?? 0) - (a.mins ?? 0)).slice(0, 3);
    return {
      mins,
      avg,
      first: ss.length ? Math.min(...ss.map((x) => x.s)) : 0,
      last: ss.length ? Math.max(...ss.map((x) => x.e)) : 0,
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
    // Echt gebruik: geen sessie uit een geopende mail (de server markeert die; live aangevulde sessies controleren we hier).
    const human = (g: Group, x: Session) => isHuman(x) && !tvBlip(g.dev, x) && !(isPlainSite(g) && mailT.get(g.dev) && isMailSession(x, mailT.get(g.dev)!.esp, mailT.get(g.dev)!.mc));
    // Sessies van zichtbare sites per apparaat: een app zonder eigen www-adres (zoals Buienradar) telt alleen als er geen zichtbaar bezoek tegelijk speelde.
    const visSes = new Map<string, Session[]>();
    for (const g of groups) {
      if (g.bg || !g.main) continue;
      for (const x of g.ss ?? []) if (g.flag || g.susp || human(g, x)) (visSes.get(g.dev) ?? visSes.set(g.dev, []).get(g.dev)!).push(x);
    }
    const standalone = (g: Group, x: Session) =>
      (x.n ?? 0) >= 3 && !(visSes.get(g.dev) ?? []).some((v) => v.s <= x.e + 60_000 && v.e >= x.s - 60_000);
    for (const g of groups) {
      if ((device && g.dev !== device) || g.bg) continue;
      if (!g.main && (isSystemSite(g.site) || !(g.ss ?? []).some((x) => standalone(g, x)))) continue;
      if ((g.bl ?? 0) >= g.n && !g.flag) continue; // alles geblokkeerd door NextDNS: niet bezocht
      byDay.set(g.d, [...(byDay.get(g.d) ?? []), g]);
    }
    // Welke sessies van een site tellen als echt gebruik: één plek, zodat de lijst en het dagtotaal precies hetzelfde laten zien.
    const shown = (g: Group): Session[] => {
      const all = g.ss && g.ss.length ? g.ss : [{ s: g.last, e: g.last }];
      // Gemarkeerde en verdachte regels blijven altijd staan.
      const ss = all.filter((x) => (!cut || x.s >= cut) && (g.main ? g.flag || g.susp || ALWAYS_SHOW.has(g.site) || human(g, x) : standalone(g, x)));
      if (!isTv(g.dev) || ss.length < 2) return ss;
      // Op een tv is kijken één geheel: stukjes van dezelfde app met minder dan 15 minuten ertussen samenvoegen
      // (tijdens het kijken vraagt de tv maar af en toe iets op, waardoor er anders losse regels ontstaan).
      const out: Session[] = [];
      for (const x of [...ss].sort((a, b) => a.s - b.s)) {
        const last = out[out.length - 1];
        if (last && x.s - last.e <= 15 * 60_000) out[out.length - 1] = { ...last, e: Math.max(last.e, x.e), n: (last.n ?? 1) + (x.n ?? 1), m: (last.m ?? 0) + (x.m ?? 0) };
        else out.push({ ...x });
      }
      return out.reverse();
    };
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([d, list]) => {
        const per = list.map((g) => ({ g, ss: shown(g) })).filter((x) => x.ss.length);
        // Actieve minuten van de dag: per apparaat de echte-gebruik-sessies samengevoegd (overlappende apps niet dubbel).
        const byDev = new Map<string, Session[]>();
        for (const { g, ss } of per) byDev.set(g.dev, [...(byDev.get(g.dev) ?? []), ...ss]);
        let mins = 0;
        for (const ss of byDev.values()) {
          const iv = ss.map((x) => [x.s, x.e]).sort((p, q) => p[0] - q[0]);
          let cs = -1, ce = -1;
          for (const [s0, e0] of iv) {
            if (s0 > ce) { if (ce > cs) mins += (ce - cs) / 60_000; cs = s0; ce = e0; } else ce = Math.max(ce, e0);
          }
          if (ce > cs) mins += (ce - cs) / 60_000;
        }
        return {
          d,
          list: per.map((x) => x.g),
          mins: Math.round(mins),
          // Elk bezoek (sessie) is een eigen regel, nieuwste bovenaan: zo bouwt de dag zich op in de volgorde van wat er gebeurde.
          rows: mergeRows(
            per
              .flatMap(({ g, ss }) => {
                const all = g.ss && g.ss.length ? g.ss : [{ s: g.last, e: g.last }];
                const oldest = Math.min(...all.map((x) => x.s));
                return ss.map((x) => ({ g, t: x.s, ss: [x], compact: false, first: x.s === oldest && (g.sc ?? all.length) <= all.length, newest: x.e === Math.max(...ss.map((y) => y.e)) }));
              })
              .sort((a, b) => b.t - a.t)
          ),
        };
      })
      .filter((d) => d.rows.length > 0);
  }, [groups, device, mailT, cut]);

  return (
    <main>
      {state === "error" && <p className="err">{error}</p>}
      {state === "ready" && live === "fail" && <p className="err">Live bijwerken lukt niet: {liveError}</p>}
      {state === "loading" && (
        // Skeleton (zoals iPhone-apps): de vorm van de pagina met grijze vlakken en een zachte glans, tot de gegevens er zijn.
        <div className="skel" role="progressbar" aria-label="Gegevens laden" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="skel-ring">
            <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden>
              <circle cx="50" cy="50" r="44" className="ring-bg" />
              <circle cx="50" cy="50" r="44" className="ring" style={{ strokeDasharray: 276.46, strokeDashoffset: 276.46 * (1 - progress) }} />
            </svg>
            <div className="pct">{Math.round(progress * 100)}%</div>
          </div>
          <div className="skel-chips">
            {[44, 84, 96, 70, 92].map((w, i) => <span key={i} className="sk sk-chip" style={{ width: w }} />)}
          </div>
          <div className="skel-head"><span className="sk" style={{ width: 84, height: 14 }} /><span className="sk" style={{ width: 30, height: 24, borderRadius: 99 }} /></div>
          <div className="list skel-list">
            {[62, 48, 70, 55, 66, 44, 58, 52].map((w, i) => (
              <div key={i} className="item skel-item">
                <span className="sk sk-icon" />
                <div className="main"><span className="sk" style={{ width: `${w}%`, height: 15 }} /><span className="sk" style={{ width: `${w / 2 + 12}%`, height: 12, marginTop: 8 }} /></div>
                <span className="sk" style={{ width: 52, height: 15 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {state === "ready" && (
        <>
          <div className="bar">
            <div className="bar-in">
            <div className="chips">
              <button className={"chip" + (device === null ? " on" : "")} onClick={() => setDevice(null)}>Alle</button>
              {/* Apparaten die in gebruik zijn staan links (naast Alle), de rest rechts; binnen elke groep blijft de volgorde gelijk. */}
              {[...devices.filter((d) => activeNow(d.name)), ...devices.filter((d) => !activeNow(d.name))].map((d) => (
                <button key={d.name} className={"chip" + (device === d.name ? " on" : "") + (activeNow(d.name) ? " act" : " idle")} title={activeNow(d.name) ? "Nu in gebruik" : "Niet in gebruik"} onClick={() => setDevice(d.name)}>
                  {silentNames.has(d.name) && "⚠ "}<DevIcon name={d.name} />{d.name}
                                  </button>
              ))}
            </div>
            {flagged.length + silent.length + extraAlerts.length > 0 && (
              <button className="bang" onClick={() => setOpen(true)} aria-label={`${flagged.length + silent.length + extraAlerts.length} waarschuwingen bekijken`} title="Waarschuwingen bekijken">
                !<span className="count">{flagged.length + silent.length + extraAlerts.length}</span>
              </button>
            )}
            </div>
          </div>


          {(summary.blocked > 0 || (device && silentNames.has(device))) && (
            <div className="summary">
              {summary.blocked > 0 && <div className="s-warn">🚫 {summary.blocked}× een geblokkeerde 18+/dating-site geprobeerd te openen</div>}
              {device && silentNames.has(device) && <div className="s-warn">⚠ Ongewoon lang niets doorgegeven: uitgezet, offline of filtering omzeild?</div>}
            </div>
          )}

          {days.length === 0 && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list, mins: dm, rows: trows }, di) => {
            const rows = trows;
            const today = dayKeyFmt.format(Date.now());
            const recent = d === today; // alleen vandaag staat open; gisteren en ouder zijn ingeklapt
            // Nog niets vandaag (net na middernacht): de bovenste dag blijft gewoon open staan; inklappen kan wel.
            const autoOpen = di === 0 && !recent;
            const key = autoOpen ? d + "!" : d; // eigen sleutel: dichtklappen nu laat de dag later niet ineens open staan
            const isDayOpen = recent || (autoOpen ? !openDays.has(key) : openDays.has(key));
            return (
            <section key={d}>
              <h2
                className={recent ? "" : "fold"}
                onClick={recent ? undefined : () => setOpenDays((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                role={recent ? undefined : "button"}
                aria-expanded={recent ? undefined : isDayOpen}
              >
                {dayLabel(d)}{!recent && <span className="muted"> · {list.length} {list.length === 1 ? "site" : "sites"}{dm > 0 ? ` · ${dur(dm)} actief` : ""}</span>}
                {di === 0 && (
                  <button
                    className={"dview icon" + (goOpen ? " on" : "")}
                    onClick={(e) => { e.stopPropagation(); setGoOpen((v) => !v); if (!goDay) setGoDay(days[0].d); }}
                    aria-expanded={goOpen}
                    aria-label="Ga naar dag en tijd"
                    title="Ga naar dag en tijd"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="5" width="18" height="16" rx="3" />
                      <path d="M3 10h18M8 3v4M16 3v4" />
                    </svg>
                  </button>
                )}
                {!recent && <span className={"fold-chev" + (isDayOpen ? " up" : "")} aria-hidden>›</span>}
              </h2>
          {di === 0 && goOpen && (
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
              {isDayOpen && (
              <div className="list">
                {(() => {
                  return rows.map(({ g, t, first, newest, compact, ss: rss }, ri) => {
                  // Elke regel toont rechts een klein apparaat-icoon (op alle tabs); een dun lijntje staat waar het apparaat wisselt.
                  const devChange = !device && ri > 0 && rows[ri - 1].g.dev !== g.dev;
                  // Subtiele uurmarkering waar het uur wisselt.
                  const hr = hourOf(t);
                  // Tijdgrens tussen twee uren, bijv. "17:00" tussen 17:05 en 16:41. Bovenaan de dag staat geen streep.
                  const hourStart = !compact && ri > 0 && hourOf(rows[ri - 1].t) !== hr && dayKeyFmt.format(rows[ri - 1].t) === dayKeyFmt.format(t);
                  // Het label is het einde van het uur van de regels eronder: boven 21:57 en 21:21 staat "22:00" (daaronder 21:00–22:00),
                  // ook als er in het uur daarna niets gebeurde.
                  const boundary = (hr + 1) % 24;
                  const key = g.d + g.site + g.dev;
                  const rowKey = key + ":" + t;
                  const isOpen = expanded === rowKey;
                  return (
                    <div key={rowKey} data-rk={rowKey} className={(devChange ? "devchange" : "") + (hourStart ? " hourstart" : "")}>
                      {hourStart && <div className="hourmark"><span>{String(boundary).padStart(2, "0")}:00</span></div>}
                      <div
                        className={"item clickable" + (g.flag || ctx.has(key) ? " adult" : soft.has(key) ? " near-flag" : "") + (newest && g.flash && Date.now() - g.flash < 4000 ? " fresh" : "") + (gotoKey === rowKey ? " goto-hit" : "")}
                        onClick={() => { setExpanded(isOpen ? null : rowKey); if (!isOpen) loadDetail(g, rss, rowKey); }}
                        role="button"
                        aria-expanded={isOpen}
                      >
                        {g.flag ? <span className="fav badge">{g.flag === "18+" ? "18+" : g.flag === "Dating" ? "♥" : g.flag === "VPN/proxy" ? "VPN" : g.flag === "Geblokkeerd" ? "🚫" : "!"}</span> : <Favicon domain={g.icon} name={g.name} />}
                        <div className="main">
                          <div className="name">{g.name}{g.isNew && first && <span className="newtag">Nieuw</span>}</div>
                          {(() => {
                            // Tweede regel: apparaat en duur, rustig en grijs; waarschuwingen erachter.
                            const m = rss.reduce((n, x) => n + minutes(x), 0);
                            const parts: React.ReactNode[] = [];
                            parts.push(<span key="d" className="mdev" title={g.dev}><DevIcon name={g.dev} />{g.dev}</span>);
                            if (m > 0) parts.push(<span key="m" className="mdur">{dur(m)}</span>);
                            if (g.flag && g.flag !== "18+" && g.flag !== "Dating") parts.push(<span key="f">{g.flag}{(g.bl ?? 0) > 0 && ` (${g.bl}× geblokkeerd)`}</span>);
                            if (ctx.has(key)) parts.push(<span key="c">⚠ rond dit bezoek: {ctx.get(key)}</span>);
                            else if (soft.has(key)) parts.push(<span key="s">⚠ rond 18+: {soft.get(key)}</span>);
                            return <div className="sub meta">{parts.flatMap((x, i) => (i ? [<span key={"s" + i} className="msep">·</span>, x] : [x]))}</div>;
                          })()}
                        </div>
                        <div className="time">
                          {(() => {
                            if (!t) return <span className="tcol">–</span>;
                            // Nog bezig (laatste activiteit < 3 min geleden) = "nu" in groen; anders gerekend vanaf het begin, net als de volgorde.
                            const end = Math.max(t, ...rss.map((x) => x.e));
                            const span = `${timeFmt.format(t)}${end - t >= 60_000 ? `–${timeFmt.format(end)}` : ""}`;
                            if (clock - end < 180_000) return <span className="tcol reltime nowtag" title={span}>nu</span>;
                            const age = Math.floor((clock - t) / 60_000);
                            if (age < 30) return <span className="tcol reltime" title={span}>{age} min geleden</span>;
                            return <span className="tcol" title={span}>{timeFmt.format(t)}</span>;
                          })()}
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
                            {!compact && rss.length > 1 && (
                              <>
                                <div className="dh">Bezoeken</div>
                                {[...rss].sort((a, b) => b.s - a.s).map((x) => (
                                  <div className="hostrow" key={x.s}>
                                    <span className="hn">{timeFmt.format(x.s)}{x.e - x.s >= 60_000 ? `–${timeFmt.format(x.e)}` : ""}</span>
                                    <span className="hc">{minutes(x) > 0 ? dur(minutes(x)) : "kort"}</span>
                                  </div>
                                ))}
                              </>
                            )}
                            {(() => {
                              const det = details[rowKey];
                              if (!det || det.state === "loading") return <div className="sub hosthint">Laden…</div>;
                              if (det.state === "err" || !det.data) return <div className="sub hosthint">Details laden lukt nu niet.</div>;
                              const dd = det.data;
                              const more = showOther.has(rowKey);
                              const row = (x: { h: string; n: number; b: number }) => (
                                <div className="hostrow" key={x.h}>
                                  <span className="hn">{x.h}</span>
                                  <span className="hc">{x.b >= x.n ? "geblokkeerd" : `${x.n}×${x.b > 0 ? ` (${x.b} geblokkeerd)` : ""}`}</span>
                                </div>
                              );
                              return (
                                <>
                                  {dd.matched.length > 0 && (
                                    <>
                                      <div className="dh">Wat er binnen {g.name} gebeurde</div>
                                      {dd.matched.map(row)}
                                      {dd.matchedTotal > dd.matched.length && <div className="sub hosthint">+ {dd.matchedTotal - dd.matched.length} andere adressen</div>}
                                    </>
                                  )}
                                  {dd.other.length > 0 && (
                                    <>
                                      <button className="more-link" onClick={() => setShowOther((p) => { const n = new Set(p); if (n.has(rowKey)) n.delete(rowKey); else n.add(rowKey); return n; })}>
                                        Ook op dat moment ({dd.otherTotal}) {more ? "‹" : "›"}
                                      </button>
                                      {more && dd.other.map(row)}
                                      {more && dd.otherTotal > dd.other.length && <div className="sub hosthint">+ {dd.otherTotal - dd.other.length} andere adressen</div>}
                                    </>
                                  )}
                                  {dd.capped && <div className="sub hosthint">Alleen een deel van de verzoeken getoond (lang bezoek).</div>}
                                </>
                              );
                            })()}
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
                  });
                })()}
              </div>
              )}
            </section>
            );
          })}
          {/* Alleen het laatste uur staat er: de rest van vandaag laadt nog (zelfde glans als het skelet). */}
          {cut > 0 && (
            <div className="list skel-list skel-more" aria-label="Eerder vandaag laden">
              {[58, 44, 66, 50].map((w, i) => (
                <div key={i} className="item skel-item">
                  <span className="sk sk-icon" />
                  <div className="main"><span className="sk" style={{ width: `${w}%`, height: 15 }} /><span className="sk" style={{ width: `${w / 2 + 12}%`, height: 12, marginTop: 8 }} /></div>
                  <span className="sk" style={{ width: 52, height: 15 }} />
                </div>
              ))}
            </div>
          )}
          {/* Oudere dagen worden nog geladen: rustige grijze dagkopjes met dezelfde glans als het skelet. */}
          {!full && !histErr && (
            <div className="skel-days" aria-label="Oudere dagen laden">
              {[150, 190, 170].map((w, i) => <div key={i} className="skel-day"><span className="sk" style={{ width: w, height: 14 }} /><span className="sk" style={{ width: 14, height: 14 }} /></div>)}
            </div>
          )}
          {histErr && <p className="muted skel-err">Oudere dagen laden lukt nu even niet; vandaag is wel compleet.</p>}
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
