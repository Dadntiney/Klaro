"use client";

import { useEffect, useState } from "react";

interface LogRow {
  t: number;
  host: string;
  device: string;
}

const PAGE = 200;
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Amsterdam" });
const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Amsterdam" });

function Favicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="fav fallback">{host[0]?.toUpperCase()}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="fav"
      alt=""
      width={20}
      height={20}
      loading="lazy"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      onError={() => setFailed(true)}
    />
  );
}

export default function Home() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetch("/api/nextdns")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        setRows(data.rows);
        setTotal(data.total);
        setUpdated(new Date());
        setState("ready");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  }, []);

  return (
    <main>
      <header>
        <h1>DNS-overzicht</h1>
        <p className="muted">
          {state === "loading" && "Logs ophalen van NextDNS…"}
          {state === "ready" && `${total.toLocaleString("nl-NL")} bezoeken · bijgewerkt om ${timeFmt.format(updated!)}`}
          {state === "error" && "Ophalen mislukt"}
        </p>
      </header>

      {state === "error" && <p className="err">{error}</p>}
      {state === "loading" && <div className="loader" aria-label="Laden" />}

      {state === "ready" && (
        <>
          <div className="table">
            <div className="tr th">
              <span>Datum</span>
              <span>Tijd</span>
              <span>Website</span>
              <span>Apparaat</span>
            </div>
            {rows.slice(0, shown).map((r, i) => (
              <div className="tr" key={i}>
                <span className="date">{r.t ? dateFmt.format(r.t) : "–"}</span>
                <span className="time">{r.t ? timeFmt.format(r.t) : "–"}</span>
                <span className="site">
                  <Favicon host={r.host} />
                  <span className="host">{r.host}</span>
                </span>
                <span className="device">{r.device}</span>
              </div>
            ))}
            {rows.length === 0 && <p className="muted pad">Geen logs gevonden.</p>}
          </div>
          {shown < rows.length && (
            <button className="more" onClick={() => setShown(shown + PAGE)}>
              Toon meer ({Math.min(PAGE, rows.length - shown)} van {rows.length - shown} resterend)
            </button>
          )}
          {total > rows.length && <p className="muted">Alleen de nieuwste {rows.length.toLocaleString("nl-NL")} van {total.toLocaleString("nl-NL")} worden getoond.</p>}
        </>
      )}
    </main>
  );
}
