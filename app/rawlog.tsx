"use client";

import { apiFetch } from "@/lib/browser-api";
import { baseDomain } from "@/lib/parse";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event } from "./types";
import { dayKeyFmt, dayLabel, timeFmt, timeSecFmt } from "./ui";
import { MiniFav, logoDomain, CalendarIcon, OutIcon, LogIcon } from "./icons";

/**
 * De regels zoals NextDNS ze binnenkrijgt (nieuwste bovenaan), zonder filter: zo hoeft niemand naar my.nextdns.io.
 * Bovenaan komen ze live binnen; daaronder alles uit de volledige download: zoeken in alle dagen, verder terugbladeren en
 * naar een dag en tijd springen (zie lib/rawlog.ts). Rood streepje = door NextDNS geblokkeerd; rode regel = Klaro-vangnet.
 */
export const longFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
/** Volledige tijd zoals NextDNS: "18 oktober 2026 om 10:27:26". */
export function longWhen(t: number) {
  return `${longFmt.format(t)} om ${timeSecFmt.format(t)}`;
}
/** Tijd bij een opengeklapte regel: t/m 30 minuten relatief ("15 minuten geleden"), daarna de kloktijd. */
export function when(t: number, now = Date.now()) {
  const s = (now - t) / 1000;
  if (s < 45) return "een paar seconden geleden";
  if (s < 90) return "een minuut geleden";
  if (s < 30.5 * 60) return `${Math.round(s / 60)} minuten geleden`;
  return dayKeyFmt.format(t) === dayKeyFmt.format(now) ? `vandaag om ${timeSecFmt.format(t)}` : longWhen(t);
}
/** Kopiëren als de klembordfunctie ontbreekt (oudere browsers). */
export function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch {}
  ta.remove();
}

export function RawLog({ rows, devName, devIds, device, onClose, status, outside, onOutside, awayAt, lastAway }: { rows: Event[]; devName: (id: string) => string; devIds: string[] | null; device: string | null; onClose: () => void; status?: React.ReactNode; outside: boolean; onOutside: () => void; awayAt: (dev: string, t: number) => boolean; lastAway: number | null }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState<number | null>(null); // gesprongen naar dit moment: regels van daarvoor
  const [calOpen, setCalOpen] = useState(false);
  const [calDay, setCalDay] = useState(() => dayKeyFmt.format(Date.now()));
  const [calTime, setCalTime] = useState("10:00");
  const [older, setOlder] = useState<Event[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [range, setRange] = useState<{ since: number; until: number } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null); // opengeklapte regel (details)
  const [menuKey, setMenuKey] = useState<string | null>(null); // ⋮-menu open bij deze regel
  const [copied, setCopied] = useState<string | null>(null); // net gekopieerd (korte bevestiging)
  const copy = (text: string, key: string) => {
    const done = () => { setCopied(key); setMenuKey(null); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); };
    if (navigator.clipboard) void navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  };
  const req = useRef(0);
  const devKey = devIds?.join(",") ?? "";
  const load = useCallback(async (before: number | null, append: boolean) => {
    const id = ++req.current;
    setBusy(true);
    setErr("");
    const p = new URLSearchParams({ q: q.trim().toLowerCase() });
    if (devKey) p.set("devs", devKey);
    if (before !== null) p.set("before", String(before));
    try {
      const d = (await (await apiFetch(`/api/nextdns/raw?${p}`)).json()) as { events?: Event[]; more?: boolean; since?: number; until?: number; error?: string };
      if (id !== req.current) return;
      if (d.error || !d.events) { setErr(d.error ?? "Ophalen lukte niet."); return; }
      setOlder((prev) => (append ? [...prev, ...d.events!] : d.events!));
      setMore(!!d.more);
      if (d.since) setRange({ since: d.since, until: d.until ?? 0 });
    } catch {
      if (id === req.current) setErr("Ophalen lukte niet.");
    } finally {
      if (id === req.current) setBusy(false);
    }
  }, [q, devKey]);
  useEffect(() => {
    const t = setTimeout(() => load(at, false), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, at, q]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const live = at !== null ? [] : rows.filter((e) => (!device || devName(e.devId) === device) && (!needle || (e.host ?? "").includes(needle)));
    const seen = new Set<string>();
    const out: Event[] = [];
    for (const e of [...live, ...older]) {
      const k = `${e.t}|${e.devId}|${e.host}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    // Filter "buiten de deur" (zelfde als in het overzicht): alleen regels van momenten buiten de wifi thuis.
    return (outside ? out.filter((e) => awayAt(devName(e.devId), e.t)) : out).sort((a, b) => b.t - a.t);
  }, [rows, older, at, device, devName, needle, outside, awayAt]);
  const oldest = shown.length ? shown[shown.length - 1].t : null;
  // Filter "buiten de deur" aan: meteen naar het laatste moment buiten de deur springen (de nieuwste regels zijn meestal van thuis),
  // en zolang er weinig te zien is vanzelf oudere regels bijladen (hooguit 10 keer).
  const fills = useRef(0);
  useEffect(() => {
    fills.current = 0;
    if (outside && lastAway) setAt(lastAway + 60_000);
    else if (!outside) setAt(null);
  }, [outside, lastAway]);
  const oldestAll = older.length ? Math.min(...older.map((e) => e.t)) : null;
  useEffect(() => {
    if (!outside || busy || !more || shown.length >= 30 || fills.current >= 10 || oldestAll === null) return;
    fills.current++;
    void load(oldestAll, true);
  }, [outside, busy, more, shown.length, oldestAll, load]);
  return (
    <section>
      <h2>
        <span className="dh-t"><span className="dh-d">{at === null ? "Live van NextDNS" : "NextDNS"}</span></span>
        <span className="dpair">
          <button className="dview icon on" onClick={onClose} aria-label="Terug naar het overzicht" title="Terug naar het overzicht"><LogIcon /></button>
          <button className={"dview icon" + (outside ? " on" : "")} onClick={onOutside} aria-pressed={outside} aria-label="Alleen niet via thuis-wifi (mobiele data of een andere wifi)" title="Alleen niet via thuis-wifi"><OutIcon /></button>
          <button className={"dview icon" + (calOpen ? " on" : "")} onClick={() => setCalOpen((v) => !v)} aria-expanded={calOpen} aria-label="Ga naar dag en tijd" title="Ga naar dag en tijd"><CalendarIcon /></button>
          <span className="dstat">{status}</span>
        </span>
      </h2>
      {calOpen && (
        <form
          className="goto"
          onSubmit={(e) => {
            e.preventDefault();
            const t = new Date(`${calDay}T${calTime || "00:00"}:00`).getTime();
            if (!Number.isFinite(t)) return;
            setAt(t + 60_000); // die hele minuut erbij
            setCalOpen(false);
          }}
        >
          <label>
            <span>Dag</span>
            <input type="date" value={calDay} min={range ? dayKeyFmt.format(range.since) : undefined} max={dayKeyFmt.format(Date.now())} onChange={(e) => setCalDay(e.target.value)} aria-label="Dag" />
          </label>
          <label>
            <span>Tijd</span>
            <input type="time" value={calTime} onChange={(e) => setCalTime(e.target.value)} aria-label="Tijd" />
          </label>
          <button type="submit">Ga</button>
        </form>
      )}
      <input className="rawq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoeken in alle dagen" aria-label="Zoeken in alle regels" />
      {at !== null && (
        <p className="rawat">
          Regels tot {dayLabel(dayKeyFmt.format(at - 60_000)).toLowerCase()} {timeFmt.format(at - 60_000)}
          <button type="button" onClick={() => setAt(null)}>Terug naar nu</button>
        </p>
      )}
      <div className="list rawlog">
        {shown.length === 0 && <p className="muted pad">{busy ? "Laden…" : err || `Geen regels${q ? " met deze zoekterm" : ""}.`}</p>}
        {shown.map((e, i) => {
          const host = e.host ?? e.site;
          const base = baseDomain(host);
          const sub = host.length > base.length ? host.slice(0, host.length - base.length) : "";
          const day = dayKeyFmt.format(e.t);
          const newDay = i === 0 ? at !== null || day !== dayKeyFmt.format(Date.now()) : day !== dayKeyFmt.format(shown[i - 1].t);
          // Rustig zoals NextDNS: per regel alleen logo en adres; apparaat en tijd bij openklikken.
          const key = `${e.t}|${e.devId}|${host}`;
          const isOpen = openKey === key;
          const dev = devName(e.devId);
          return (
            <Fragment key={key}>
              {newDay && <div className="hourmark">{dayLabel(day)}</div>}
              <div className={"rawrow" + (e.blocked ? " blk" : "") + (e.flag ? " flag" : "") + (isOpen ? " open" : "")}>
                <button type="button" className="rawline" onClick={() => setOpenKey(isOpen ? null : key)} aria-expanded={isOpen}>
                  <MiniFav domain={logoDomain(host, base, e.icon)} />
                  <span className="rawhost"><span className="muted">{sub}</span>{base}</span>
                  <svg className="rawchev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {isOpen && (
                  // Zoals NextDNS: apparaat, status, dan de tijd (kort geleden = "x minuten geleden") met een ⋮-menu om te kopiëren.
                  <div className="rawdet">
                    <div className="rdev">{dev}</div>
                    <div className="rinfo">{e.blocked ? `Geblokkeerd door NextDNS${e.why ? ` (${e.why})` : ""}` : "Doorgelaten"}</div>
                    <div className="rinfo">Hoort bij {e.name}{e.flag ? ` · vangnet: ${e.flag}` : e.bg ? " · achtergrond (geen gebruik)" : ""}</div>
                    <div className="rfoot">
                      <span className="rwhen" title={longWhen(e.t)}>{copied === key ? "Gekopieerd ✓" : when(e.t)}</span>
                      <button type="button" className="rdots" onClick={() => setMenuKey(menuKey === key ? null : key)} aria-expanded={menuKey === key} aria-label="Meer: kopiëren" title="Kopiëren">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                      </button>
                    </div>
                    {menuKey === key && (
                      <div className="rmenu" role="menu">
                        <button type="button" role="menuitem" onClick={() => copy(host, key)}>Adres kopiëren</button>
                        {base !== host && <button type="button" role="menuitem" onClick={() => copy(base, key)}>Hoofddomein kopiëren ({base})</button>}
                        <button type="button" role="menuitem" onClick={() => copy(`${host}\t${dev}\t${longWhen(e.t)}\t${e.blocked ? "geblokkeerd" : "doorgelaten"}`, key)}>Hele regel kopiëren</button>
                        {q.trim().toLowerCase() !== host && <button type="button" role="menuitem" className="racc" onClick={() => { setQ(host); setOpenKey(null); setMenuKey(null); }}>Alle regels van dit adres</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
      {shown.length > 0 && (
        <div className="rawmore">
          {more || (busy && older.length === 0) ? (
            <button type="button" disabled={busy} onClick={() => { const b = outside ? oldestAll : oldest; if (b !== null) void load(b, true); }}>{busy ? "Laden…" : "Oudere regels laden"}</button>
          ) : err ? (
            <span className="muted">{err}</span>
          ) : (
            <span className="muted">Begin van de logboeken{range ? ` (${dayLabel(dayKeyFmt.format(range.since)).toLowerCase()})` : ""}.</span>
          )}
        </div>
      )}
    </section>
  );
}
