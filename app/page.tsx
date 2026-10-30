"use client";

import { OPEN_BURST, extendAll, extendSessions, minutes, type Session, isHuman } from "@/lib/sessions";
import { mergeRows } from "@/lib/merge";
import { activeMinutes, usage } from "@/lib/usage";
import { HEARTBEAT_GAP, runsAlongside, setLearnedFg } from "@/lib/sites";
import { isPlainSite } from "@/lib/system";
import { isSilent } from "@/lib/devstats";
import { FB_OWN, IG_OWN, companionFor, liveInstagramShared } from "@/lib/companion";
import { isNow, liveTvApp } from "@/lib/play";
import { activeWhat, deviceUse, isActiveNow, isTv, overtaken, superseded } from "@/lib/livestatus";
import { apiFetch } from "@/lib/browser-api";
import { flushSync } from "react-dom";
import { mergeLiveGroup } from "@/lib/recent";
import { wipeLocal } from "@/lib/wipe";
import { askReview, listReviews, type NakijkItem } from "@/lib/nakijken-client";
import { netInfo, netNames, netText, setNetName, type NetInfo } from "@/lib/netinfo-client";
import { noRealSite, siteCheck, type SiteCheck } from "@/lib/sitecheck-client";
import { netKey } from "@/lib/network";
import { amsterdamMidnight } from "@/lib/nextdns";
import { startActivityReporting } from "@/lib/activity";
import { startHaptics } from "@/lib/haptic";
import { checkLogin } from "@/lib/php-client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Device, Event, Group, Insights } from "./types";
import { DevIcon, NetIcon, dayKeyFmt, dayLabel, dur, hourOf, sumMin, timeFmt, timeSecFmt } from "./ui";
import { shortName, kindOf, Favicon, CalendarIcon, PARTS, partOf, PartIcon, OutIcon, LogIcon } from "./icons";
import { RawLog } from "./rawlog";
import { WatchStuck, PushToggle } from "./push-ui";

/** Zoekmachines en beeldzoekers: bij een 18+-adres kort erna/ervoor markeren we ook deze regel. */
const isSearch = (site: string) => /^google\.[a-z.]+$/.test(site) || ["bing.com", "duckduckgo.com", "ecosia.org", "yahoo.com", "startpage.com", "qwant.com", "yandex.com", "brave.com", "pinterest.com", "pinterest.nl"].includes(site);


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
  // Ringetje dat rustig ronddraait zolang live binnenhalen werkt (wens eigenaar 28 okt: duidelijker dat het loopt); bij nieuwe regels
  // even een tikje sneller; oranje en stil als er even geen antwoord komt; rood met een streep erdoor als het niet lukt.
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
        <circle className="live-bg" cx="12" cy="12" r="8" />
        <path className="live-arc" d="M12 4a8 8 0 0 1 8 8" />
        {kind === "fail" && <path d="M6 6l12 12" />}
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
const UNSURE_KORT = { reclame: "misschien reclame", opstart: "alleen gestart", ontgrendel: "bij ontgrendelen", geensite: "geen echte website" } as const;
const UNSURE = {
  reclame: "Onzeker: één los adres terwijl een social-app (zoals Instagram, Facebook of X) open was. Kan een advertentie of voorvertoning zijn die de app alvast laadde, of echt geopend.",
  opstart: "Onzeker: de app is gestart, maar er laadde geen inhoud (geen foto's of berichten). Misschien alleen even open, of vanzelf gestart.",
  ontgrendel: "Onzeker: begon op hetzelfde moment als andere apps, zoals bij het ontgrendelen of op wifi komen. Of deze app echt geopend werd, is niet te zien.",
  geensite: "Onzeker: op dit adres staat geen echte website (alleen techniek, een foutmelding of een lege pagina). Waarschijnlijk een onderdeel van een andere site of app, geen bezoek.",
} as const;

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

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  // Soort netwerk per adres (mobiel internet / andere wifi), voor regels buiten het thuisnetwerk.
  const [nets, setNets] = useState<Record<string, NetInfo | null>>({});
  const [siteChk, setSiteChk] = useState<Record<string, SiteCheck | null>>({}); // websitecontrole van nieuwe sites
  // "Nieuw"-puntje alleen de eerste keer dat de eigenaar de site in het overzicht ziet (wens eigenaar 28 okt): bij een volgende keer
  // openen is het weg. Onthouden op dit toestel; kan het niet (privévenster), dan gewoon tonen zoals voorheen.
  const SEEN_KEY = "klaro.nieuwGezien";
  const HEARTBEAT_KEY = "klaro.vasteMelding"; // apps met een echte vaste melding (zie lib/usage.ts), voor de eerste seconden
  const [seenBefore] = useState<Set<string>>(() => {
    try { const m = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>; return new Set(Object.keys(m)); } catch { return new Set(); }
  });
  const [netNamen, setNetNamen] = useState<Record<string, string>>({}); // eigen namen voor netwerken ("werk")
  useEffect(() => { netNames().then(setNetNamen); }, []);
  const netOf = (ip: string) => (ip.includes(":") ? netKey(ip) : ip);
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
  const [goOpen, setGoOpen] = useState(false); // "Ga naar dag en tijd"
  const [outside, setOutside] = useState(false); // filter: alleen wat buiten het thuisnetwerk gebeurde (mobiel internet of andere wifi)
  // Weergave: het eigen overzicht, of live de regels zoals NextDNS ze ziet.
  const [rawView, setRawView] = useState(false);
  // Klaro opent altijd in het gewone overzicht; de NextDNS-lijst is een uitstapje (wens eigenaar), dus de keuze wordt niet onthouden.
  // Echt gebruik (tikken, scrollen, typen) aan de server melden: na 2 uur zonder gebruik logt de server iedereen uit.
  useEffect(() => startActivityReporting(checkLogin), []);
  useEffect(() => startHaptics(), []); // korte tik bij knoppen en menu's (iPhone met iOS 18+, Android)
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
  const [clock, setClock] = useState(() => Date.now()); // elke 20 sec: "nu actief" opnieuw beoordelen
  const [tick, setTick] = useState(0); // elke minuut: "ongewoon stil" opnieuw beoordelen
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  const loadStart = useRef(Date.now()); // begin van het laden (voor het percentage rechtsboven)
  const [live, setLive] = useState<"ok" | "fail">("ok");
  const [liveError, setLiveError] = useState("");
  const followOf = useRef<Record<string, string>>({}); // apparaat|adres -> app (doorverwijs-adressen, van de server)
  // apparaat|app met een echte vaste melding tijdens gebruik (van de server); onthouden zodat het ook klopt vóór alles geladen is.
  const heartbeat = useRef<string[] | undefined>(undefined);
  if (heartbeat.current === undefined && typeof window !== "undefined") {
    try { const v = JSON.parse(localStorage.getItem(HEARTBEAT_KEY) ?? "null"); if (Array.isArray(v)) heartbeat.current = v; } catch {}
  }
  const lastSeen = useRef(0);
  const metaLast = useRef(new Map<string, { ig: number; fb: number }>()); // per apparaat: laatste eigen Instagram-/Facebook-adres (live)
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
    const apply = (data: { groups: Group[]; devices: Device[]; total: number; deviceMap?: Record<string, string>; insights?: Insights; partial?: number; auto?: string[]; followers?: Record<string, string>; heartbeat?: string[]; fgLearned?: Record<string, string[]> }, isFull: boolean) => {
      fullRef.current = true;
      // Bij alleen het laatste stuk: de eerste 15 minuten van dat stuk niet tonen (een bezoek dat eerder begon zou daar te laat lijken te beginnen).
      // Begint dat stuk vóór middernacht (net na 0:00), dan is vandaag al compleet: niets meer te wachten voor vandaag.
      setCut(data.partial && data.partial > amsterdamMidnight(Date.now()) ? data.partial + 15 * 60_000 : 0);
      setGroups(data.groups);
      setDevices(data.devices);
      setTotal(data.total);
      deviceMap.current = data.deviceMap ?? {};
      if (data.followers) followOf.current = data.followers;
      if (data.heartbeat) { heartbeat.current = data.heartbeat; try { localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(data.heartbeat)); } catch {} }
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
    // Geen geluid op de pagina (wens eigenaar); rood komt als pushmelding op de iPhone (scripts/waarschuw.ts).
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
        // Instagram gebruikt ook Facebook-adressen (graph, gateway, netwerkmeting): bij Instagram, net als op de server.
        if (e.host) {
          const ml = metaLast.current.get(e.dev) ?? { ig: 0, fb: 0 };
          if (IG_OWN.test(e.host)) ml.ig = e.t;
          else if (FB_OWN.test(e.host)) ml.fb = e.t;
          metaLast.current.set(e.dev, ml);
          const ig = next.find((g) => g.d === d && g.dev === e.dev && g.site === "instagram.com");
          if (ig && liveInstagramShared(e.host, e.t, ml.ig, ml.fb)) e = { ...e, site: ig.site, name: ig.name, icon: ig.icon, bg: false, main: true, fg: undefined, res: undefined, cat: ig.cat ?? e.cat };
        }
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
  }, [addRaw]);

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
      if (data.heartbeat) { heartbeat.current = data.heartbeat; try { localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(data.heartbeat)); } catch {} }
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
      const horizon: number = data.horizon ?? data.insights?.until ?? 0; // tot hier had de herberekening de regels
      const todayKey = dayKeyFmt.format(Date.now());
      setGroups((prev) => {
        const seenKeys = new Set<string>();
        const next = prev.map((g) => {
          const k = g.d + "|" + g.dev + "|" + g.site;
          seenKeys.add(k);
          const f = fresh.get(k);
          // Alleen live gezien en de herberekening van vandaag kent het niet: wat vóór de horizon viel, hoort elders.
          if (!f) return recent && horizon && g.d === todayKey && g.last <= horizon ? null : g;
          // Is de volledige lijst even recent of recenter dan wat we live hebben, dan is die leidend (nieuwe bezoeken, sessies, rode markering).
          // De herberekening is leidend; wat live al nieuwer binnenkwam, komt erachter (lib/recent.ts).
          return { ...mergeLiveGroup(f, g, horizon), isNew: f.isNew || g.isNew, flash: g.flash };
        });
        // Groepen die live gemist zijn, komen er alsnog bij.
        for (const [k, f] of fresh) if (!seenKeys.has(k)) next.push(f);
        return next.filter((g): g is Group => g !== null);
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
  const lastUse = useMemo(() => deviceUse(groups, auto, followOf.current, heartbeat.current), [groups, auto]);
  // Adressen van de periodes buiten het thuisnetwerk: één keer opvragen welk soort netwerk het was.
  useEffect(() => {
    const ips = [...new Set(devices.flatMap((d) => (d.away?.runs ?? []).map((r) => r.ip).filter((ip): ip is string => !!ip)))].filter((ip) => !(ip in nets));
    if (!ips.length) return;
    let stop = false;
    (async () => { for (const ip of ips) { const v = await netInfo(ip); if (stop) return; setNets((n) => ({ ...n, [ip]: v })); } })();
    return () => { stop = true; };
  }, [devices, nets]);
  // Nieuwe sites (eerste keer gezien): één keer laten nakijken of er wel een echte website staat (de server onthoudt het 30 dagen).
  // Geen echte website = de regel wordt onzeker, nooit verborgen. Rood (18+, dating, VPN) nooit: de server haalt dat ook niet op.
  useEffect(() => {
    const hosts = [...new Set(groups.filter((g) => g.isNew && g.main && !g.bg && !g.flag && isPlainSite(g)).map((g) => g.site))].filter((h) => !(h in siteChk)).slice(0, 30);
    if (!hosts.length) return;
    let stop = false;
    (async () => { for (const h of hosts) { const v = await siteCheck(h); if (stop) return; setSiteChk((c) => ({ ...c, [h]: v })); } })();
    return () => { stop = true; };
  }, [groups, siteChk]);
  // Nieuwe sites die nu in beeld zijn als gezien onthouden (pas voor de volgende keer openen; nu blijft het puntje staan).
  useEffect(() => {
    if (!full) return;
    const fresh = groups.filter((g) => g.isNew).map((g) => g.site);
    if (!fresh.length) return;
    try {
      const m = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
      const now = Date.now();
      for (const k of Object.keys(m)) if (now - m[k] > 7 * 86_400_000) delete m[k];
      for (const site of fresh) m[site] ??= now;
      localStorage.setItem(SEEN_KEY, JSON.stringify(m));
    } catch {}
  }, [groups, full]);
  /** Was dit apparaat op dit moment buiten het thuisnetwerk? Dan de periode (met het adres), anders niets. */
  const awayAt = (dev: string, t: number) => devices.find((d) => d.name === dev)?.away?.runs.find((r) => t >= r.s - 60_000 && t <= r.e + 60_000);
  const awayRaw = useCallback((dev: string, t: number) => !!devices.find((d) => d.name === dev)?.away?.runs.some((r) => t >= r.s - 60_000 && t <= r.e + 60_000), [devices]);
  const activeNow = (name: string) => isActiveNow(lastUse, name, clock);
  const activeApp = (name: string) => activeWhat(lastUse, name, clock);

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
  const use = useMemo(() => usage(groups, { auto, followers: followOf.current, heartbeat: heartbeat.current, mailT, cut }), [groups, mailT, cut, auto]);
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
        for (const ss of byDev.values()) mins += activeMinutes(ss);
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

  // Apparaatknoppen die niet allemaal passen: zacht vervagen aan de kant waar er nog meer staat (dan zie je dat je kunt schuiven).
  const chipsRef = useRef<HTMLDivElement>(null);
  // Het dagdeel (Ochtend, Middag, ...) waar je doorheen scrolt: in de vaste dagkop, zodra het eigen label onder de kop verdwenen is.
  // p: null = de lijst schuift al onder de kop, maar er is (nog) geen dagdeel voorbij; dan alleen de afgeronde bovenrand.
  // n: het volgende dagdeel dat over het label heen schuift (zie hieronder), anders null.
  const [stuckPart, setStuckPart] = useState<{ d: string; p: number | null; n: number | null } | null>(null);
  useEffect(() => {
    let raf = 0;
    const OVER = 44; // vanaf zoveel px onder het label schuift het volgende dagdeel eroverheen
    const PUSH = 48; // het einde van de lijst duwt het label weg
    const check = () => {
      raf = 0;
      let found: { d: string; p: number | null; n: number | null } | null = null;
      for (const sec of document.querySelectorAll<HTMLElement>("section[data-day]")) {
        const h = sec.querySelector("h2");
        if (!h) continue;
        h.style.setProperty("--push", "0px");
        h.style.setProperty("--fade", "1");
        h.style.setProperty("--in-op", "0");
        const marks = sec.querySelectorAll<HTMLElement>("[data-part]");
        for (const m of marks) m.style.removeProperty("--mark-op");
        const hb = h.getBoundingClientRect(), sb = sec.getBoundingClientRect();
        if (sb.top > hb.top - 1 || sb.bottom < hb.bottom) continue; // deze kop staat niet vast bovenaan
        const list = sec.querySelector(".list.day");
        const lb = list?.getBoundingClientRect();
        if (!lb || lb.top >= hb.bottom - 2) continue; // de lijst zit (nog) niet onder de kop
        const lab = h.querySelector(".dh-part:not(.dh-in)")?.getBoundingClientRect();
        const cy = lab ? lab.top + lab.height / 2 : hb.bottom; // midden van het label in de kop
        let p: number | null = null, n: number | null = null, d = Infinity, nm: HTMLElement | undefined;
        for (const m of marks) {
          const r = (m.querySelector("span") ?? m).getBoundingClientRect(), mc = r.top + r.height / 2;
          if (mc <= cy) p = Number(m.dataset.part); // wisselen zodra het midden van het nieuwe label het oude bereikt
          else if (mc - cy < d) { d = mc - cy; n = Number(m.dataset.part); nm = m; }
        }
        // Het volgende dagdeel schuift als label over het huidige heen en neemt het daarna over (wens eigenaar 30 okt):
        // het nieuwe label (.dh-in) volgt precies de plek van het dagdeel in de lijst, het oude vervaagt eronder.
        if (d < OVER && nm) {
          const t = 1 - d / OVER;
          h.style.setProperty("--in-y", d.toFixed(1) + "px");
          h.style.setProperty("--in-op", Math.min(1, t * 2).toFixed(2));
          h.style.setProperty("--fade", (1 - t).toFixed(2));
          nm.style.setProperty("--mark-op", "0"); // het label in de lijst zelf niet dubbel tonen
        } else n = null;
        // Het einde van de lijst duwt het label omhoog weg (zoals kopjes in een iOS-lijst).
        const near = Math.max(0, Math.min(1, (PUSH - (lb.bottom - 64 - hb.bottom)) / PUSH));
        if (near > 0) {
          h.style.setProperty("--push", (near * 20).toFixed(1) + "px");
          h.style.setProperty("--fade", (1 - near).toFixed(2));
        }
        if (lb.bottom <= hb.bottom + 30) continue; // de lijst is bijna voorbij: label is weggeduwd, niet meer vast
        found = { d: sec.dataset.day!, p, n };
      }
      // Direct tekenen (niet een beeld later): anders staat bij het overnemen heel even het oude label weer vol in beeld.
      flushSync(() => setStuckPart((v) => (v?.d === found?.d && v?.p === found?.p && v?.n === found?.n ? v : found)));
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
          <WatchStuck />
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

          {rawView && <RawLog rows={rawLog} devName={devName} devIds={device ? Object.entries(deviceMap.current).filter(([, l]) => l === device).map(([id]) => id) : null} device={device} onClose={toggleRaw} status={liveStatus} outside={outside} onOutside={() => setOutside((v) => !v)} awayAt={awayRaw} lastAway={(() => { const ends = devices.filter((d) => !device || d.name === device).flatMap((d) => (d.away?.runs ?? []).map((r) => r.e)); return ends.length ? Math.max(...ends) : null; })()} />}
          {!rawView && days.length === 0 && full && <p className="muted pad">Niets gevonden.</p>}
          {days.map(({ d, list, rows: trows, hidden }, di) => {
            if (rawView) return null;
            // Per apparaat de echte-gebruik-sessies: een app waarna een andere app begon die ook doorliep, is niet meer "nu" (superseded).
            const humanSes = new Map<string, { s: number; e: number; r: unknown }[]>();
            // Alleen regels van echt gebruik (niet de altijd-getoonde regels van achtergrondverkeer, zoals Philips Hue).
            for (const r of trows) for (const x of r.ss) if (r.g.flag || isHuman(x)) (humanSes.get(r.g.dev) ?? humanSes.set(r.g.dev, []).get(r.g.dev)!).push({ s: x.s, e: x.e, r });
            // Filter "buiten de deur": alleen regels van momenten buiten het thuisnetwerk (mobiel internet of een andere wifi).
            const rows0 = outside ? trows.filter((r) => r.t && awayAt(r.g.dev, r.t)) : trows;
            // Een korte zoekopdracht bij Google (hooguit 2 min) waarna op hetzelfde apparaat een site opende (binnen 1 min na het
            // zoeken): alleen de site blijft staan (tekst "via Google" weg: wens eigenaar). De minuten van de dag blijven hetzelfde.
            const hideG = new Set<number>();
            for (let i = 0; i < rows0.length; i++) {
              const r = rows0[i];
              if (r.g.site !== "google.com" || r.g.flag || !r.t || r.ss.reduce((n, x) => n + minutes(x), 0) > 2) continue;
              const gEnd = Math.max(...r.ss.map((x) => x.e));
              for (let j = i - 1; j >= 0; j--) {
                const o = rows0[j];
                if (!o.t || o.t > gEnd + 60_000) break;
                if (o.g.dev === r.g.dev && o.g.site !== "google.com" && isPlainSite(o.g) && o.t >= r.t) { hideG.add(i); break; }
              }
            }
            const rows = hideG.size ? rows0.filter((_, i) => !hideG.has(i)) : rows0;
            // "Nieuw" alleen bij de allereerste keer die dag (over alle apparaten), niet bij elk apparaat of elk volgend bezoek.
            const firstNew = new Map<string, number>();
            for (const r of rows) if (r.g.isNew && r.first && r.t && (firstNew.get(r.g.site) ?? Infinity) > r.t) firstNew.set(r.g.site, r.t);
            if (outside && di > 0 && !rows.length) return null;
            const today = dayKeyFmt.format(Date.now());
            const recent = d === today; // alleen vandaag staat open; gisteren en ouder zijn ingeklapt
            // Nog niets vandaag (net na middernacht): de bovenste dag blijft gewoon open staan; inklappen kan wel.
            // 's Nachts (tot 06:00) blijft gisteren ook open als er vandaag al iets is (tv na middernacht): de avond hoort er nog bij.
            const yesterdayIdx = days[0]?.d === today ? 1 : 0;
            const autoOpen = !recent && (di === 0 || (hourOf(Date.now()) < 6 && di === yesterdayIdx));
            const key = autoOpen ? d + "!" : d; // eigen sleutel: dichtklappen nu laat de dag later niet ineens open staan
            const isDayOpen = recent || (autoOpen ? !openDays.has(key) : openDays.has(key));
            // Het dagdeel bovenaan de lijst staat in de (vaste) dagkop; tijdens het scrollen wisselt het mee (Middag → Ochtend).
            // Ook als alles in één dagdeel valt (iPhone 's ochtends): het label staat er altijd, zodat elke dag er hetzelfde uitziet.
            const topPart = isDayOpen && rows[0]?.t ? partOf(rows[0].t) : null;
            const shownPart = stuckPart?.d === d && stuckPart.p !== null ? stuckPart.p : topPart;
            // Tik op de minuten: per apparaat de minuten, en van wanneer tot wanneer het echt gebruikt werd.
            return (
            <section key={d} data-day={d} className={di === 0 && goOpen ? "goopen" : undefined}>
              <h2
                className={(recent ? "" : "fold") + (isDayOpen ? " open" : "") + (stuckPart?.d === d ? " stuck" : "")}
                onClick={recent ? undefined : () => setOpenDays((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                role={recent ? undefined : "button"}
                aria-expanded={recent ? undefined : isDayOpen}
              >
                {/* Eén tekstblok: de dag blijft op één regel; past de samenvatting er niet achter, dan staat die als geheel op de regel eronder. */}
                <span className="dh-t"><span className="dh-d">{dayLabel(d)}</span>{!recent && list.length > 0 && <> <span className="muted dh-m"><span className="dh-dot">· </span>{outside ? <>{rows.length}× niet via thuis-wifi</> : <>{list.length} {list.length === 1 ? "site" : "sites"}</>}</span></>}</span>
                {di === 0 && (
                  <span className="dpair">
                  <button className="dview icon" onClick={(e) => { e.stopPropagation(); toggleRaw(); }} aria-label="Alle DNS-regels" title="Alle DNS-regels"><LogIcon /></button>
                  <button className={"dview icon" + (outside ? " on" : "")} onClick={(e) => { e.stopPropagation(); setOutside((v) => !v); }} aria-pressed={outside} aria-label="Alleen niet via thuis-wifi (mobiele data of een andere wifi)" title="Alleen niet via thuis-wifi"><OutIcon /></button>
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
                {/* Met het tijdpaneel open hoort het dagdeel bij de lijst eronder, niet half over het paneel (zie .goopen). */}
                {shownPart !== null && !(di === 0 && goOpen) && <span className="dh-part" aria-hidden><PartIcon p={shownPart} />{PARTS[shownPart]}</span>}
                {stuckPart?.d === d && stuckPart.n !== null && !(di === 0 && goOpen) && <span className="dh-part dh-in" aria-hidden><PartIcon p={stuckPart.n} />{PARTS[stuckPart.n]}</span>}
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
              {outside && isDayOpen && !rows.length && <p className="muted pad">Vandaag alles via de wifi thuis.</p>}
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
                  const othersNow = (humanSes.get(g.dev) ?? []).filter((o) => o.r !== rows[ri]);
                  const nowRow = !!t && (g.flag || isHuman(lastS)) && isNow(clock, lastS, g) && !superseded(lastS, othersNow) &&
                    (isTv(g.dev) || runsAlongside(g.site) || !overtaken(lastS, othersNow.filter((o) => !runsAlongside((o.r as { g: { site: string } }).g.site))));
                  // Kort even geopend (geen duur), of altijd-getoond achtergrondverkeer zoals Philips Hue: lichter en lager.
                  const brief = !g.flag && !ctx.has(key) && !soft.has(key) && !nowRow && mins === 0 && !rss.every((x) => x.uz) && !(g.isNew && first);
                  // Tegelijk gebruikt op hetzelfde apparaat (Spotify tijdens een rit met Waze): met een lijntje aan de regel erboven
                  // vast, zodat het niet lijkt alsof de minuten bij elkaar opgeteld moeten worden. Alleen bij minstens een minuut overlap
                  // én als één van de twee doorloopt (muziek, navigatie); anders is het wisselen (Instagram en Facebook), geen lijntje.
                  const prev = ri > 0 && !hourStart && !partStart ? rows[ri - 1] : undefined;
                  const together = !!prev && prev.g.dev === g.dev && (runsAlongside(g.site) || runsAlongside(prev.g.site)) && mins > 0 && prev.ss.reduce((n, x) => n + minutes(x), 0) > 0 &&
                    Math.min(Math.max(...prev.ss.map((x) => x.e)), Math.max(...rss.map((x) => x.e))) - Math.max(Math.min(...prev.ss.map((x) => x.s)), Math.min(...rss.map((x) => x.s))) >= 60_000;
                  return (
                    <div key={rowKey} data-rk={rowKey} className={(devChange ? "devchange" : "") + (hourStart || partStart ? " hourstart" : "") + (together ? " together" : "")}>
                      {partStart ? <div className="partmark" data-part={partOf(t)}><span><PartIcon p={partOf(t)} />{PARTS[partOf(t)]}</span></div> : hourStart && <div className="hourmark"><span>{String(boundary).padStart(2, "0")}:00</span></div>}
                      <div
                        className={"item clickable" + (brief ? " brief" : "") + (nowRow ? " nowrow" : "") + (g.flag || ctx.has(key) ? " adult" : soft.has(key) ? " near-flag" : "") + (newest && g.flash && Date.now() - g.flash < 4000 ? " fresh" : "") + (gotoKey === rowKey ? " goto-hit" : "")}
                        onClick={() => setExpanded(isOpen ? null : rowKey)}
                        role="button"
                        aria-expanded={isOpen}
                      >
                        <span className="tstart">{t ? timeFmt.format(t) : ""}</span>
                        <Favicon domain={g.icon} name={g.name} app={!isPlainSite(g)} />
                        <div className="main">
                          <div className="name">{shortName(g.name)}{g.flag && <span className="flagtag">{g.flag === "VPN/proxy" ? "VPN" : g.flag}</span>}{g.isNew && first && firstNew.get(g.site) === t && !seenBefore.has(g.site) && <span className="newdot" title="Nieuw: de eerste keer" aria-label="Nieuw" />}</div>
                          {(() => {
                            // Tweede regel: apparaat en duur, rustig en grijs; waarschuwingen erachter.
                            const parts: React.ReactNode[] = [];
                            // Apparaat alleen bij "Alle": met een apparaat-filter aan staat het al bovenin (wens eigenaar).
                            if (!device) parts.push(<span key="d" className="mdev" title={g.dev}><DevIcon name={g.dev} />{g.dev}</span>);
                            // Niet thuis: mobiel internet of een andere wifi (uit het internetadres; 4G of 5G is niet te zien).
                            const ar = t ? awayAt(g.dev, t) : undefined;
                            if (ar) { const ni = ar.ip ? nets[ar.ip] : undefined; const nt = netText(ni, { naam: ar.ip ? netNamen[netOf(ar.ip)] : undefined, hotspot: ar.hotspot }); parts.push(<span key="n" className="netw" title={nt.uitleg}><NetIcon soort={nt.icon} />{nt.text}</span>); }
                            if (kindOf(g.name)) parts.push(<span key="k">{kindOf(g.name)}</span>);
                            // Het streepje tussen de icoontjes laat al zien dat twee dingen tegelijk liepen (geen woord "tegelijk" meer).
                            // Onzeker: kort; de uitleg staat in de details.
                            const geenSite = !!g.isNew && !g.flag && isPlainSite(g) && noRealSite(siteChk[g.site]); // websitecontrole: geen echte website
                            if (geenSite || rss.every((x) => x.uz)) { const w = geenSite ? "geensite" : rss.find((x) => x.uw)?.uw; parts.push(<span key="u" className="unsure" title={w ? UNSURE[w] : undefined}>onzeker</span>); }
                            if (g.flag && (g.bl ?? 0) > 0) parts.push(<span key="f">{g.bl}× geblokkeerd</span>); // het soort (18+, VPN, ...) staat als label achter de naam
                            if (ctx.has(key)) parts.push(<span key="c">⚠ rond dit bezoek: {ctx.get(key)}</span>);
                            else if (soft.has(key)) parts.push(<span key="s">⚠ rond 18+: {soft.get(key)}</span>);
                            if (!parts.length) return null;
                            // Elk stukje blijft heel (met zijn puntje ervoor); past het niet, dan gaat het naar een tweede regel in plaats van afgekapt.
                            return <div className="sub meta">{parts.map((x, i) => (i ? <span key={"p" + i} className="mpart"><span className="msep">·</span>{x}</span> : x))}</div>;
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
                            {(rss.every((x) => x.uz) || (!!g.isNew && !g.flag && isPlainSite(g) && noRealSite(siteChk[g.site]))) && (() => { const w = !!g.isNew && !g.flag && isPlainSite(g) && noRealSite(siteChk[g.site]) ? "geensite" : rss.find((x) => x.uw)?.uw; return <p className="unsure-why">Onzeker{w ? `: ${UNSURE_KORT[w]}` : ""}. {w ? UNSURE[w] : "DNS kan niet zien of dit echt gebruikt is."}</p>; })()}
                            {reviewDone && <p className="review-ans"><b>Nagekeken:</b> {reviewDone.antwoord}</p>}
                            {reviewOpen && <p className="review-wait">Gemeld, wordt nagekeken. Het antwoord komt hier te staan.</p>}
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
                            {(() => {
                              // Netwerk buiten de deur: een eigen naam geven (bijv. "werk"); daarna staat die naam bij de regels.
                              const ar = t ? awayAt(g.dev, t) : undefined;
                              if (!ar?.ip || nets[ar.ip]?.soort !== "vast") return null; // alleen een andere wifi: een mobiel adres wisselt elke week
                              const key = netOf(ar.ip), cur = netNamen[key];
                              const nt = netText(nets[ar.ip], { naam: cur });
                              return (
                                <div className="netname">
                                  <span className="muted"><NetIcon soort={nt.icon} /> {nt.uitleg}</span>
                                  <button type="button" className="netname-btn" onClick={(e) => {
                                    e.stopPropagation();
                                    const naam = window.prompt("Naam voor dit netwerk (bijvoorbeeld werk of opa en oma). Leeg = geen naam.", cur ?? "");
                                    if (naam !== null) setNetName(key, naam).then(setNetNamen, () => window.alert("Opslaan lukte niet."));
                                  }}>{cur ? "Naam wijzigen" : "Naam geven"}</button>
                                </div>
                              );
                            })()}
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
                                  {reviewBusy === rowKey ? "Bezig…" : reviewDone ? "Opnieuw melden" : "Melden"}
                                </button>
                                {reviewErr && reviewBusy === null && <p className="review-err">{reviewErr}</p>}
                              </div>
                            )}
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
              </>
                );
              })()}
              {/* Wat er bewust níet staat, met de reden: zo is zelf na te gaan dat er niets gemist is. */}
              {/* Pas als vandaag compleet is (cut = 0): tijdens het snelle eerste beeld groeit de lijst nog, en dan zou dit verspringen. */}
              {isDayOpen && hidden.length > 0 && !cut && !outside && (
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
