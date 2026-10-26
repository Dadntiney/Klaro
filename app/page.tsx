"use client";

import { OPEN_BURST, extendAll, extendSessions, minutes, type Session, isHuman } from "@/lib/sessions";
import { mergeRows } from "@/lib/merge";
import { activeMinutes, usage } from "@/lib/usage";
import { HEARTBEAT_GAP, setLearnedFg } from "@/lib/sites";
import { isPlainSite } from "@/lib/system";
import { isSilent } from "@/lib/devstats";
import { hasNewRow, rowCounts } from "@/lib/sound";
import { companionFor } from "@/lib/companion";
import { isNow, liveTvApp } from "@/lib/play";
import { ALWAYS_SHOW, activeWhat, deviceUse, isActiveNow, isTv, superseded } from "@/lib/livestatus";
import { apiFetch } from "@/lib/browser-api";
import { mergeLiveGroup } from "@/lib/recent";
import { wipeLocal } from "@/lib/wipe";
import { askReview, listReviews, type NakijkItem } from "@/lib/nakijken-client";
import { amsterdamMidnight } from "@/lib/nextdns";
import { startActivityReporting } from "@/lib/activity";
import { checkLogin } from "@/lib/php-client";
import { pushHealth, pushHistory, pushOff, pushOn, pushState, pushTest, type PushState, type SentAlert } from "@/lib/push-client";
import { baseDomain } from "@/lib/parse";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

/** WhatsApp zoals het app-icoon: groen vlak met wit logo. Het favicon (groen lijntje op wit) is in donker slecht te zien. */
function WhatsAppIcon() {
  return (
    <svg className="fav ok" viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#25D366" />
      <path d="M16 6.6a9.4 9.4 0 0 0-8.1 14.2L6.6 25.4l4.7-1.2A9.4 9.4 0 1 0 16 6.6z" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round" />
      {/* telefoontje precies in het midden van de ballon (16,16) */}
      <path fill="#fff" transform="translate(-1.76 -0.29)" d="M12.6 11.3c.3-.6.6-.6.9-.6h.7c.2 0 .5 0 .7.6l.9 2.1c.1.2.1.5 0 .7l-.6.8c-.2.2-.2.4 0 .7.9 1.5 2 2.5 3.5 3.3.3.1.5.1.7-.1l.8-.9c.2-.2.4-.3.7-.2l2 .9c.3.1.5.3.5.6 0 .8-.3 1.7-.9 2.1-.7.5-1.6.7-2.6.5-1.5-.4-3.3-1.3-4.8-2.9-1.6-1.6-2.6-3.4-2.9-4.9-.2-1 0-1.7.4-2.2z" />
    </svg>
  );
}

/** Naam zonder "(spel)"/"(leren)": dat staat als woordje in de tweede regel, zodat de naam niet afgekapt wordt. */
const shortName = (name: string) => name.replace(/ \((spel|leren)\)$/, "");
const kindOf = (name: string) => / \((spel|leren)\)$/.exec(name)?.[1];

/**
 * De laatste 7 dagen van één app: een staafje per dag (minuten), een stipje als hij alleen even open was. Zo zie je of iets nieuw
 * is of een gewoonte wordt.
 */
function WeekBars({ name, data }: { name: string; data?: Map<string, { mins: number; n: number }> }) {
  const list = Array.from({ length: 7 }, (_, i) => {
    const t = Date.now() - (6 - i) * 86_400_000;
    const d = dayKeyFmt.format(t);
    return { d, wd: new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short" }).format(t).slice(0, 2), v: data?.get(d) };
  });
  const max = Math.max(1, ...list.map((x) => x.v?.mins ?? 0));
  const total = list.reduce((n, x) => n + (x.v?.mins ?? 0), 0);
  const daysUsed = list.filter((x) => x.v).length;
  return (
    <div className="week" aria-label={`${name}: afgelopen 7 dagen`}>
      <div className="dh">Afgelopen 7 dagen<span className="week-sum">{daysUsed === 0 ? "" : `${daysUsed} ${daysUsed === 1 ? "dag" : "dagen"}${total > 0 ? ` · ${dur(total)}` : ""}`}</span></div>
      <div className="week-bars">
        {list.map((x) => (
          <div key={x.d} className="wb" title={x.v ? `${dayLabel(x.d)}: ${x.v.mins > 0 ? dur(x.v.mins) : `${x.v.n}× kort`}` : `${dayLabel(x.d)}: niet gebruikt`}>
            <div className="wb-col">
              {x.v && x.v.mins > 0 ? <span className="wb-bar" style={{ height: `${Math.max(8, Math.round((x.v.mins / max) * 100))}%` }} /> : x.v ? <span className="wb-dot" /> : null}
            </div>
            <span className="wb-v">{x.v ? (x.v.mins > 0 ? (x.v.mins >= 60 ? `${String(Math.round(x.v.mins / 6) / 10).replace(".", ",")} u` : `${x.v.mins}m`) : "kort") : ""}</span>
            <span className="wb-d">{x.wd}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Spelletje (handcontroller), voor een spel of leer-app zonder logo: rustiger dan een losse letter. */
function GameGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 15h-4l-1 .6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4z" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="16" cy="12" r=".6" fill="currentColor" />
      <circle cx="18" cy="13.5" r=".6" fill="currentColor" />
    </svg>
  );
}

/**
 * Favicon; heeft een site er geen, dan een rustig grijs vakje (een spelletje bij een spel, anders de beginletter), zodat alles
 * uitgelijnd blijft. Bij een app (eigen naam in Klaro) zoekt de server zonder logo op de website het icoon in de App Store.
 */
function Favicon({ domain, name, app }: { domain: string; name: string; app?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const initial = (name.replace(/^www\./, "")[0] ?? "?").toUpperCase();
  if (/(^|\.)whatsapp\.(com|net)$/.test(domain)) return <WhatsAppIcon />;
  return (
    <>
      {state !== "ok" && <span className="fav ph" aria-hidden>{/ \((spel|leren)\)$/.test(name) ? <GameGlyph /> : initial}</span>}
      {state !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={state === "ok" ? "fav ok" : "fav-hidden"}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          // Via de eigen server (api/icon.php). Heeft een site geen icoon, dan is het een wereldbolletje van 16x16: dat tonen we niet.
          src={`/api/icon.php?d=${encodeURIComponent(domain)}&s=64${app ? `&n=${encodeURIComponent(name)}` : ""}`}
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 16 ? "ok" : "none")}
          onError={() => setState("none")}
        />
      )}
    </>
  );
}

/** Terug naar een moment (dag en tijd): klokje met een pijltje terug. */
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Dagdelen in de lijst: nacht 0-6, ochtend 6-12, middag 12-18, avond 18-24 uur. */
const PARTS = ["Nacht", "Ochtend", "Middag", "Avond"] as const;
const partOf = (t: number) => Math.floor(hourOf(t) / 6);
function PartIcon({ p }: { p: number }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p === 0 && <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />}
      {p === 2 && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      {(p === 1 || p === 3) && <><path d="M17 18a5 5 0 0 0-10 0" /><path d="M2 18h20M12 9V3M4.2 10.2l1.4 1.4M18.4 11.6l1.4-1.4M7 21h10" />{p === 1 ? <path d="M9 6l3-3 3 3" /> : <path d="M9 4l3 3 3-3" />}</>}
    </svg>
  );
}

/** Alle losse DNS-regels (logboek): streepjes met een stipje ervoor. */
function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Van wie is een adres, voor het logo (zoals NextDNS het toont): technische adressen van grote bedrijven krijgen het logo van
 * de eigenaar (aaplimg.com → Apple, googleapis.com → Google). Anders het logo van de app/site waar Klaro het adres bij zet
 * (maps.meteoplaza.com → Buienalarm), en anders van het adres zelf.
 */
const LOGO_OWNER: [RegExp, string][] = [
  [/(^|\.)(aaplimg\.com|apple-dns\.net|apple\.news|icloud-content\.com|mzstatic\.com|cdn-apple\.com)$|push-apple\.com\.akadns\.net$|apple.*\.akadns\.net$/, "apple.com"],
  [/(^|\.)(googleapis\.com|gstatic\.com|gvt[12]\.com|googleusercontent\.com|1e100\.net|app-measurement\.com|google-analytics\.com|googletagmanager\.com|googlesyndication\.com|doubleclick\.net|app-ads-services\.com|app-analytics-services\.com|crashlytics\.com)$/, "google.com"],
  [/(^|\.)(akamai\.net|akamaiedge\.net|akamaihd\.net|akamaized\.net|akadns\.net|edgekey\.net|edgesuite\.net|akahost\.net)$/, "akamai.com"],
  [/(^|\.)(cloudfront\.net|amazonaws\.com)$/, "aws.amazon.com"],
  [/(^|\.)(fbcdn\.net|facebook\.net)$/, "facebook.com"],
  [/(^|\.)(msedge\.net|azureedge\.net|azurefd\.net|trafficmanager\.net|office\.net|cloudapp\.azure\.com|msftauth\.net|msauth\.net)$/, "microsoft.com"],
  [/(^|\.)(fastly\.net|fastlylb\.net)$/, "fastly.com"],
  [/(^|\.)(cloudflare\.net|cloudflare-dns\.com)$/, "cloudflare.com"],
];
function logoDomain(host: string, base: string, icon?: string): string {
  for (const [re, owner] of LOGO_OWNER) if (re.test(host)) return owner;
  return icon && icon !== base && icon.includes(".") ? icon : base;
}

/** Klein logo voor de NextDNS-weergave; zonder logo een rustig bolletje in plaats van een letter. */
function MiniFav({ domain }: { domain: string }) {
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <span className="mfav" aria-hidden>
      {ok !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={ok ? "ok" : ""}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          src={`/api/icon.php?d=${encodeURIComponent(domain)}&s=32`}
          onLoad={(e) => setOk(e.currentTarget.naturalWidth > 16)}
          onError={() => setOk(false)}
        />
      )}
    </span>
  );
}

/**
 * De regels zoals NextDNS ze binnenkrijgt (nieuwste bovenaan), zonder filter: zo hoeft niemand naar my.nextdns.io.
 * Bovenaan komen ze live binnen; daaronder alles uit de volledige download: zoeken in alle dagen, verder terugbladeren en
 * naar een dag en tijd springen (zie lib/rawlog.ts). Rood streepje = door NextDNS geblokkeerd; rode regel = Klaro-vangnet.
 */
const longFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
/** Volledige tijd zoals NextDNS: "18 oktober 2026 om 10:27:26". */
function longWhen(t: number) {
  return `${longFmt.format(t)} om ${timeSecFmt.format(t)}`;
}
/** Tijd bij een opengeklapte regel: t/m 30 minuten relatief ("15 minuten geleden"), daarna de kloktijd. */
function when(t: number, now = Date.now()) {
  const s = (now - t) / 1000;
  if (s < 45) return "een paar seconden geleden";
  if (s < 90) return "een minuut geleden";
  if (s < 30.5 * 60) return `${Math.round(s / 60)} minuten geleden`;
  return dayKeyFmt.format(t) === dayKeyFmt.format(now) ? `vandaag om ${timeSecFmt.format(t)}` : longWhen(t);
}
/** Kopiëren als de klembordfunctie ontbreekt (oudere browsers). */
function fallbackCopy(text: string) {
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

function RawLog({ rows, devName, devIds, device, onClose, status }: { rows: Event[]; devName: (id: string) => string; devIds: string[] | null; device: string | null; onClose: () => void; status?: React.ReactNode }) {
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
    return out.sort((a, b) => b.t - a.t);
  }, [rows, older, at, device, devName, needle]);
  const oldest = shown.length ? shown[shown.length - 1].t : null;
  return (
    <section>
      <h2>
        <span className="dh-t"><span className="dh-d">{at === null ? "Live van NextDNS" : "NextDNS"}</span></span>
        <span className="dpair">
          <button className="dview icon on" onClick={onClose} aria-label="Terug naar het overzicht" title="Terug naar het overzicht"><LogIcon /></button>
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
            <button type="button" disabled={busy} onClick={() => oldest !== null && load(oldest, true)}>{busy ? "Laden…" : "Oudere regels laden"}</button>
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

interface DetailData {
  matched: { h: string; n: number; b: number }[];
  matchedTotal: number;
  other: { h: string; n: number; b: number }[];
  otherTotal: number;
  total: number;
  capped: boolean;
}

/**
 * Klein draaicirkeltje rechts in de balk: laat zien dat het live ophalen (elke 1,5 sec.) echt loopt.
 * Grijs en draait zolang er antwoorden komen; oranje en stil als er even geen antwoord kwam; rood als het misgaat.
 * Eigen component met eigen state: de rest van de pagina hoeft niet elke 1,5 sec. opnieuw te tekenen.
 */
/** Zolang de oudere dagen laden: het cirkeltje rechtsboven vult zich als voortgangsring, met het percentage erin (schatting op
 *  basis van de vorige keer). Bij 100% wordt het weer het gewone draaicirkeltje. */
function LoadRing({ start }: { start: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  let expected = 25_000;
  try { const v = Number(localStorage.getItem("csv-load-ms")); if (v > 2_000 && v < 120_000) expected = v; } catch {}
  const pct = Math.min(99, Math.round(100 * (1 - Math.exp((-2.5 * (now - start)) / expected))));
  const c = 2 * Math.PI * 9;
  return (
    <span className="loadring" role="progressbar" aria-label="Oudere dagen laden" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <svg viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9" className="lr-bg" />
        <circle cx="11" cy="11" r="9" className="lr" transform="rotate(-90 11 11)" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100) }} />
        {/* Precies in het midden: centreren op de wiskundige middenlijn van de cijfers, niet op de regelhoogte. */}
        <text x="11" y="11" className="lr-t" textAnchor="middle" dominantBaseline="central">{pct}</text>
      </svg>
    </span>
  );
}

/**
 * Live-teken: een klein stil grijs bolletje (groen is voor "toestel online"). Knippert één keer zacht als er nieuwe regels
 * binnenkomen; oranje als het ophalen even niet lukt of traag is; rood als het een tijd niet lukt (tikken = opnieuw proberen).
 */
function LiveDot() {
  const [last, setLast] = useState({ at: Date.now(), fails: 0 });
  const [blink, setBlink] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const on = (e: globalThis.Event) => {
      const d = (e as CustomEvent<{ ok: boolean; n?: number }>).detail;
      if (d.ok) { setLast({ at: Date.now(), fails: 0 }); if (d.n) setBlink((b) => b + 1); }
      else setLast((l) => ({ ...l, fails: l.fails + 1 }));
    };
    window.addEventListener("klaro-beat", on);
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => { window.removeEventListener("klaro-beat", on); clearInterval(id); };
  }, []);
  const quiet = now - last.at;
  const kind = last.fails >= 3 || quiet > 30_000 ? "fail" : last.fails > 0 || quiet > 10_000 ? "slow" : "ok";
  const label = kind === "ok" ? "Live: werkt" : kind === "slow" ? "Live: even geen antwoord" : "Live: lukt nu niet (tik om opnieuw te proberen)";
  // Zelfde lijnstijl als de knopjes ernaast: een middelpunt met twee boogjes ("uitzenden"); bij nieuwe regels lichten de boogjes
  // even na elkaar op; rood krijgt een streep erdoor.
  return (
    <span
      key={kind === "ok" ? blink : kind}
      className={"livedot " + kind + (kind === "ok" && blink ? " blink" : "")}
      role={kind === "fail" ? "button" : "status"}
      aria-label={label}
      title={label}
      onClick={kind === "fail" ? () => window.dispatchEvent(new Event("klaro-retry")) : undefined}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path className="w1" d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
        <path className="w2" d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
        {kind === "fail" && <path d="M4 4l16 16" />}
      </svg>
    </span>
  );
}

/** Andere adressen van hetzelfde apparaat rond (±30 s) dit bezoek, rode eerst. */
function aroundIn(g: Group, list: Group[]) {
  const mine = (g.ts ?? [g.last]).slice(0, 3);
  const out: { name: string; site: string; t: number; hidden: boolean; flag?: string }[] = [];
  for (const o of list) {
    if (o.dev !== g.dev || o.site === g.site) continue;
    const t = (o.ts ?? [o.last]).find((x) => mine.some((m) => Math.abs(x - m) <= 30_000));
    if (t) out.push({ name: o.name, site: o.site, t, hidden: o.bg || !o.main, flag: o.flag });
  }
  return out.sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1) || b.t - a.t).slice(0, 15);
}

/** Waarom een regel als echt gebruik telt, in één zin. */
/** Waarom een regel onzeker is (lib/overview.ts zet de reden in x.uw): kort in het label, uitgebreid bij "Waarom". */
const UNSURE_KORT = { reclame: "misschien reclame", opstart: "alleen gestart", ontgrendel: "bij ontgrendelen" } as const;
const UNSURE = {
  reclame: "Onzeker: één los adres terwijl een social-app (zoals Instagram, Facebook of X) open was. Kan een advertentie of voorvertoning zijn die de app alvast laadde, of echt geopend.",
  opstart: "Onzeker: de app is gestart, maar er laadde geen inhoud (geen foto's of berichten). Misschien alleen even open, of vanzelf gestart.",
  ontgrendel: "Onzeker: begon op hetzelfde moment als andere apps, zoals bij het ontgrendelen of op wifi komen. Of deze app echt geopend werd, is niet te zien.",
} as const;

function whyShown(g: Group, ss: Session[]): string {
  if (g.flag) return `Staat op de vangnet-lijst (${g.flag}).`;
  if (g.susp) return "Verdacht adres: lijkt op een bekende site of komt uit een spam-hoek.";
  const w = ss.every((x) => x.uz) ? ss.find((x) => x.uw)?.uw : undefined;
  if (w) return UNSURE[w];
  const x = ss.reduce((a, b) => ((b.n ?? 0) > (a.n ?? 0) ? b : a), ss[0]);
  if (!x) return "";
  const mins = Math.round(ss.reduce((n, y) => n + (y.e - y.s), 0) / 60_000);
  if (x.lg) return "Inlog- of bankierpagina geopend.";
  if (ss.every((y) => y.ao)) return "Onzeker: de app is gestart, maar er is geen teken dat hij daarna gebruikt werd. Misschien even geopend, misschien vanzelf ververst.";
  if (ss.every((y) => y.uz)) return "Onzeker: één adres terwijl in X/Facebook gescrold werd. Misschien een advertentie die de app alvast aanklopte, misschien echt geopend.";
  if (x.ck) return "Geopend via een link (in een mail of na zoeken).";
  if ((x.m ?? 0) >= 2) return `Video of geluid afgespeeld${mins ? `, ongeveer ${mins} min` : ""}.`;
  if ((x.f ?? 0) >= 2) return `App geopend en inhoud geladen (${x.f}× nieuw).`;
  if (x.pv) return "Website geopend: een pagina met meerdere onderdelen geladen.";
  if (ALWAYS_SHOW.has(g.site)) return "Staat op de lijst 'altijd tonen'.";
  return `Steeds nieuwe inhoud geladen (${x.n ?? 1} momenten${mins ? `, ${mins} min` : ""}).`;
}

/** Waarom een sessie bewust niet getoond wordt. */
function whyHidden(x: Session, auto: boolean, tvShort: boolean): string {
  if (x.ml) return "plaatje of teller in een nieuwsbrief";
  if (x.res) return "alleen tellers/plaatjes, geen pagina";
  if (x.rl) return "tabblad opnieuw geladen (veel sites tegelijk)";
  if (x.emb) return "onderdeel van een andere site of app";
  if (auto) return "ververst zichzelf (widget of open tabblad)";
  if (tvShort) return "tv-beginscherm, niets afgespeeld";
  if (x.f !== undefined) return "app op de achtergrond, niets geopend";
  return "één los adres, geen pagina geladen (bijv. advertentie of voorvertoning)";
}

/** Rond pijltje rechtsonder als je ver naar beneden bent gescrold: één tik en je staat weer bovenaan (overzicht én NextDNS-lijst). */
function ToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight * 1.5);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button type="button" className={"totop" + (show ? " show" : "")} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Naar boven" title="Naar boven" tabIndex={show ? 0 : -1} aria-hidden={!show}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  );
}

/**
 * Meldingen bij 18+, dating en VPN op dit toestel, ook als Klaro dicht is (onderaan, naast Uitloggen). Op de iPhone kan dat
 * alleen vanaf het beginscherm; in Safari staat er dan hoe.
 */
function PushToggle() {
  const [st, setSt] = useState<PushState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [laatst, setLaatst] = useState<number | null>(null);
  const [hist, setHist] = useState<SentAlert[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [aantal, setAantal] = useState<number | null>(null); // op hoeveel toestellen meldingen aan staan
  const [offAsk, setOffAsk] = useState(false);
  const [offWord, setOffWord] = useState("");
  const histRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pushState().then(setSt, () => setSt("geen"));
    // Steeds opnieuw vragen: één keer bij het openen gaf een vals "niet gedraaid" als de app lang open bleef (20 okt).
    const health = () => { if (document.visibilityState === "visible") pushHealth().then((h) => { setLaatst(h.laatst); setAantal(h.aantal); }, () => {}); };
    health();
    const hTimer = setInterval(health, 60_000);
    document.addEventListener("visibilitychange", health);
    // Getikt op een melding (die bewust niets zegt): meteen de echte tekst laten zien.
    const open = () => { pushHistory().then(setHist, () => {}); setShowHist(true); setTimeout(() => histRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); };
    if (new URLSearchParams(location.search).has("meldingen")) { open(); history.replaceState(null, "", "/"); }
    else pushHistory().then(setHist, () => {});
    const onMsg = (e: MessageEvent) => { if ((e.data as { meldingen?: number })?.meldingen) open(); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { navigator.serviceWorker?.removeEventListener("message", onMsg); clearInterval(hTimer); document.removeEventListener("visibilitychange", health); };
  }, []);
  // Zelfbewaking: draaide de waarschuw-taak (elke 5 min) al een uur niet goed, dan hier zeggen; anders lijkt "geen melding" op "niets aan de hand".
  const stuck = laatst !== null && Date.now() - laatst > 60 * 60_000;
  const run = (fn: () => Promise<PushState | boolean>, done: string) => {
    setBusy(true);
    setNote("");
    fn().then((r) => { if (typeof r === "string") setSt(r); setNote(r === "geweigerd" ? "Meldingen zijn geweigerd: zet ze aan bij Instellingen → Meldingen → Dobber." : done); }, (e) => setNote(e instanceof Error ? e.message : "Dat lukte niet.")).finally(() => setBusy(false));
  };
  if (st === null || st === "geen") return null;
  const on = st === "aan";
  return (
    <>
      {aantal === 0 && <p className="pushwarn">Let op: meldingen staan op geen enkel toestel aan. Open Dobber vanaf je beginscherm en zet ze aan.</p>}
      {stuck && <p className="pushwarn">Let op: waarschuwen heeft sinds {dayLabel(dayKeyFmt.format(laatst!)).toLowerCase()} {timeFmt.format(laatst!)} niet gedraaid. Meldingen komen nu niet.</p>}
      <FoldRow label="Meldingen" value={<><span className={"dot" + (on ? " on" : "")} aria-hidden />{on ? "aan" : st === "beginscherm" ? "alleen in de app" : "uit"}</>}>
        {st === "beginscherm" && <p>Je kijkt nu in Safari. Meldingen werken alleen in de Dobber-app op je beginscherm; daar staan ze apart aan of uit. Nog geen Dobber op je beginscherm? Deel → Zet op beginscherm, en open hem daar.</p>}
        {(st === "uit" || st === "geweigerd") && <button type="button" className="setbtn" disabled={busy} onClick={() => run(pushOn, "Meldingen staan aan. Binnen een kwartier komt een proefmelding.")}>Meldingen aanzetten</button>}
        {on && (
          <>
            <p className="muted">Op het scherm staat alleen ‘Er is iets om te bekijken’; wat er gebeurde zie je hier onder Laatste meldingen.</p>
            <div className="setbtns">
              <button type="button" className="setbtn" disabled={busy} onClick={() => run(pushTest, "Proefmelding komt binnen een kwartier.")}>Proefmelding sturen</button>
              {!offAsk && <button type="button" className="setbtn quiet" disabled={busy} onClick={() => { setOffAsk(true); setOffWord(""); }}>Uitzetten…</button>}
            </div>
            {/* Niet per ongeluk uitzetten (wens eigenaar): eerst het woord UITZETTEN overtypen. */}
            {offAsk && (
              <form className="offask" onSubmit={(e) => { e.preventDefault(); if (offWord.trim().toUpperCase() !== "UITZETTEN") return; setOffAsk(false); run(pushOff, "Meldingen staan uit."); }}>
                <label>Weet je het zeker? Typ <b>UITZETTEN</b> om de meldingen op dit toestel uit te zetten.
                  <input value={offWord} onChange={(e) => setOffWord(e.target.value)} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} />
                </label>
                <div className="setbtns">
                  <button type="submit" className="setbtn danger" disabled={busy || offWord.trim().toUpperCase() !== "UITZETTEN"}>Definitief uitzetten</button>
                  <button type="button" className="setbtn quiet" onClick={() => setOffAsk(false)}>Toch aan laten</button>
                </div>
              </form>
            )}
          </>
        )}
        {note && <p className="pushnote">{note}</p>}
      </FoldRow>
      {on && (
        <div ref={histRef}>
          <FoldRow label="Laatste meldingen" value={String(hist.length)} open={showHist} onToggle={setShowHist}>
            {hist.length === 0 ? <p className="muted">Nog geen meldingen in de laatste 30 dagen.</p> : (
              <ul className="setlist">
                {hist.slice(0, 20).map((m, i) => (
                  <li key={m.t + ":" + i}>
                    <span className="muted">{dayLabel(dayKeyFmt.format(m.t))} {timeFmt.format(m.t)}</span>
                    <span>{m.title.replace(/^(Klaro|Dobber): /, "")}: {m.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </FoldRow>
        </div>
      )}
    </>
  );
}

/** Een rij onderaan in dezelfde stijl als de dagkoppen: hoofdletters, waarde in grijs, pijltje dat openklapt. */
function FoldRow({ label, value, open, onToggle, children }: { label: string; value?: React.ReactNode; open?: boolean; onToggle?: (v: boolean) => void; children: React.ReactNode }) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const toggle = () => (onToggle ? onToggle(!isOpen) : setOwn(!isOpen));
  return (
    <div className="setrow">
      <h2 className="fold" role="button" tabIndex={0} aria-expanded={isOpen} onClick={toggle} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}>
        {label}
        {value !== undefined && <span className="muted">· {value}</span>}
        <span className={"fold-chev" + (isOpen ? " up" : "")} aria-hidden>›</span>
      </h2>
      {isOpen && <div className="setbody">{children}</div>}
    </div>
  );
}

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [deviceNow, setDevice] = useState<string | null>(null);
  // De chip licht meteen op; de lijst volgt een tel later (zwaarder werk mag de tik niet ophouden).
  const device = useDeferredValue(deviceNow);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // "Nakijken": verzoeken en antwoorden (api/nakijken.php), per apparaat|site|begintijd.
  const [reviews, setReviews] = useState<NakijkItem[]>([]);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const loadReviews = useCallback(() => { listReviews().then(setReviews, () => {}); }, []);
  useEffect(() => {
    loadReviews();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadReviews(); }, 120_000);
    return () => clearInterval(t);
  }, [loadReviews]);
  const [details, setDetails] = useState<Record<string, { state: "loading" | "ok" | "err"; data?: DetailData }>>({}); // wat er rond een bezoek gebeurde, per geopende regel
  const [showOther, setShowOther] = useState<Set<string>>(new Set());
  const [goOpen, setGoOpen] = useState(false); // "Ga naar dag en tijd"
  // Weergave: het eigen overzicht, of live de regels zoals NextDNS ze ziet.
  const [rawView, setRawView] = useState(false);
  // Klaro opent altijd in het gewone overzicht; de NextDNS-lijst is een uitstapje (wens eigenaar), dus de keuze wordt niet onthouden.
  // Echt gebruik (tikken, scrollen, typen) aan de server melden: na 2 uur zonder gebruik logt de server iedereen uit.
  useEffect(() => startActivityReporting(checkLogin), []);
  const toggleRaw = () => setRawView((v) => !v);
  const [rawLog, setRawLog] = useState<Event[]>([]);
  const rawSeen = useRef<Set<string>>(new Set());
  const addRaw = useCallback((evs: Event[]) => {
    const fresh = evs.filter((e) => { const k = `${e.t}|${e.devId}|${e.host}`; if (rawSeen.current.has(k)) return false; rawSeen.current.add(k); return true; });
    if (fresh.length) setRawLog((prev) => [...fresh, ...prev].sort((a, b) => b.t - a.t).slice(0, 500));
  }, []);
  const [goDay, setGoDay] = useState("");
  const [goTime, setGoTime] = useState("10:00");
  const [gotoKey, setGotoKey] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set()); // oudere dagen die de gebruiker heeft opengeklapt
  const sound = useRef<HTMLAudioElement | null>(null);
  const alarm = useRef<HTMLAudioElement | null>(null);
  const [clock, setClock] = useState(() => Date.now()); // elke 20 sec: "nu actief" opnieuw beoordelen
  const [tick, setTick] = useState(0); // elke minuut: "ongewoon stil" opnieuw beoordelen
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  const loadStart = useRef(Date.now()); // begin van het laden (voor het percentage rechtsboven)
  const [live, setLive] = useState<"ok" | "fail">("ok");
  const [liveError, setLiveError] = useState("");
  const followOf = useRef<Record<string, string>>({}); // apparaat|adres -> app (doorverwijs-adressen, van de server)
  const lastSeen = useRef(0);
  const deviceMap = useRef<Record<string, string>>({});
  const devName = useCallback((id: string) => deviceMap.current[id] ?? id, []);

  // Eerst vandaag laden en tonen (skelet met voortgang tot dan), daarna de oudere dagen eronder.
  const [progress, setProgress] = useState(0);
  const [histErr, setHistErr] = useState(false); // oudere dagen laden lukte niet
  // Sites die zichzelf verversen (widget/app/open tabblad), per "apparaat|site": bepaald uit alle dagen, onthouden voor het snelle laden.
  const [auto, setAuto] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("klaro-auto") ?? "[]") as string[]); } catch { return new Set(); }
  });
  // Eerst alleen het laatste uur getoond: regels die vóór dit moment begonnen komen nog (0 = vandaag is compleet).
  const [cut, setCut] = useState(0);
  const finishing = useRef(false);

  useEffect(() => { (window as unknown as { __klaroUp?: boolean }).__klaroUp = true; }, []); // zie het vangnet in app/layout.tsx
  // Nieuwe versie live gezet? Dan vanzelf herladen, zodat altijd de nieuwste regels rekenen: bij terugkomen op de pagina, of elke
  // 5 minuten als er even niets aangeraakt is (niet midden in het lezen). Herkend aan scriptbestanden die deze pagina nog niet kent.
  useEffect(() => {
    let touched = Date.now();
    const touch = () => { touched = Date.now(); };
    const check = async (returning: boolean) => {
      if (document.visibilityState !== "visible" || (!returning && Date.now() - touched < 120_000)) return;
      try {
        const html = await (await fetch("/", { cache: "no-store", credentials: "same-origin" })).text();
        const have = new Set([...document.querySelectorAll("script[src]")].map((x) => new URL((x as HTMLScriptElement).src).pathname));
        const want = [...html.matchAll(/<script src="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
        if (want.length && want.some((src) => !have.has(src))) location.reload();
      } catch { /* offline of niet ingelogd: later opnieuw */ }
    };
    const onVis = () => void check(true);
    const id = setInterval(() => void check(false), 300_000);
    document.addEventListener("visibilitychange", onVis);
    for (const ev of ["pointerdown", "scroll", "keydown"]) window.addEventListener(ev, touch, { passive: true });
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      for (const ev of ["pointerdown", "scroll", "keydown"]) window.removeEventListener(ev, touch);
    };
  }, []);
  useEffect(() => {
    const t0 = Date.now();
    const apply = (data: { groups: Group[]; devices: Device[]; total: number; deviceMap?: Record<string, string>; insights?: Insights; partial?: number; auto?: string[]; followers?: Record<string, string>; fgLearned?: Record<string, string[]> }, isFull: boolean) => {
      fullRef.current = true;
      // Bij alleen het laatste stuk: de eerste 15 minuten van dat stuk niet tonen (een bezoek dat eerder begon zou daar te laat lijken te beginnen).
      // Begint dat stuk vóór middernacht (net na 0:00), dan is vandaag al compleet: niets meer te wachten voor vandaag.
      setCut(data.partial && data.partial > amsterdamMidnight(Date.now()) ? data.partial + 15 * 60_000 : 0);
      setGroups(data.groups);
      setDevices(data.devices);
      setTotal(data.total);
      deviceMap.current = data.deviceMap ?? {};
      if (data.followers) followOf.current = data.followers;
      // Zelf geleerde bewijs-adressen ook live gebruiken (lib/selflearn.ts).
      if (data.fgLearned) setLearnedFg(new Map(Object.entries(data.fgLearned).map(([k, v]) => [k, new Set(v)])));
      setInsights(data.insights ?? null);
      lastSeen.current = Math.max(0, ...data.groups.map((g) => g.last));
      setUpdated(new Date());
      if (data.auto) {
        setAuto(new Set(data.auto));
        try { localStorage.setItem("klaro-auto", JSON.stringify(data.auto)); } catch {}
      }
      if (data.partial) {
        // alleen het laatste uur: geen tijdsmeting opslaan
      } else if (isFull) {
        setFull(true);
        setWindowFrom((data as { windowFrom?: number }).windowFrom ?? 0);
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
    let shownAny = false; // er staat al iets (laatste uur of heel vandaag)
    let todayDone = false; // vandaag is binnen of mislukt
    let fullErr = ""; // laden van alles mislukt (melding pas tonen als vandaag ook klaar is)
    const settle = () => {
      if (!fullErr || !todayDone) return;
      if (shownAny) { setHistErr(true); return; } // vandaag staat er; alleen de oudere dagen lukken niet
      setError(fullErr);
      setState("error");
      setFull(true);
    };
    apiFetch("/api/nextdns?scope=today&hours=1.5")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || fullDone || todayShown) return;
        shownAny = true;
        apply(data, false);
      })
      .catch(() => {});
    apiFetch("/api/nextdns?scope=today")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || fullDone) return;
        todayShown = shownAny = true;
        apply(data, false);
      })
      .catch(() => {})
      .finally(() => { todayDone = true; settle(); });
    apiFetch("/api/nextdns")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        fullDone = true;
        apply(data, true);
      })
      .catch((e: Error) => {
        lastFull.current = 0; // bij de eerstvolgende verversing (binnen een minuut) alle dagen opnieuw proberen
        fullErr = e.message || "Ophalen mislukt";
        settle();
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
  const [mailT, setMailT] = useState<Map<string, { esp: number[]; mc: number[]; ck?: number[] }>>(new Map());

  /** Verwerk nieuwe verzoeken (uit de rechtstreekse stroom of de periodieke controle). */
  const applyEvents = useCallback((incoming: Event[]) => {
    addRaw(incoming); // ruwe regels voor de NextDNS-weergave (alles, ook achtergrond)
    // Mailverkeer onthouden (per apparaat, laatste half uur): korte "bezoeken" tegelijk met een geopende nieuwsbrief zijn geen bezoek.
    const mailEv = incoming.filter((e) => e.esp || e.mc || e.ck);
    if (mailEv.length) setMailT((prev) => {
      const next = new Map(prev);
      const cut = Date.now() - 1_800_000;
      for (const e of mailEv) {
        const dev = deviceMap.current[e.devId] ?? e.type;
        const cur = next.get(dev) ?? { esp: [], mc: [] };
        next.set(dev, { esp: e.esp ? [...cur.esp.filter((t) => t > cut), e.t] : cur.esp, mc: e.mc ? [...cur.mc.filter((t) => t > cut), e.t] : cur.mc, ck: e.ck ? [...(cur.ck ?? []).filter((t) => t > cut), e.t] : cur.ck });
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
    // Rood (18+, dating, VPN, geblokkeerd) klinkt altijd meteen, ongeacht filter, met een ander, dringender geluid.
    // Het gewone geluid klinkt pas als er een nieuwe regel in de lijst komt (zie hieronder bij `days`).
    if (events.some((e) => e.flag)) beep(true);
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
        let e = { ...ev, dev: deviceMap.current[ev.devId] };
        const d = dayKeyFmt.format(e.t);
        // Meetgegevens van Microsoft die aansluiten op een lopend spel (Minecraft) horen bij dat spel, net als op de server.
        const comp = e.host ? companionFor(e.host) : undefined;
        const game = comp && next.find((g) => g.d === d && g.dev === e.dev && g.site === comp.app);
        if (comp && game && e.t - game.last <= comp.keep && e.t >= game.last - 1_500) e = { ...e, site: game.site, name: game.name, icon: game.icon, bg: false, main: true, fg: undefined, res: undefined, cat: game.cat ?? e.cat };
        // Doorverwijs-adres van een app (Toca Boca via een Amazon-adres), net als op de server: alleen aansluitend op die app.
        const fsite = e.host ? followOf.current[e.dev + "|" + e.host] : undefined;
        const app = fsite && next.find((g) => g.d === d && g.dev === e.dev && g.site === fsite);
        if (app && e.t - app.last <= HEARTBEAT_GAP && e.t >= app.last - 1_500) e = { ...e, site: app.site, name: app.name, icon: app.icon, bg: false, main: true, fg: undefined, res: undefined, cat: app.cat ?? e.cat };
        // Afspeelsignalen (Conviva) horen bij de tv-app waarvan de reeks nog loopt, net als op de server (lib/play.ts).
        const tv = e.media && !e.main && isPlainSite(e) ? liveTvApp(next, d, e.dev, e.t) : undefined;
        if (tv) e = { ...e, site: tv.site, name: tv.name, icon: tv.icon, bg: false, main: true, fg: undefined, res: undefined, cat: tv.cat ?? e.cat };
        const i = next.findIndex((g) => g.d === d && g.dev === e.dev && g.site === e.site);
        if (i >= 0) next[i] = { ...next[i], n: next[i].n + 1, bl: (next[i].bl ?? 0) + (e.blocked ? 1 : 0), flag: next[i].flag ?? e.flag, last: Math.max(next[i].last, e.t), main: next[i].main || e.main, ts: [e.t, ...(next[i].ts ?? [])].slice(0, 8), lm: e.media ? Math.max(next[i].lm ?? 0, e.t) : next[i].lm, ss: extendSessions(next[i].ss ?? [], e.t, !!e.media, e.fg, isPlainSite(next[i]) && e.fg === undefined ? !!e.res : undefined, OPEN_BURST.has(e.site) ? e.host : undefined, !!e.ka), sc: (next[i].sc ?? 0) + ((next[i].ss ?? []).some((x) => e.t >= x.s - 300_000 && e.t <= x.e + 300_000) ? 0 : 1), mins: (next[i].mins ?? 0) + Math.max(0, sumMin(extendSessions(next[i].ss ?? [], e.t, !!e.media, e.fg, undefined, undefined, !!e.ka)) - sumMin(next[i].ss ?? [])), flash: Date.now() };
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
  }, [beep, addRaw]);

  // Bij het openen van de NextDNS-weergave meteen de laatste 200 regels, daarna komen ze live binnen.
  useEffect(() => {
    if (!rawView || state !== "ready") return;
    apiFetch("/api/nextdns/live?since=0").then((r) => r.json()).then((d) => addRaw(d.events ?? [])).catch(() => {});
  }, [rawView, state, addRaw]);

  // Vangnet: alleen controleren als de rechtstreekse stroom niet werkt (anders gaan we over de limiet van NextDNS).
  const poll = useCallback(async () => {
    try {
      // Na 10 sec. zonder antwoord afbreken: anders blijft het live bijwerken stil hangen op één verzoek.
      const res = await apiFetch(`/api/nextdns/live?since=${lastSeen.current}`, { signal: AbortSignal.timeout(10_000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Live mislukt");
      setLive("ok");
      applyEvents(data.events as Event[]);
      window.dispatchEvent(new CustomEvent("klaro-beat", { detail: { ok: true, n: (data.events ?? []).length } }));
    } catch (e) {
      setLive("fail");
      setLiveError((e as Error).name === "TimeoutError" ? "NextDNS reageert even niet." : (e as Error).message);
      window.dispatchEvent(new CustomEvent("klaro-beat", { detail: { ok: false } }));
    }
  }, [applyEvents]);
  useEffect(() => { const on = () => { void poll(); }; window.addEventListener("klaro-retry", on); return () => window.removeEventListener("klaro-retry", on); }, [poll]);

  const liveFailedRef = useRef(false);
  useEffect(() => { liveFailedRef.current = live === "fail"; }, [live]);

  // Live: elke ~1,5 seconde nieuwe verzoeken ophalen, alleen zolang de pagina in beeld is. Op de achtergrond niet: een open
  // tabblad dat de hele dag elke 1,5 s vraagt, kost tienduizenden aanroepen per dag en liet het gratis Vercel-tegoed
  // opraken (site uitgeschakeld). Zodra de pagina weer in beeld komt, haalt hij alles in (ook rode meldingen).
  // De klok draait in een aparte Web Worker (gelijkmatige slagen). Terwijl een antwoord nog loopt, slaan we een slag over.
  useEffect(() => {
    if (state !== "ready") return;
    let busy = false;
    let pauseUntil = 0;
    const run = async () => {
      if (busy || Date.now() < pauseUntil || document.visibilityState === "hidden") return;
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

  // Opnieuw berekenen met precies dezelfde regels: elke minuut de laatste uren (snel; de download wordt alleen aangevuld) en
  // elk uur alles (was elke 5 min; de snelle berekening geeft gemeten dezelfde uitkomst, 0,3 s tegen 9 s en meer naarmate er
  // dagen bijkomen), en zodra de pagina weer zichtbaar wordt na een tijd op de achtergrond. Zo komt ook alles binnen wat
  // de live-controle gemist heeft (bijvoorbeeld als de telefoon vergrendeld was), inclusief rode sites, en lopen live en
  // volledig rekenen nooit lang uit elkaar.
  const lastFull = useRef(Date.now());
  const FULL_EVERY = 59 * 60_000;
  // Alleen de laatste 30 dagen geladen (lib/rawsource.ts): vanaf wanneer; 0 = alles. Onderaan staat dan "Oudere dagen laden".
  const [windowFrom, setWindowFrom] = useState(0);
  const [olderBusy, setOlderBusy] = useState(false);
  const refreshFull = useCallback(async (recent = false, older = false) => {
    try {
      const res = await apiFetch(older ? "/api/nextdns?all=1" : recent ? "/api/nextdns?scope=recent" : "/api/nextdns");
      const data = await res.json();
      if (!res.ok) return;
      if (!recent) setWindowFrom(data.windowFrom ?? 0);
      if (!recent) lastFull.current = Date.now();
      if (data.followers) followOf.current = data.followers;
      if (data.fgLearned) setLearnedFg(new Map(Object.entries(data.fgLearned as Record<string, string[]>).map(([k, v]) => [k, new Set(v)])));
      setInsights(data.insights ?? null);
      // Nieuwe apparaten van na het laden ook benoemen; bestaande namen blijven gelijk (anders wisselen regels van apparaat).
      if (data.deviceMap) deviceMap.current = { ...data.deviceMap, ...deviceMap.current };
      setDevices((prev) => [
        ...prev.map((p) => {
          const f = (data.devices as Device[]).find((x) => x.name === p.name);
          return f ? { ...p, first: f.first, away: f.away, sleep: f.sleep, dm: f.dm, threats: f.threats, avg: f.avg, gap: f.gap, days: f.days } : p;
        }),
        // Apparaten die vandaag nog niets deden (MacBook van eergisteren) komen er ook bij, ook als het eerste laden van alle dagen mislukte.
        ...(data.devices as Device[]).filter((f) => !prev.some((p) => p.name === f.name)),
      ]);
      // Alle dagen zijn nu alsnog binnen: de melding "oudere dagen laden lukt niet" mag weg.
      if (!recent) { setHistErr(false); setFull(true); }
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
          // De herberekening is leidend; wat live al nieuwer binnenkwam, komt erachter (lib/recent.ts).
          return { ...mergeLiveGroup(f, g), isNew: f.isNew || g.isNew, flash: g.flash };
        });
        // Groepen die live gemist zijn, komen er alsnog bij.
        for (const [k, f] of fresh) if (!seenKeys.has(k)) next.push(f);
        return next;
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    const id = setInterval(() => document.visibilityState === "visible" && refreshFull(Date.now() - lastFull.current < FULL_EVERY), 60_000);
    const onVisible = () => document.visibilityState === "visible" && Date.now() - lastFull.current > 60_000 && refreshFull(Date.now() - lastFull.current < FULL_EVERY);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, refreshFull]);

  // Uitklapoverzicht: wat vroeg hetzelfde apparaat nog meer op rond de laatste bezoeken aan deze site (±30 s), ook verborgen adressen.
  const around = useCallback((g: Group) => aroundIn(g, groups), [groups]);

  // Alle 18+/WhatsApp-bezoeken in de logs (ongeacht apparaat of filter), nieuwste eerst.
  // Zoekregels waar rond hetzelfde moment (±30 s, zelfde apparaat) een 18+/dating-adres is opgevraagd.
  // Alleen rode regels kunnen hier treffen: per apparaat vooraf verzameld (meestal geen), zodat dit niet bij elke live-update alles langs hoeft.
  const ctx = useMemo(() => {
    const m = new Map<string, string>();
    const red = new Map<string, Group[]>();
    for (const g of groups) if (g.flag) red.set(g.dev, [...(red.get(g.dev) ?? []), g]);
    if (!red.size) return m;
    for (const g of groups) {
      const cand = red.get(g.dev);
      if (!cand || g.flag || !isSearch(g.site)) continue;
      const hit = aroundIn(g, cand).find((o) => o.flag);
      if (hit) m.set(g.d + g.site + g.dev, `${hit.name} (${hit.flag})`);
    }
    return m;
  }, [groups]);

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
  const lastUse = useMemo(() => deviceUse(groups, auto), [groups, auto]);
  const activeNow = (name: string) => isActiveNow(lastUse, name, clock);
  const activeApp = (name: string) => activeWhat(lastUse, name, clock);
  // Haal op wat er rond dit bezoek gebeurde (alle adressen van het apparaat in dat tijdvak).
  const loadDetail = (g: Group, rss: Session[], rk: string) => {
    if (details[rk]) return;
    const from = Math.min(...rss.map((x) => x.s)) - 30_000;
    const to = Math.max(...rss.map((x) => x.e)) + 30_000;
    const devId = Object.entries(deviceMap.current).find(([, label]) => label === g.dev)?.[0] ?? "";
    setDetails((d) => ({ ...d, [rk]: { state: "loading" } }));
    apiFetch(`/api/nextdns/detail?site=${encodeURIComponent(g.site)}&dev=${encodeURIComponent(devId)}&from=${from}&to=${to}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "mislukt");
        setDetails((d) => ({ ...d, [rk]: { state: "ok", data } }));
      })
      .catch(() => setDetails((d) => ({ ...d, [rk]: { state: "err" } })));
  };

  // Waarschuwingen die de eigenaar als gezien heeft afgevinkt (alleen in deze browser). De sleutel bevat het tijdstip: een nieuw
  // 18+-bezoek of een nieuwe stilte na gebruik is een nieuwe melding en komt dus gewoon weer terug.
  const [gezien, setGezien] = useState<Set<string>>(() => new Set());
  useEffect(() => { try { setGezien(new Set(JSON.parse(localStorage.getItem("klaro-gezien") ?? "[]") as string[])); } catch {} }, []);
  const silentKey = (x: { name: string; last: number }) => `stil|${x.name}|${x.last}`;
  const flagKey = (g: Group) => `flag|${g.d}|${g.dev}|${g.site}|${g.last}`;
  const newExtra = extraAlerts.filter((a) => !gezien.has(a.key));
  const newSilent = silent.filter((x) => !gezien.has(silentKey(x)));
  const newFlagged = flagged.filter((g) => !gezien.has(flagKey(g)));
  const alertCount = newExtra.length + newSilent.length + newFlagged.length;
  const markSeen = (keys: string[]) => setGezien((prev) => {
    const next = new Set(prev);
    for (const k of keys) next.add(k);
    // Alleen sleutels bewaren die nog bestaan (plus de nieuwe), zodat de lijst niet blijft groeien.
    const live = new Set([...extraAlerts.map((a) => a.key), ...silent.map(silentKey), ...flagged.map(flagKey)]);
    const keep = [...next].filter((k) => live.has(k));
    try { localStorage.setItem("klaro-gezien", JSON.stringify(keep)); } catch {}
    return new Set(keep);
  });
  const silentNames = useMemo(() => new Set(newSilent.map((x) => x.name)), [newSilent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && alertCount === 0) setOpen(false); }, [open, alertCount]); // alles afgevinkt: venster dicht

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

  // Los van het apparaat-filter: zo hoeft een tik op een chip dit niet opnieuw uit te rekenen.
  const use = useMemo(() => usage(groups, { auto, followers: followOf.current, mailT, cut }), [groups, mailT, cut, auto]);
  // Per app (apparaat|site): minuten en keren per dag, voor het weekje in de details. Zelfde telling als de lijst (lib/usage.ts).
  const perDay = useMemo(() => {
    const m = new Map<string, Map<string, { mins: number; n: number }>>();
    for (const g of groups) {
      if (!use.listed(g)) continue;
      const ss = use.shown(g);
      if (!ss.length) continue;
      const k = g.dev + "|" + g.site;
      const byD = m.get(k) ?? m.set(k, new Map()).get(k)!;
      const v = byD.get(g.d) ?? { mins: 0, n: 0 };
      v.mins += ss.reduce((n, x) => n + minutes(x), 0);
      v.n += ss.length;
      byD.set(g.d, v);
    }
    return m;
  }, [groups, use]);
  const days = useMemo(() => {
    const byDay = new Map<string, Group[]>();
    const mainByDay = new Map<string, Group[]>(); // voor "niet getoond": per dag, in plaats van per dag alle groepen door te lopen
    const { listed, shown } = use;
    for (const g of groups) {
      if (device && g.dev !== device) continue;
      if (g.main && !g.bg && !g.flag && !g.susp) (mainByDay.get(g.d) ?? mainByDay.set(g.d, []).get(g.d)!).push(g);
      if (listed(g)) (byDay.get(g.d) ?? byDay.set(g.d, []).get(g.d)!).push(g);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([d, list]) => {
        const per = list.map((g) => ({ g, ss: shown(g) })).filter((x) => x.ss.length);
        // Actieve minuten van de dag: per apparaat de echte-gebruik-sessies samengevoegd (overlappende apps niet dubbel).
        const byDev = new Map<string, Session[]>();
        for (const { g, ss } of per) (byDev.get(g.dev) ?? byDev.set(g.dev, []).get(g.dev)!).push(...ss);
        let mins = 0;
        const devMins: { dev: string; mins: number }[] = [];
        for (const [dev, ss] of byDev) { const m = activeMinutes(ss); mins += m; devMins.push({ dev, mins: Math.round(m) }); }
        return {
          d,
          list: per.map((x) => x.g),
          // Bewust niet getoond (met reden): sessies van echte sites/apps die op gebruik leken, maar het niet waren.
          hidden: (mainByDay.get(d) ?? [])
            .flatMap((g) => {
              const shownS = new Set(shown(g).map((x) => x.s));
              return (g.ss ?? [])
                .filter((x) => !shownS.has(x.s) && !(isTv(g.dev) && per.some((p) => p.g === g)) && ((x.mh ?? 0) >= 1 || (x.n ?? 0) >= 2 || (x.m ?? 0) >= 1 || (x.f ?? 0) >= 1))
                .map((x) => ({ g, t: x.s, why: whyHidden(x, auto.has(g.dev + "|" + g.site), isTv(g.dev) && x.e - x.s < 60_000) }));
            })
            .sort((a, b) => b.t - a.t)
            .slice(0, 60),
          mins: Math.round(mins),
          devMins: devMins.filter((x) => x.mins > 0).sort((a, b) => b.mins - a.mins),
          // Elk bezoek (sessie) is een eigen regel, nieuwste bovenaan: zo bouwt de dag zich op in de volgorde van wat er gebeurde.
          rows: mergeRows(
            per
              .flatMap(({ g, ss }) => {
                const all = g.ss && g.ss.length ? g.ss : [{ s: g.last, e: g.last }];
                const oldest = Math.min(...all.map((x) => x.s));
                return ss.map((x) => ({ g, t: x.s, ss: [x], compact: false, first: x.s === oldest && (g.sc ?? all.length) <= all.length, newest: x.e === Math.max(...ss.map((y) => y.e)) }));
              })
              // Alles op begintijd, nieuwste eerst; wat nu bezig is blijft op zijn eigen tijd staan (groene zweem en "nu" vallen genoeg op).
              .sort((a, b) => b.t - a.t)
          ),
        };
      })
      .filter((d) => d.rows.length > 0);
  }, [groups, device, use, auto]);

  // Geluid alleen bij een nieuwe regel van vandaag (nieuwe app, site of game), niet bij elke opvraging.
  // Pas na het volledig laden, en opnieuw beginnen bij een ander apparaat-filter: dan is alles "nieuw" maar niet gebeurd.
  const rowsSeen = useRef<{ key: string; counts: Map<string, number> } | null>(null);
  useEffect(() => {
    const today = dayKeyFmt.format(Date.now());
    const rows = days.find((d) => d.d === today)?.rows ?? [];
    const key = `${device ?? ""}|${today}`;
    const prev = rowsSeen.current;
    if (full && prev && prev.key === key && hasNewRow(prev.counts, rows, Date.now())) beep();
    rowsSeen.current = full ? { key, counts: rowCounts(rows) } : null;
  }, [days, device, full, beep]);

  // Apparaatknoppen die niet allemaal passen: zacht vervagen aan de kant waar er nog meer staat (dan zie je dat je kunt schuiven).
  const chipsRef = useRef<HTMLDivElement>(null);
  const [devOpen, setDevOpen] = useState(false); // totaal per apparaat onder "Vandaag"
  // Het dagdeel (Ochtend, Middag, ...) waar je doorheen scrolt: in de vaste dagkop, zodra het eigen label onder de kop verdwenen is.
  // p: null = de lijst schuift al onder de kop, maar er is (nog) geen dagdeel voorbij; dan alleen de afgeronde bovenrand.
  const [stuckPart, setStuckPart] = useState<{ d: string; p: number | null } | null>(null);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      let found: { d: string; p: number | null } | null = null;
      for (const sec of document.querySelectorAll<HTMLElement>("section[data-day]")) {
        const h = sec.querySelector("h2");
        if (!h) continue;
        const hb = h.getBoundingClientRect(), sb = sec.getBoundingClientRect();
        if (sb.top > hb.top - 1 || sb.bottom < hb.bottom) continue; // deze kop staat niet vast bovenaan
        const list = sec.querySelector(".list.day");
        const lb = list?.getBoundingClientRect();
        if (!lb || lb.top >= hb.bottom - 2 || lb.bottom <= hb.bottom + 30) continue; // de lijst zit (nog) niet of niet meer onder de kop
        let p: number | null = null;
        for (const m of sec.querySelectorAll<HTMLElement>("[data-part]")) if (m.getBoundingClientRect().bottom <= hb.bottom + 4) p = Number(m.dataset.part);
        found = { d: sec.dataset.day!, p };
      }
      setStuckPart((v) => (v?.d === found?.d && v?.p === found?.p ? v : found));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  // De dagkop blijft tijdens het scrollen bovenaan staan, net onder de apparaatknoppen: die hoogte als CSS-variabele.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => document.documentElement.style.setProperty("--barh", el.offsetHeight + "px");
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);
  const [chipFade, setChipFade] = useState("");
  const updateChipFade = useCallback(() => {
    const el = chipsRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    const next = (left ? " fl" : "") + (right ? " fr" : "");
    setChipFade((v) => (v === next ? v : next));
  }, []);
  useEffect(() => {
    updateChipFade();
    window.addEventListener("resize", updateChipFade);
    return () => window.removeEventListener("resize", updateChipFade);
  }, [updateChipFade, devices, state]);

  // Binnenhalen (ring met percentage) en daarna het live-bolletje: rechts naast de knopjes van de bovenste dag, zodat de chips doorlopen.
  const liveStatus = !full && !histErr ? <LoadRing start={loadStart.current} /> : <LiveDot />;
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
          <div className="bar" ref={barRef}>
            <div className="bar-in">
            <div className={"chips" + chipFade} ref={chipsRef} onScroll={updateChipFade}>
              <button className={"chip" + (deviceNow === null ? " on" : "")} onClick={() => setDevice(null)}>Alle</button>
              {/* Apparaten die in gebruik zijn staan links (naast Alle), de rest rechts; binnen elke groep blijft de volgorde gelijk. */}
              {[...devices.filter((d) => activeNow(d.name)), ...devices.filter((d) => !activeNow(d.name))].map((d) => (
                <button key={d.name} className={"chip" + (deviceNow === d.name ? " on" : "") + (activeNow(d.name) ? " act" : " idle")} title={activeNow(d.name) ? `Nu in gebruik${activeApp(d.name) ? ": " + activeApp(d.name) : ""}` : "Niet in gebruik"} onClick={() => setDevice(d.name)}>
                  {activeNow(d.name) ? <span className="pulse" aria-hidden /> : silentNames.has(d.name) && "⚠ "}<DevIcon name={d.name} />{d.name}
                </button>
              ))}
            </div>
            {alertCount > 0 && (
              <button className="bang" onClick={() => setOpen(true)} aria-label={`${alertCount} waarschuwingen bekijken`} title="Waarschuwingen bekijken">
                !<span className="count">{alertCount}</span>
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

          {rawView && <RawLog rows={rawLog} devName={devName} devIds={device ? Object.entries(deviceMap.current).filter(([, l]) => l === device).map(([id]) => id) : null} device={device} onClose={toggleRaw} status={liveStatus} />}
          {!rawView && days.length === 0 && full && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list, mins: dm, devMins, rows: trows, hidden }, di) => {
            if (rawView) return null;
            // Per apparaat de echte-gebruik-sessies: een app waarna een andere app begon die ook doorliep, is niet meer "nu" (superseded).
            const humanSes = new Map<string, { s: number; e: number; r: unknown }[]>();
            // Alleen regels van echt gebruik (niet de altijd-getoonde regels van achtergrondverkeer, zoals Philips Hue).
            for (const r of trows) for (const x of r.ss) if (r.g.flag || isHuman(x)) (humanSes.get(r.g.dev) ?? humanSes.set(r.g.dev, []).get(r.g.dev)!).push({ s: x.s, e: x.e, r });
            const rows = trows;
            const today = dayKeyFmt.format(Date.now());
            const recent = d === today; // alleen vandaag staat open; gisteren en ouder zijn ingeklapt
            // Nog niets vandaag (net na middernacht): de bovenste dag blijft gewoon open staan; inklappen kan wel.
            // 's Nachts (tot 06:00) blijft gisteren ook open als er vandaag al iets is (tv na middernacht): de avond hoort er nog bij.
            const yesterdayIdx = days[0]?.d === today ? 1 : 0;
            const autoOpen = !recent && (di === 0 || (hourOf(Date.now()) < 6 && di === yesterdayIdx));
            const key = autoOpen ? d + "!" : d; // eigen sleutel: dichtklappen nu laat de dag later niet ineens open staan
            const isDayOpen = recent || (autoOpen ? !openDays.has(key) : openDays.has(key));
            // Het dagdeel bovenaan de lijst staat in de (vaste) dagkop; tijdens het scrollen wisselt het mee (Middag → Ochtend).
            const topPart = isDayOpen && rows[0]?.t && rows.some((r) => r.t && partOf(r.t) !== partOf(rows[0].t)) ? partOf(rows[0].t) : null;
            const shownPart = stuckPart?.d === d && stuckPart.p !== null ? stuckPart.p : topPart;
            return (
            <section key={d} data-day={d}>
              <h2
                className={(recent ? "" : "fold") + (isDayOpen ? " open" : "") + (stuckPart?.d === d ? " stuck" : "")}
                onClick={recent ? undefined : () => setOpenDays((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                role={recent ? undefined : "button"}
                aria-expanded={recent ? undefined : isDayOpen}
              >
                {/* Eén tekstblok: de dag blijft op één regel; past de samenvatting er niet achter, dan staat die als geheel op de regel eronder. */}
                <span className="dh-t"><span className="dh-d">{dayLabel(d)}</span>{(!recent || dm > 0) && <> <span className="muted dh-m"><span className="dh-dot">· </span>{recent ? (!device && devMins.length > 1 ? <button className="dh-tot" onClick={(e) => { e.stopPropagation(); setDevOpen((v) => !v); }} aria-expanded={devOpen} title="Per apparaat">{dur(dm)}<span className={"dh-tot-chev" + (devOpen ? " up" : "")} aria-hidden>›</span></button> : dur(dm)) : <>{list.length} {list.length === 1 ? "site" : "sites"}{dm > 0 ? ` · ${dur(dm)}` : ""}</>}</span></>}</span>
                {di === 0 && (
                  <span className="dpair">
                  <button className="dview icon" onClick={(e) => { e.stopPropagation(); toggleRaw(); }} aria-label="Alle DNS-regels" title="Alle DNS-regels"><LogIcon /></button>
                  <button
                    className={"dview icon" + (goOpen ? " on" : "")}
                    onClick={(e) => { e.stopPropagation(); setGoOpen((v) => !v); if (!goDay) setGoDay(days[0].d); }}
                    aria-expanded={goOpen}
                    aria-label="Ga naar dag en tijd"
                    title="Ga naar dag en tijd"
                  >
                    <CalendarIcon />
                  </button>
                  <span className="dstat">{liveStatus}</span>
                  </span>
                )}
                {shownPart !== null && <span className="dh-part" aria-hidden><PartIcon p={shownPart} />{PARTS[shownPart]}</span>}
                {!recent && <span className={"fold-chev" + (isDayOpen ? " up" : "")} aria-hidden>›</span>}
              </h2>
          {recent && devOpen && !device && devMins.length > 1 && (
            <div className="devtot">
              {devMins.map((x) => (
                <button key={x.dev} className="devtot-row" onClick={() => { setDevice(x.dev); setDevOpen(false); }} title={`Alleen ${x.dev}`}>
                  <span className="mdev"><DevIcon name={x.dev} />{x.dev}</span><span className="devtot-m">{dur(x.mins)}</span>
                </button>
              ))}
            </div>
          )}
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
              {isDayOpen && (() => {
                // Dagdelen: alleen als de dag er meer dan één heeft; een label bovenaan elk dagdeel.
                // Het bovenste label staat rustig óp de bovenrand van de lijst (half grijs, half wit), niet als extra regel erin.
                const multiPart = rows.some((r) => r.t && rows[0].t && partOf(r.t) !== partOf(rows[0].t));
                const cap = multiPart && rows[0]?.t ? partOf(rows[0].t) : null;
                return (
              <>
              {cap !== null && <div className="partcap" data-part={cap}><span><PartIcon p={cap} />{PARTS[cap]}</span></div>}
              <div className={"list day" + (cap !== null ? " capped" : "")}>
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
                  const partStart = multiPart && !!t && ri > 0 && (!!rows[ri - 1].t && partOf(rows[ri - 1].t) !== partOf(t) && dayKeyFmt.format(rows[ri - 1].t) === dayKeyFmt.format(t));
                  const key = g.d + g.site + g.dev;
                  const rowKey = key + ":" + t;
                  const isOpen = expanded === rowKey;
                  // Duur is het belangrijkste (waar ging de tijd heen): rechts groot. Daaronder klein wanneer het was.
                  const mins = rss.reduce((n, x) => n + minutes(x), 0);
                  const lastS = rss.reduce((a, x) => (x.e > a.e ? x : a), rss[0]);
                  const nowRow = !!t && (g.flag || isHuman(lastS)) && isNow(clock, lastS, g) && !superseded(lastS, (humanSes.get(g.dev) ?? []).filter((o) => o.r !== rows[ri]));
                  // Kort even geopend (geen duur), of altijd-getoond achtergrondverkeer zoals Philips Hue: lichter en lager.
                  const brief = !g.flag && !ctx.has(key) && !soft.has(key) && !nowRow && mins === 0 && !rss.every((x) => x.uz) && !(g.isNew && first);
                  // Tegelijk gebruikt op hetzelfde apparaat (Spotify tijdens een rit met Waze): met een lijntje aan de regel erboven
                  // vast, zodat het niet lijkt alsof de minuten bij elkaar opgeteld moeten worden. Alleen bij minstens een minuut overlap.
                  const prev = ri > 0 && !hourStart && !partStart ? rows[ri - 1] : undefined;
                  const together = !!prev && prev.g.dev === g.dev && mins > 0 && prev.ss.reduce((n, x) => n + minutes(x), 0) > 0 &&
                    Math.min(Math.max(...prev.ss.map((x) => x.e)), Math.max(...rss.map((x) => x.e))) - Math.max(Math.min(...prev.ss.map((x) => x.s)), Math.min(...rss.map((x) => x.s))) >= 60_000;
                  return (
                    <div key={rowKey} data-rk={rowKey} className={(devChange ? "devchange" : "") + (hourStart || partStart ? " hourstart" : "") + (together ? " together" : "")}>
                      {partStart ? <div className="partmark" data-part={partOf(t)}><span><PartIcon p={partOf(t)} />{PARTS[partOf(t)]}</span></div> : hourStart && <div className="hourmark"><span>{String(boundary).padStart(2, "0")}:00</span></div>}
                      <div
                        className={"item clickable" + (brief ? " brief" : "") + (nowRow ? " nowrow" : "") + (g.flag || ctx.has(key) ? " adult" : soft.has(key) ? " near-flag" : "") + (newest && g.flash && Date.now() - g.flash < 4000 ? " fresh" : "") + (gotoKey === rowKey ? " goto-hit" : "")}
                        onClick={() => { setExpanded(isOpen ? null : rowKey); if (!isOpen) loadDetail(g, rss, rowKey); }}
                        role="button"
                        aria-expanded={isOpen}
                      >
                        <span className="tstart">{t ? timeFmt.format(t) : ""}</span>
                        <Favicon domain={g.icon} name={g.name} app={!isPlainSite(g)} />
                        <div className="main">
                          <div className="name">{shortName(g.name)}{g.flag && <span className="flagtag">{g.flag === "VPN/proxy" ? "VPN" : g.flag}</span>}{g.isNew && first && <span className="newtag">Nieuw</span>}</div>
                          {(() => {
                            // Tweede regel: apparaat en duur, rustig en grijs; waarschuwingen erachter.
                            const parts: React.ReactNode[] = [];
                            parts.push(<span key="d" className="mdev" title={g.dev}><DevIcon name={g.dev} />{g.dev}</span>);
                            if (kindOf(g.name)) parts.push(<span key="k">{kindOf(g.name)}</span>);
                            if (together && prev) parts.push(<span key="t" className="with" title={`Tegelijk met ${prev.g.name}`}>tegelijk</span>);
                            if (rss.every((x) => x.uz)) { const w = rss.find((x) => x.uw)?.uw; parts.push(<span key="u" className="unsure" title={w ? UNSURE[w] : undefined}>{w ? `onzeker: ${UNSURE_KORT[w]}` : "onzeker"}</span>); }
                            if (g.flag && (g.bl ?? 0) > 0) parts.push(<span key="f">{g.bl}× geblokkeerd</span>); // het soort (18+, VPN, ...) staat als label achter de naam
                            if (ctx.has(key)) parts.push(<span key="c">⚠ rond dit bezoek: {ctx.get(key)}</span>);
                            else if (soft.has(key)) parts.push(<span key="s">⚠ rond 18+: {soft.get(key)}</span>);
                            if (!parts.length) return null;
                            return <div className="sub meta">{parts.flatMap((x, i) => (i ? [<span key={"s" + i} className="msep">·</span>, x] : [x]))}</div>;
                          })()}
                        </div>
                        <div className="time">
                          {nowRow ? <span className="tdur nowtag">{mins > 0 ? `nu · ${dur(mins)}` : "nu"}</span> : mins > 0 ? <span className="tdur">{dur(mins)}</span> : null}
                        </div>
                      </div>
                      {isOpen && (() => {
                        const near = around(g);
                        const redNear = near.some((o) => o.flag);
                        const showNear = redNear;
                        // Nakijken: het verzoek (en later het antwoord) hoort bij dit bezoek (apparaat, site, begintijd).
                        const s0 = Math.min(...rss.map((x) => x.s)), e0 = Math.max(...rss.map((x) => x.e));
                        const mine = reviews.filter((r) => r.dev === g.dev && r.site === g.site && r.s === s0);
                        const reviewOpen = mine.find((r) => !r.done), reviewDone = mine.find((r) => r.done);
                        return (
                          <div className="detail">
                            <div className="why">Waarom: {whyShown(g, rss)}</div>
                            {reviewDone && <p className="review-ans"><b>Nagekeken:</b> {reviewDone.antwoord}</p>}
                            {reviewOpen && <p className="review-wait">Wordt nagekeken. Het antwoord komt hier te staan.</p>}
                            <a
                              className="open-btn"
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
                            <WeekBars name={shortName(g.name)} data={perDay.get(g.dev + "|" + g.site)} />
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
                            {!reviewOpen && (
                              <div className="review">
                                <button
                                  type="button"
                                  className="review-btn"
                                  disabled={reviewBusy === rowKey}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReviewBusy(rowKey);
                                    setReviewErr(null);
                                    askReview({ d: g.d, dev: g.dev, site: g.site, name: g.name, s: s0, e: e0 })
                                      .then(loadReviews, (er) => setReviewErr(er instanceof Error ? er.message : "Versturen lukte niet."))
                                      .finally(() => setReviewBusy(null));
                                  }}
                                >
                                  {reviewBusy === rowKey ? "Bezig…" : reviewDone ? "Opnieuw nakijken" : "Nakijken"}
                                </button>
                                {reviewErr && reviewBusy === null && <p className="review-err">{reviewErr}</p>}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                  });
                })()}
              </div>
              </>
                );
              })()}
              {/* Wat er bewust níet staat, met de reden: zo is zelf na te gaan dat er niets gemist is. */}
              {/* Pas als vandaag compleet is (cut = 0): tijdens het snelle eerste beeld groeit de lijst nog, en dan zou dit verspringen. */}
              {isDayOpen && hidden.length > 0 && !cut && (
                <details className="hidden-list">
                  <summary>Niet getoond ({hidden.length})</summary>
                  {hidden.map((h, i) => (
                    <div key={i} className="hid">
                      <span className="ht">{timeFmt.format(h.t)}</span>
                      <span className="hn">{h.g.name}{!device && <span className="muted"> · {h.g.dev}</span>}</span>
                      <span className="hw">{h.why}</span>
                    </div>
                  ))}
                </details>
              )}
            </section>
            );
          })}
          {/* Alleen het laatste uur staat er: de rest van vandaag laadt nog (zelfde glans als het skelet). */}
          {/* Vandaag is binnen maar leeg (net na middernacht): dat zeggen, geen grijze blokjes die op laden lijken. */}
          {cut === 0 && days.length === 0 && !full && !histErr && <p className="muted skel-empty">Vandaag nog niets gebruikt.</p>}
          {cut > 0 && !histErr && (
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
          {!full && !histErr && !cut && (
            <div className="skel-days" aria-label="Oudere dagen laden">
              <p className="muted skel-note">Oudere dagen laden…</p>
              {[150, 190, 170].map((w, i) => <div key={i} className="skel-day"><span className="sk" style={{ width: w, height: 14 }} /><span className="sk" style={{ width: 14, height: 14 }} /></div>)}
            </div>
          )}
          {histErr && <p className="muted skel-err">{cut > 0 ? "Eerder vandaag en oudere dagen laden lukt nu even niet." : "Oudere dagen laden lukt nu even niet; vandaag is wel compleet."}</p>}
          {full && windowFrom > 0 && groups.some((g) => g.d <= dayKeyFmt.format(windowFrom + 86_400_000)) && ( // alleen als de 30 dagen vol zijn (anders is er niets ouder)
            <div className="older">
              <button type="button" disabled={olderBusy} onClick={() => { setOlderBusy(true); void refreshFull(false, true).finally(() => setOlderBusy(false)); }}>
                {olderBusy ? "Oudere dagen laden…" : "Oudere dagen laden"}
              </button>
              <span className="muted">Nu zichtbaar: de laatste 30 dagen.</span>
            </div>
          )}
          {/* Instellingen en uitloggen pas als vandaag compleet is (cut = 0): anders schuiven ze omlaag terwijl de lijst groeit. */}
          {!cut && (
            <>
          <section className="settings">
            <PushToggle />
          </section>
          {/* Uitloggen: na 2 uur zonder gebruik gebeurt dat vanzelf. "Overal" sluit ook andere apparaten af (telefoon kwijt). */}
          <form className="logout" method="post" action="/api/logout.php" onSubmit={(e) => {
            // Eerst de bewaarde kopie van het logboek op dit toestel weghalen (lib/wipe.ts), dan pas uitloggen. De gekozen knop
            // (dit toestel of overal) gaat als verborgen veld mee, want submit() neemt de knop zelf niet mee.
            e.preventDefault();
            const f = e.currentTarget;
            const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            if (b?.name) { const h = document.createElement("input"); h.type = "hidden"; h.name = b.name; h.value = b.value; f.appendChild(h); }
            void wipeLocal().finally(() => f.submit());
          }}>
            <button type="submit">Uitloggen</button>
            <span aria-hidden>·</span>
            <button type="submit" name="alle" value="1">Overal uitloggen</button>
          </form>
            </>
          )}
        </>
      )}
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="panel" role="dialog" aria-label="Waarschuwingen" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Waarschuwingen</h3>
              <button className="close" onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
            {alertCount === 0 && <p className="muted">Geen nieuwe waarschuwingen.</p>}
            {newExtra.length > 0 && (
              <>
                <div className="dh">Aandacht</div>
                {newExtra.map((a) => (
                  <div className="hit" key={a.key}>
                    <span className="tag amber">{a.tag}</span>
                    <div className="main">
                      <div className="name">{a.title}</div>
                      <div className="sub">{a.sub}</div>
                    </div>
                    <button className="seen" onClick={() => markSeen([a.key])}>Gezien</button>
                  </div>
                ))}
              </>
            )}
            {newSilent.length > 0 && (
              <>
                <div className="dh">Apparaat ongewoon stil</div>
                {newSilent.map((x) => (
                  <div className="hit" key={x.name}>
                    <span className="tag amber">Stil</span>
                    <div className="main">
                      <div className="name">{x.name}</div>
                      <div className="sub">Geen verzoeken sinds {timeFmt.format(x.last)} ({dur(Math.round(x.since / 60000))}); normaal ±{dur(Math.max(1, Math.round(x.gap / 60000)))} overdag. Uitgezet, offline, of VPN / mobiel internet?</div>
                    </div>
                    <button className="seen" onClick={() => markSeen([silentKey(x)])}>Gezien</button>
                  </div>
                ))}
              </>
            )}
            {newFlagged.length > 0 && <p className="muted">Gemarkeerde sites (18+, dating, VPN/proxy, geblokkeerd) in de logs, nieuwste eerst. Ze blijven altijd rood in de lijst staan.</p>}
            {newFlagged.map((g) => (
              <div className="hit" key={g.d + g.dev + g.site}>
                <span className="tag">{g.flag ?? "In de buurt"}</span>
                <div className="main">
                  <div className="name">{g.name}</div>
                  <div className="sub">{ctx.get(g.d + g.site + g.dev) && <>rond dit bezoek: {ctx.get(g.d + g.site + g.dev)} · </>}{g.dev} · laatst {dayLabel(g.d).toLowerCase()} om {timeFmt.format(g.last)}</div>
                </div>
                <button className="seen" onClick={() => markSeen([flagKey(g)])}>Gezien</button>
              </div>
            ))}
            {alertCount > 1 && (
              <button className="seen-all" onClick={() => { markSeen([...newExtra.map((a) => a.key), ...newSilent.map(silentKey), ...newFlagged.map(flagKey)]); setOpen(false); }}>Alles gezien</button>
            )}
          </div>
        </div>
      )}
      <ToTop />
    </main>
  );
}
