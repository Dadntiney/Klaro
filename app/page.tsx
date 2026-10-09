"use client";

import { useEffect, useMemo, useState } from "react";

interface Group {
  d: string;
  dev: string;
  site: string;
  name: string;
  icon: string;
  last: number;
  n: number;
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

  useEffect(() => {
    fetch("/api/nextdns")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        setGroups(data.groups);
        setDevices(data.devices);
        setTotal(data.total);
        setUpdated(new Date());
        setState("ready");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  }, []);

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
          {state === "ready" && `${total.toLocaleString("nl-NL")} DNS-verzoeken · ${devices.length} apparaten · bijgewerkt om ${timeFmt.format(updated!)}`}
          {state === "error" && "Ophalen mislukt"}
        </p>
      </header>

      {state === "error" && <p className="err">{error}</p>}
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
                  <div className="item" key={g.site + g.dev}>
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
