"use client";

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

function Favicon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="fav fallback">{name[0]?.toUpperCase()}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="fav"
      alt=""
      width={28}
      height={28}
      loading="lazy"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      onError={() => setFailed(true)}
    />
  );
}

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [device, setDevice] = useState<string | null>(null);
  const [showBg, setShowBg] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [live, setLive] = useState<"ok" | "fail">("ok");
  const [liveError, setLiveError] = useState("");
  const lastSeen = useRef(0);
  const deviceMap = useRef<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/nextdns")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        setGroups(data.groups);
        setDevices(data.devices);
        setTotal(data.total);
        deviceMap.current = data.deviceMap ?? {};
        lastSeen.current = Math.max(0, ...(data.groups as Group[]).map((g) => g.last));
        setUpdated(new Date());
        setState("ready");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/nextdns/live?since=${lastSeen.current}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Live mislukt");
      const events = (data.events as Event[]).sort((a, b) => a.t - b.t);
      setLive("ok");
      setUpdated(new Date());
      if (!events.length) return;
      lastSeen.current = Math.max(lastSeen.current, ...events.map((e) => e.t));
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
          else next.push({ d, dev: e.dev, site: e.site, name: e.name, icon: e.icon, last: e.t, n: 1, bg: e.bg, flash: Date.now() });
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
    } catch (e) {
      setLive("fail");
      setLiveError((e as Error).message);
    }
  }, []);

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

  const days = useMemo(() => {
    const byDay = new Map<string, Group[]>();
    for (const g of groups) {
      if ((device && g.dev !== device) || (!showBg && g.bg)) continue;
      byDay.set(g.d, [...(byDay.get(g.d) ?? []), g]);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([d, list]) => ({ d, list: list.sort((a, b) => b.last - a.last) }));
  }, [groups, device, showBg]);

  return (
    <main>
      <header>
        <h1>Bezochte websites &amp; apps</h1>
        <p className="muted">
          {state === "loading" && "Logs ophalen van NextDNS…"}
          {state === "ready" && (
            <>
              <span className={"dot " + live} /> {live === "ok" ? "Live" : "Live niet beschikbaar"} · {total.toLocaleString("nl-NL")} DNS-verzoeken · {devices.length} apparaten · bijgewerkt om {timeFmt.format(updated!)}
            </>
          )}
          {state === "error" && "Ophalen mislukt"}
        </p>
      </header>

      {state === "error" && <p className="err">{error}</p>}
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
            <label className="toggle">
              <input type="checkbox" checked={showBg} onChange={(e) => setShowBg(e.target.checked)} />
              Toon ook achtergrondverkeer
            </label>
          </div>

          {days.length === 0 && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list }) => (
            <section key={d}>
              <h2>{dayLabel(d)} <span className="muted">· {list.length}</span></h2>
              <div className="list">
                {list.map((g) => (
                  <div className={"item" + (g.flash && Date.now() - g.flash < 4000 ? " fresh" : "")} key={g.site + g.dev}>
                    <Favicon domain={g.icon} name={g.name} />
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
    </main>
  );
}
