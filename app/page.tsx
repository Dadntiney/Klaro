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
  main?: boolean;
  flag?: string;
  ts?: number[];
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
}
interface Device {
  name: string;
  n: number;
}

/** Zoekmachines en beeldzoekers: bij een 18+-adres kort erna/ervoor markeren we ook deze regel. */
const isSearch = (site: string) => /^google\.[a-z.]+$/.test(site) || ["bing.com", "duckduckgo.com", "ecosia.org", "yahoo.com", "startpage.com", "qwant.com", "yandex.com", "brave.com", "pinterest.com", "pinterest.nl"].includes(site);

const tz = "Europe/Amsterdam";
const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: tz });
const timeSecFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
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
/** Twee korte tonen (660 en 880 Hz) als WAV, zodat er geen geluidsbestand nodig is. */
function beepDataUri(): string {
  const rate = 22050;
  const tone = (f: number, sec: number) =>
    Array.from({ length: Math.floor(rate * sec) }, (_, i) => {
      const t = i / rate;
      const env = Math.min(1, t / 0.01, (sec - t) / 0.03); // korte in- en uitfade tegen klikjes
      return Math.sin(2 * Math.PI * f * t) * 0.6 * Math.max(0, env);
    });
  const samples = [...tone(660, 0.14), ...new Array(Math.floor(rate * 0.03)).fill(0), ...tone(880, 0.18)];
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
          } else byKey.set(key, { d, dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, main: e.main, flag: e.flag, ts: [e.t] });
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

  // Geluid staat altijd aan. Een gewoon <audio>-element (met een zelfgemaakte piep) is op iPhone betrouwbaarder dan
  // Web Audio: het wordt niet gedempt door de stilteschakelaar en blijft na één ontgrendeling bruikbaar.
  const unlocked = useRef(false);
  useEffect(() => {
    try {
      // iOS 16.4+: geluid van de pagina telt als "afspelen" (niet als beltoon), dus ook hoorbaar met stille modus.
      (navigator as unknown as { audioSession?: { type: string } }).audioSession && ((navigator as unknown as { audioSession: { type: string } }).audioSession.type = "playback");
    } catch {}
    const el = new Audio(beepDataUri());
    el.preload = "auto";
    sound.current = el;
    const unlock = () => {
      if (unlocked.current) return;
      // Moet binnen een klik/aanraking: één keer stil afspelen, daarna mag de pagina zelf geluid starten.
      el.muted = true;
      el.play()
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          unlocked.current = true;
        })
        .catch(() => { el.muted = false; });
    };
    // iOS telt alleen touchend/click/keydown als gebaar (niet touchstart/pointerdown).
    const events = ["click", "touchend", "keydown"] as const;
    events.forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, unlock));
  }, []);

  const beep = useCallback(() => {
    const el = sound.current;
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
    if (events.some((e) => !e.bg && e.main && (!deviceRef.current || deviceMap.current[e.devId] === deviceRef.current))) beep();
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
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1, last: Math.max(next[i].last, e.t), main: next[i].main || e.main, ts: [e.t, ...(next[i].ts ?? [])].slice(0, 8), flash: Date.now() };
        else next.push({ d, dev: e.dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, adult: e.adult, main: e.main, flag: e.flag, ts: [e.t], flash: Date.now() });
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

  // Live: na elk antwoord (±0,5 s) 1 seconde wachten en opnieuw vragen: ruim binnen de limiet van NextDNS.
  useEffect(() => {
    if (state !== "ready") return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const visible = document.visibilityState === "visible";
      if (visible) await poll();
      const delay = !visible ? 3000 : liveFailedRef.current ? 15000 : 1000; // verborgen tabblad rustig, bij fouten (bijv. rate limit) afremmen
      timer = setTimeout(tick, delay);
    };
    tick();
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
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
                        {g.flag ? <span className="fav badge">{g.flag === "18+" ? "18+" : "♥"}</span> : <Favicon domain={g.icon} />}
                        <div className="main">
                          <div className="name">{g.name}</div>
                          <div className="sub">{g.name !== g.site ? g.site + " · " : ""}{g.dev}{ctx.has(key) && <> · ⚠ rond dit bezoek: {ctx.get(key)}</>}{!ctx.has(key) && soft.has(key) && <> · ⚠ rond 18+: {soft.get(key)}</>}</div>
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
                            <div className="dh">Bezocht om</div>
                            <div className="timelist">
                              {(g.ts ?? [g.last]).map((t) => (
                                <div key={t}>{timeSecFmt.format(t)}</div>
                              ))}
                            </div>
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
            <p className="muted">Gemarkeerde sites (18+ en dating) in de logs, nieuwste eerst.</p>
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
