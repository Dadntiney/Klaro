/** Een sessie: verzoeken die minder dan `GAP` uit elkaar liggen horen bij één periode van gebruik. */
export interface Session {
  s: number; // start (unix ms)
  e: number; // einde
  n?: number; // aantal verzoeken in de sessie
  m?: number; // waarvan beeld/geluid-verkeer (video of muziek)
  f?: number; // bij apps met veel achtergrondverkeer: aantal keer dat er echt inhoud laadde (foto's, video's)
  mh?: number; // bij gewone websites: hoe vaak de site zelf (www., nl., ...) werd opgevraagd; 0 = alleen losse onderdelen (plaatjes, tellers)
  lf?: number; // tijdstip van het laatste inhoud-moment (live tellen)
  lfh?: string; // adres van dat laatste inhoud-moment
  ob?: { h: string; t: number }[]; // live: opstart-adressen van de laatste 5 s (zie OPEN_START)
  os?: 1; // live: volledige opstart gezien (telt één keer als extra inhoud-adres, net als bij de volledige berekening)
  lmt?: number; // tijdstip van het laatste beeld/geluid-moment (live tellen)
  emb?: 1;
  rl?: 1; // tabblad dat Safari/Chrome opnieuw laadde (veel sites in een paar seconden tegelijk, elk maar even): geen bezoek
  rf?: 1; // een widget of open tabblad dat zichzelf ververst (zelfde site die dag vaak los): geen bezoek
  res?: 1; // alleen losse onderdelen (tellers, plaatjes, advertenties, mail-onderdelen): geen bezoek // ingesloten filmpje op een andere site die op dat moment bezocht werd: hoort bij die site, geen eigen bezoek
  lg?: 1; // inlog- of bankierpagina geopend (bankieren.*, mijn.*): altijd een bewust bezoek
  pv?: 1;
  bn?: 1; // live: de kale naam van de app (opstart) is in deze sessie gezien
  op?: 1; // de app is echt geopend (vaste start-adressen, zie ALWAYS_SHOW_OPEN in lib/livestatus.ts)
  gs?: 1; // spel of leer-app opgestart: 3+ eigen adressen in één moment (daarna soms minuten zonder verkeer), zie lib/overview.ts
  ao?: 1; // app gestart (eigen startadres), maar geen inhoud gezien: tonen als onzeker (zie lib/overview.ts)
  pf?: 1; // alleen het adres opgevraagd, niets van de pagina geladen (voorvertoning of aangeklopte advertentie): geen bezoek
  uz?: 1; // onzeker: één los adres terwijl in een social-app gescrold werd (advertentie óf echt geopend) // één pagina geopend op de site zelf (los, niet uit een mail, niet steeds herhaald): een echt bezoek
  ml?: 1;
  ck?: 1; // via een tik op een link in een mail naar de site gegaan: een echt bezoek (niet als mail zien) // hoort bij het openen van een e-mail (plaatjes/tellers van een nieuwsbrief), geen bezoek
}

export const GAP = 5 * 60_000;
/** Opvragingen binnen dit venster zijn één moment (NextDNS logt een adres tot 3x: A, AAAA, HTTPS). */
export const MOMENT = 1_500;

/** Aantal losse momenten in een reeks tijdstippen (alles binnen 1,5 seconde van het vorige telt als hetzelfde moment). */
export function moments(times: number[]): number {
  const t = [...times].sort((a, b) => a - b);
  let n = 0;
  let last = -Infinity;
  for (const x of t) {
    if (x - last > MOMENT) n++;
    last = x;
  }
  return n;
}
const MAX = 5;

/** Alle sessies uit losse tijdstippen, nieuwste eerst. */
export function allSessions(times: number[]): Session[] {
  const t = times.filter(Boolean).sort((a, b) => a - b);
  const out: Session[] = [];
  for (const x of t) {
    const last = out[out.length - 1];
    if (last && x - last.e <= GAP) {
      last.e = x;
      last.n = (last.n ?? 1) + 1;
    } else out.push({ s: x, e: x, n: 1 });
  }
  return out.reverse();
}

/** Maak sessies van losse tijdstippen; nieuwste eerst, maximaal `MAX`. */
export function clusterSessions(times: number[]): Session[] {
  return allSessions(times).slice(0, MAX);
}

/** Totaal aantal minuten over alle sessies. */
export function totalMinutes(times: number[]): number {
  return allSessions(times).reduce((n, x) => n + minutes(x), 0);
}

// Apps waarbij openen in één moment meerdere inhoud-adressen tegelijk ophaalt (WhatsApp: graph + static bij openen en
// versturen). De kale naam (whatsapp.com) zelf betekent: de app ging open (18 okt, bevestigd door de eigenaar). Zonder de kale naam
// is het een binnenkomend bericht, ook met foto (g. → static./media. → api.): dan tellen meerdere plaatjesadressen niet als openen.
// Bij Facebook/Instagram/YouTube doet achtergrondverversen dit ook: daar niet.
export const OPEN_BURST = new Set(["whatsapp.com"]);
/**
 * WhatsApp opent met dit rijtje binnen 5 seconden: de kale naam, de server voor het account (api.), de chatverbinding (g.) en
 * plaatjes (static.). Achtergrond (een binnenkomend bericht) haalt nooit alle vier: in drie weken alleen bij het openen.
 */
export const OPEN_START = [/^whatsapp\.com$/, /^api\.whatsapp\.net$/, /^g\.whatsapp\.net$/, /^static\.whatsapp\.net$/];

/** Live: onthoud opstart-adressen (5 s); is het rijtje compleet, dan telt dat één keer als extra inhoud-adres. */
function openStart(x: Session, host: string, t: number) {
  if (x.os || !OPEN_START.some((re) => re.test(host))) return;
  x.ob = [...(x.ob ?? []).filter((o) => Math.abs(t - o.t) <= 5_000), { h: host, t }];
  if (OPEN_START.every((re) => x.ob!.some((o) => re.test(o.h)))) { x.os = 1; x.f = (x.f ?? 0) + 1; delete x.ob; }
}

/**
 * Voeg één nieuw tijdstip toe aan bestaande sessies (nieuwste eerst).
 * `fg`: alleen bij apps met achtergrondverkeer (Facebook, Instagram, WhatsApp, ...): true = inhoud geladen, false = achtergrond.
 * Achtergrondverkeer telt dan wel als verzoek, maar verlengt de gebruiksduur niet.
 */
export function extendSessions(ss: Session[], t: number, media = false, fg?: boolean, res?: boolean, host?: string, keep = false): Session[] {
  const next = ss.map((x) => ({ ...x }));
  const i = next.findIndex((x) => t >= x.s - GAP && t <= x.e + GAP);
  if (i >= 0) {
    const x = next[i];
    // Kijkmelding (zie KEEP_ALIVE in lib/sites.ts): telt als inhoud als er al echte inhoud was, en niet binnen 30 s daarvan.
    // WhatsApp (kale naam): alleen een sessie verlengen die al zeker gebruik was (zie KEEP_ALIVE in lib/sites.ts).
    const kept = host && OPEN_BURST.has(host) ? isHuman(x) : (x.f ?? 0) > 0 || (x.m ?? 0) > 0;
    if (keep && fg === false && kept && t >= x.e && t - (x.lf ?? 0) > 30_000) fg = true;
    const prevE = x.e;
    if (fg === undefined || fg || media) {
      if (fg !== undefined && !(x.f ?? 0) && !(x.m ?? 0)) { x.s = t; x.e = t; } // eerste echte inhoud: daar begint het gebruik
      x.s = Math.min(x.s, t);
      x.e = Math.max(x.e, t);
    }
    // Tellen in momenten (zelfde telling als de server): binnen 1,5 s van de vorige opvraging telt niet opnieuw.
    if (x.n !== undefined && Math.abs(t - prevE) > MOMENT) x.n = x.n + 1;
    // Momenten tellen, geen opvragingen: dezelfde foto die 3x wordt opgevraagd is één moment.
    if (media && !(x.lmt && Math.abs(t - x.lmt) <= MOMENT)) x.m = (x.m ?? 0) + 1;
    if (media) x.lmt = t;
    // Twee verschillende inhoud-adressen in één moment (app opent: instellingen + plaatjes) telt ook als twee.
    // Verschillende inhoud-adressen tellen alleen als de app zelf opstartte (kale naam gezien, zie OPEN_BURST): een binnenkomend
    // bericht met foto haalt ook static. en media. tegelijk op.
    if (host && OPEN_BURST.has(host)) { x.bn = 1; x.f = Math.max(x.f ?? 0, 2); } // kale naam = de app ging open
    if (fg && (!(x.lf && Math.abs(t - x.lf) <= MOMENT) || (host && x.bn && x.lfh && host !== x.lfh))) x.f = (x.f ?? 0) + 1;
    if (fg) { x.lf = t; if (host) x.lfh = host; }
    if (res === false) delete x.res; // iets van de site zelf erbij: wel een bezoek
    if (host) openStart(x, host, t);
    return next.sort((a, b) => b.e - a.e);
  }
  const fresh: Session = { s: t, e: t, n: 1, ...(media ? { m: 1, lmt: t } : {}), ...(fg !== undefined ? { f: fg ? 1 : 0, ...(fg ? { lf: t, ...(host ? { lfh: host } : {}) } : {}) } : {}), ...(res ? { res: 1 as const } : {}) };
  if (host && OPEN_BURST.has(host)) { fresh.bn = 1; fresh.f = Math.max(fresh.f ?? 0, 2); }
  if (host) openStart(fresh, host, t);
  return [fresh, ...next].sort((a, b) => b.e - a.e).slice(0, MAX);
}

/** Minuten van een sessie, minimaal 1 als er meer dan een paar seconden tussen zit; 0 = alleen een korte aanraking. */
export function minutes(x: Session): number {
  const ms = x.e - x.s;
  return ms < 60_000 ? 0 : Math.round(ms / 60_000);
}

/** Zoals `extendSessions`, maar zonder af te kappen (voor het dagtotaal per apparaat). */
export function extendAll(ss: Session[], t: number): Session[] {
  const next = ss.map((x) => ({ ...x }));
  const i = next.findIndex((x) => t >= x.s - GAP && t <= x.e + GAP);
  if (i >= 0) {
    next[i].s = Math.min(next[i].s, t);
    next[i].e = Math.max(next[i].e, t);
    if (next[i].n !== undefined) next[i].n = next[i].n! + 1;
  } else next.push({ s: t, e: t, n: 1 });
  return next.sort((a, b) => b.e - a.e);
}

/**
 * Lijkt deze sessie op echt gebruik door een mens? Een kort achtergrondbericht (een app die even ververst,
 * een camera of lamp die inchecken) levert maar een paar verzoeken op; echt gebruik veel meer of duurt langer.
 * Sessies zonder telling (oudere gegevens) tellen mee.
 */
export function isHuman(x: Session): boolean {
  if (x.emb || x.res || x.rf || x.rl) return false;
  if (x.ml && x.e - x.s <= 90_000) return false; // uit een e-mail (tenzij er daarna echt verder gekeken is)
  if (x.gs) return true; // spel of leer-app volledig opgestart: echt geopend
  if (x.ao) return true; // app gestart zonder zichtbare inhoud: wel tonen, maar als onzeker (x.uz)
  // App met een inhoud-regel (Google, Facebook, ...) en niets van die inhoud geladen: één los adres is dan geen bezoek, ook niet als
  // losse pagina (Google: een spel of app vraagt bij het opstarten www.google.com op; een echte zoekopdracht laadt ook resultaten).
  if (x.f === 0 && x.pv && !x.lg && !x.ck && (x.n ?? 0) <= 1) return false;
  if (x.lg || x.pv || x.ck) return true; // inlogpagina, losse pagina, of via een klik (mail-link of zoekresultaat) geopend // één pagina op de site zelf geopend
  if (x.f !== undefined) return x.f >= 2 || (x.m ?? 0) >= 2; // app met achtergrondverkeer: alleen als er echt inhoud laadde
  if (x.n === undefined) return true;
  if ((x.m ?? 0) >= 2) return true; // beeld/geluid (Disney+, YouTube): er wordt gekeken of geluisterd
  // Losse opvragingen (dubbele binnen 1,5 s tellen als één): minstens 2. Eén los verzoek is geen bezoek.
  // (Achtergrondverkeer van social-apps, mail, tellers en voorvertoningen worden hierboven al apart afgevangen.)
  return x.n >= 2;
}
