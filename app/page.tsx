"use client";

import { labelDevices } from "@/lib/names";
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
  flag?: string;
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
  flag?: string;
}
interface Device {
  name: string;
  n: number;
}

const tz = "Europe/Amsterdam";
const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: tz });
const dayLabelFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: tz });

function dayLabel(d: string) {
  if (d === "onbekend") return "Datum onbekend";
  const today = Date.now();
  if (d === dayKeyFmt.format(today)) return "Vandaag";
  if (d === dayKeyFmt.format(today - 86400_000)) return "Gisteren";
  const label = dayLabelFmt.format(new Date(d + "T12:00:00Z"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Favicon, of niets (een leeg vakje voor de uitlijning) als de site er geen heeft. */
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
  const audio = useRef<AudioContext | null>(null);
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
          } else byKey.set(key, { d, dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, flag: e.flag });
          counts.set(dev, (counts.get(dev) ?? 0) + 1);
        }
        deviceMap.current = map;
        lastSeen.current = Math.max(...data.events.map((e) => e.t));
        setGroups([...byKey.values()]);
        setDevices([...counts].map(([name, n]) => ({ name, n })));
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

  // Geluid staat altijd aan. Browsers staan het pas toe na een interactie: we proberen het direct
  // en ontgrendelen het stil bij de eerste klik, toets of aanraking.
  useEffect(() => {
    const unlock = () => {
      audio.current ??= new AudioContext();
      audio.current.resume().catch(() => {});
    };
    unlock();
    const events = ["pointerdown", "click", "keydown", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, unlock));
    return () => events.forEach((ev) => window.removeEventListener(ev, unlock));
  }, []);

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.start(t);
      o.stop(t + 0.12);
    });
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
    if (events.some((e) => !e.bg && (!deviceRef.current || deviceMap.current[e.devId] === deviceRef.current))) beep();
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
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1, last: Math.max(next[i].last, e.t), flash: Date.now() };
        else next.push({ d, dev: e.dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, flag: e.flag, flash: Date.now() });
      }
      return next;
    });
    setDevices((prev) => {
      const next = [...prev];
      for (const e of events) {
        const dev = deviceMap.current[e.devId];
        const i = next.findIndex((x) => x.name === dev);
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1 };
        else next.push({ name: dev, n: 1 });
      }
      return next;
    });
  }, [beep]);

  // Vangnet: elke 10 seconden controleren, voor het geval de rechtstreekse stroom niet werkt.
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

  // Rechtstreekse stroom: elk nieuw verzoek komt direct binnen.
  useEffect(() => {
    if (state !== "ready") return;
    const es = new EventSource("/api/nextdns/stream");
    es.onmessage = (m) => {
      try {
        applyEvents([JSON.parse(m.data) as Event]);
        setLive("ok");
      } catch {}
    };
    return () => es.close();
  }, [state, applyEvents]);

  useEffect(() => {
    if (state !== "ready") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 10_000);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, poll]);

  // Alle 18+/WhatsApp-bezoeken in de logs (ongeacht apparaat of filter), nieuwste eerst.
  const flagged = useMemo(() => groups.filter((g) => g.flag).sort((a, b) => b.last - a.last), [groups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const days = useMemo(() => {
    const byDay = new Map<string, Group[]>();
    for (const g of groups) {
      if ((device && g.dev !== device) || g.bg) continue;
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
          {flagged.length > 0 && (
            <button className="bang" onClick={() => setOpen(true)} aria-label={`${flagged.length} waarschuwingen bekijken`} title="Waarschuwingen bekijken">
              !<span className="count">{flagged.length}</span>
            </button>
          )}
        </div>
        <p className="muted">
          {state === "loading" && "Logs ophalen van NextDNS…"}
          {state === "ready" && (
            <>
              <span className={"dot " + live} /> {live === "ok" ? "Live" : "Live niet beschikbaar"} · {total.toLocaleString("nl-NL")} DNS-verzoeken · {devices.length} {devices.length === 1 ? "apparaat" : "apparaten"} · bijgewerkt om {timeFmt.format(updated!)}
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
              <button className={"chip" + (device === null ? " on" : "")} onClick={() => setDevice(null)}>Alle apparaten</button>
              {devices.map((d) => (
                <button key={d.name} className={"chip" + (device === d.name ? " on" : "")} onClick={() => setDevice(d.name)}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          {days.length === 0 && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list }) => (
            <section key={d}>
              <h2>{dayLabel(d)} <span className="muted">· {list.length}</span></h2>
              <div className="list">
                {list.map((g) => (
                  <div className={"item" + (g.flag ? " adult" : "") + (g.flash && Date.now() - g.flash < 4000 ? " fresh" : "")} key={g.site + g.dev}>
                    {g.adult ? <span className="fav badge">18+</span> : <Favicon domain={g.icon} />}
                    <div className="main">
                      <div className="name">{g.name}</div>
                      <div className="sub">{g.name !== g.site ? g.site + " · " : ""}{g.dev}</div>
                    </div>
                    <div className="meta">
                      <div className="time">{g.last ? timeFmt.format(g.last) : "–"}</div>
                      <div className="sub">{g.n}×</div>
                    </div>
                  </div>
                ))}
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
            <p className="muted">18+ content en WhatsApp in de logs, nieuwste eerst.</p>
            {flagged.map((g) => (
              <div className="hit" key={g.d + g.dev + g.site}>
                <span className="tag">{g.flag}</span>
                <div className="main">
                  <div className="name">{g.name}</div>
                  <div className="sub">{g.dev} · laatst {dayLabel(g.d).toLowerCase()} om {timeFmt.format(g.last)}</div>
                </div>
                <div className="sub">{g.n}×</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
