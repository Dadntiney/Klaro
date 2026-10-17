/**
 * Apps die tijdens gebruik vooral algemene adressen opvragen (geen eigen naam): bij Minecraft op een iPad/iPhone stuurt het spel
 * elke ~20 seconden meetgegevens naar Microsoft (onedscolprd*.cloudapp.azure.com, self.events.data.microsoft.com), en verder
 * bijna niets. Die adressen gebruiken ook andere Microsoft-apps (Edge, Office), dus ze tellen alleen als het spel als ze
 * aansluiten op echt spelverkeer (`anchor`) op hetzelfde apparaat: elke opvraging hooguit `keep` na de vorige.
 * iOS legt een spel stil zodra het niet meer in beeld is; dan stoppen de meetgegevens en eindigt de keten vanzelf.
 * De Xbox-aanmelding vlak vóór het spel (tot `lead` ervoor) hoort ook bij het opstarten van het spel.
 */
export interface Companion {
  app: string; // site van de app in lib/sites.ts
  anchor: RegExp; // adressen die alleen het spel zelf gebruikt (niet de website)
  hosts: RegExp; // algemene adressen die alleen in de keten bij het spel horen
  keep: number;
  lead: number;
}

export const COMPANIONS: Companion[] = [
  {
    app: "minecraft.net",
    anchor: /(^|\.)minecraft-services\.net$|(^|\.)minecraftservices\.com$|(^|\.)(hivebedrock\.(eu|network)|lbsg\.net|lifeboat\.games|cubecraft\.net|galaxite\.net|enchanted\.gg|megasmp\.gg|inpvp\.net|donutsmp\.org|mineville\.org)$/,
    hosts: /^onedscolprd[a-z0-9]+\.[a-z0-9]+\.cloudapp\.azure\.com$|^(self|mobile)\.events\.data\.microsoft\.com$|^self-events-data\.trafficmanager\.net$|(^|\.)xboxlive\.com$/,
    keep: 300_000,
    lead: 60_000,
  },
];

export function companionFor(host: string): Companion | undefined {
  return COMPANIONS.find((c) => c.hosts.test(host));
}

export function anchorOf(host: string): Companion | undefined {
  return COMPANIONS.find((c) => c.anchor.test(host));
}

/** Welke tijdstippen van algemene adressen bij het spel horen (aaneengesloten keten vanaf echt spelverkeer). */
export function chainTimes(anchors: number[], hosts: number[], keep: number, lead: number): Set<number> {
  const ev = [...anchors.map((t) => ({ t, a: true })), ...hosts.map((t) => ({ t, a: false }))].sort((x, y) => x.t - y.t || (x.a ? -1 : 1));
  const out = new Set<number>();
  let last = -Infinity;
  for (const e of ev) {
    if (e.a) last = e.t;
    else if (e.t - last <= keep) { out.add(e.t); last = e.t; }
  }
  // Aanmelden vlak vóór het spel (Xbox): hoort bij het opstarten.
  for (const t of hosts) if (!out.has(t) && anchors.some((a) => a >= t && a - t <= lead)) out.add(t);
  return out;
}

/**
 * Sites die altijd met een hulpadres van een andere site meekomen: een script op github.io dat een websitebouwer
 * (publish.yoursite.io) bij elke pagina laadt. Komt een site elke keer (minstens 3 momenten, op minstens 2 dagen) hooguit
 * 10 seconden na hetzelfde hulpadres (geen pagina, geen achtergrond) van een andere site, dan is het een onderdeel daarvan.
 * Eén keer zonder dat hulpadres en de site telt gewoon. Zo vaak precies in die volgorde opent een mens nooit zelf een site.
 * `ev`: per apparaat alles, gesorteerd of niet: `page` = adres van de site zelf, `helper` = hulpadres van een site.
 */
export function loadedWith(ev: { t: number; dev: string; host: string; site: string; page?: boolean; helper?: boolean }[]): Set<string> {
  const byDev = new Map<string, typeof ev>();
  for (const e of ev) (byDev.get(e.dev) ?? byDev.set(e.dev, []).get(e.dev)!).push(e);
  const st = new Map<string, { m: number; days: Set<string>; with: Set<string> | null }>();
  for (const [, list] of byDev) {
    list.sort((a, b) => a.t - b.t);
    const last = new Map<string, number>();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.page) continue;
      const prevT = last.get(e.site);
      last.set(e.site, e.t);
      if (prevT !== undefined && e.t - prevT <= 1_500) continue; // zelfde moment
      const before = new Set<string>();
      for (let j = i - 1; j >= 0 && list[j].t >= e.t - 10_000; j--) if (list[j].helper && list[j].site !== e.site) before.add(list[j].host);
      const s = st.get(e.site) ?? st.set(e.site, { m: 0, days: new Set(), with: null }).get(e.site)!;
      s.m++;
      s.days.add(new Date(e.t).toISOString().slice(0, 10));
      s.with = s.with === null ? before : new Set([...s.with].filter((h) => before.has(h)));
    }
  }
  return new Set([...st].filter(([, s]) => s.m >= 3 && s.days.size >= 2 && s.with!.size > 0).map(([site]) => site));
}

/**
 * Doorverwijs-adressen: een algemeen cloud-adres (bijv. een Amazon-loadbalancer) waar een adres van een app naar doorverwijst.
 * NextDNS logt dan beide, maar het cloud-adres verloopt sneller: tussendoor staat alleen het cloud-adres in het logboek. Toca Boca
 * meldt zo tijdens het spelen elke 2 à 2,5 minuut iets via een Amazon-adres, terwijl het eigen adres maar elke 7,5 minuut verschijnt.
 * Kenmerk van zo'n doorverwijzing: telkens als het eigen adres van de app wordt opgevraagd (minstens 3 keer), staat het cloud-adres
 * er binnen 1 s bij (90% of meer), het cloud-adres is een adres van een cloud-netwerk (INFRA) en het komt (bijna) nooit samen met
 * een adres van een andere app voor. Algemene adressen
 * van Apple, Google of een CDN die met alles meekomen vallen zo af.
 * `ev`: per apparaat; `app` = eigen adres van een herkende app (met eigen naam, geen losse website), `cloud` = algemeen adres zonder
 * eigen herkenning.
 * Geeft per "apparaat|cloud-adres" de site waar het bij hoort.
 */
/** Adressen van cloud-netwerken waar een app naar doorverwijst (loadbalancer, CDN); meetdiensten als Sentry of Braze horen er niet bij. */
export const INFRA = /\.(elb\.amazonaws\.com|cloudfront\.net|akamai\.net|akamaiedge\.net|edgekey\.net|edgesuite\.net|fastly\.net|azurefd\.net|azureedge\.net|trafficmanager\.net|cdn\.cloudflare\.net)$/;

export function followers(ev: { t: number; dev: string; host: string; site: string; app?: boolean; cloud?: boolean }[]): Map<string, string> {
  const byDev = new Map<string, typeof ev>();
  for (const e of ev) if (e.app || (e.cloud && INFRA.test(e.host))) (byDev.get(e.dev) ?? byDev.set(e.dev, []).get(e.dev)!).push(e);
  const out = new Map<string, string>();
  for (const [dev, list] of byDev) {
    list.sort((a, b) => a.t - b.t);
    const near = (i: number, ms: number) => { const r: typeof list = []; for (let j = i - 1; j >= 0 && list[j].t >= list[i].t - ms; j--) r.push(list[j]); for (let j = i + 1; j < list.length && list[j].t <= list[i].t + ms; j++) r.push(list[j]); return r; };
    // Per eigen app-adres: hoe vaak opgevraagd, en hoe vaak stond elk cloud-adres er binnen 1 s bij.
    const own = new Map<string, { site: string; n: number; last: number; with: Map<string, number> }>();
    // Per cloud-adres: hoe vaak het (binnen 1 s) samen met elke app voorkwam.
    const cloudWith = new Map<string, Map<string, number>>();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.app) {
        const o = own.get(e.host) ?? own.set(e.host, { site: e.site, n: 0, last: -Infinity, with: new Map() }).get(e.host)!;
        if (e.t - o.last <= 1_500) continue; // zelfde moment
        o.last = e.t;
        o.n++;
        for (const h of new Set(near(i, 1_000).filter((x) => x.cloud).map((x) => x.host))) o.with.set(h, (o.with.get(h) ?? 0) + 1);
      } else if (e.cloud) {
        const w = cloudWith.get(e.host) ?? cloudWith.set(e.host, new Map()).get(e.host)!;
        for (const site of new Set(near(i, 1_000).filter((x) => x.app).map((x) => x.site))) w.set(site, (w.get(site) ?? 0) + 1);
      }
    }
    for (const [, o] of own) {
      if (o.n < 3) continue;
      for (const [h, n] of o.with) {
        if (n < 0.9 * o.n) continue;
        const w = cloudWith.get(h) ?? new Map<string, number>();
        const all = [...w.values()].reduce((a, b) => a + b, 0);
        if ((w.get(o.site) ?? 0) >= 0.9 * all) out.set(dev + "|" + h, o.site);
      }
    }
  }
  return out;
}

/**
 * Spel-motor en reclame in spellen (Unity, Amplitude, Singular, ironSource, AppLovin, ...): tijdens het spelen sturen veel
 * spellen elke 1 à 5 minuten meetgegevens via zo'n algemeen adres (vaak door NextDNS geblokkeerd, maar wel in het logboek), en
 * verder bijna niets. Zo'n adres hoort bij het spel dat op dat apparaat speelt: aansluitend op echt verkeer van dat spel (hooguit
 * `keep` na de vorige opvraging) en zolang er tussendoor geen andere app opende. Over alle dagen: pauzes 0-6 min tijdens het
 * spelen, daarna pas weer 11 min of meer. Zonder bekend spel ervoor blijft het "Spel (naam onbekend)".
 */
export const GAME_SDK = /(^|\.)(unity3d\.com|unity\.com|amplitude\.com|singular\.net|supersonicads\.com|applovin\.com|ironsrc\.(com|mobi)|vungle\.com|adcolony\.com|chartboost\.com)$/;
/**
 * Algemene meetmelding van Google (Firebase) die een app elke 1 à 2 minuten stuurt zolang hij open is: over alle dagen 85 reeksen,
 * maar 1 's nachts. Veel apps gebruiken hem, dus hij telt alleen mee aansluitend op een navigatie-app (Waze, 17 okt 18:48: daarna
 * nog 20 min elke ~1,5 min een melding tijdens de rit). Niet bij spellen: op de iPad stuurt een andere app die opent (zonder eigen
 * naam, dus geen onderbreking) dezelfde melding (14 okt 16:52, 6 okt 20:09 Videoland).
 */
export const NAV_SDK = /^firebaselogging-pa\.googleapis\.com$/;

/** `ev`: alles van één apparaat: `game` = adres van een bekend spel (site), `sdk` = adres van een spel-motor, `other` = een andere app. */
export function assignGameSdk(ev: { t: number; game?: string; nav?: boolean; sdk?: boolean; navSdk?: boolean; other?: boolean }[], keep: number): Map<number, string> {
  const out = new Map<number, string>();
  let cur: { site: string; last: number; nav?: boolean } | null = null;
  for (const e of [...ev].sort((a, b) => a.t - b.t)) {
    if (e.game) { cur = { site: e.game, last: e.t, nav: e.nav }; continue; }
    if (e.other) { if (cur && e.t - cur.last > 1_500) cur = null; continue; }
    if ((e.sdk || (e.navSdk && cur?.nav)) && cur && e.t - cur.last <= keep) { out.set(e.t, cur.site); cur.last = e.t; }
  }
  return out;
}

/**
 * Meta-apps delen adressen: de Instagram-app gebruikt ook graph/gateway/edge-mqtt/star.c10r.facebook.com, plaatjes van
 * scontent-*.xx.fbcdn.net en de netwerkmeting (*-netseer-ipaddr-assoc.*.fbcdn.net). Zonder deze regel werd Instagram-gebruik als
 * "Facebook" getoond (17 okt 13:42: vier Instagram-foto's, maar de rij heette Facebook). Een gedeeld adres hoort bij de app
 * waarvan het dichtstbijzijnde eigen adres komt (binnen 5 min, op hetzelfde apparaat). Eigen Facebook-adressen zijn alleen die
 * Instagram nooit gebruikt (gemeten over alle dagen): lookaside, rupload, chat-e2ee, ep2, web, en video-/static-/external-*.
 * Geen eigen adres in de buurt, of even dichtbij: blijft Facebook (zoals het was).
 */
export const IG_OWN = /(^|\.)instagram\.com$|(^|\.)cdninstagram\.com$|^dgw-ig\.c10r\.facebook\.com$/;
export const FB_OWN = /^(lookaside|rupload|web|mobile|mbasic|touch|chat-e2ee|ep2|payments-graph)\.(c10r\.)?facebook\.com$|^(video|static|external)-[a-z0-9-]+\.xx\.fbcdn\.net$/;
const META_SHARED = /\.facebook\.com$|-netseer-ipaddr-assoc\.[a-z]+\.fbcdn\.net$|^(scontent|static)[^.]*\.(fallback\.)?xx\.fbcdn\.net$/;
export const META_WINDOW = 300_000;

/** Sleutels `apparaat|tijd|adres` van gedeelde Meta-adressen die bij Instagram horen. `ev` per apparaat, gesorteerd of niet. */
export function instagramShared(ev: { t: number; dev: string; host: string }[]): Set<string> {
  const out = new Set<string>();
  const byDev = new Map<string, { t: number; host: string }[]>();
  for (const e of ev) if (IG_OWN.test(e.host) || FB_OWN.test(e.host) || META_SHARED.test(e.host)) (byDev.get(e.dev) ?? byDev.set(e.dev, []).get(e.dev)!).push(e);
  for (const [dev, list] of byDev) {
    list.sort((a, b) => a.t - b.t);
    const ig = list.filter((e) => IG_OWN.test(e.host)).map((e) => e.t);
    const fb = list.filter((e) => !IG_OWN.test(e.host) && FB_OWN.test(e.host)).map((e) => e.t);
    const dist = (ts: number[], t: number) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m + 1; else hi = m; }
      return Math.min(lo < ts.length ? ts[lo] - t : Infinity, lo > 0 ? t - ts[lo - 1] : Infinity); };
    for (const e of list) {
      if (/^dgw-ig\./.test(e.host)) { out.add(dev + "|" + e.t + "|" + e.host); continue; }
      if (IG_OWN.test(e.host) || FB_OWN.test(e.host)) continue;
      const di = dist(ig, e.t);
      if (di <= META_WINDOW && di < dist(fb, e.t)) out.add(dev + "|" + e.t + "|" + e.host);
    }
  }
  return out;
}

/**
 * De Facebook-pixel op websites: connect.facebook.net laadt in dezelfde seconden plaatjes en verbindingen van Facebook
 * (scontent.xx.fbcdn.net, star-mini.c10r.facebook.com, www.facebook.com). Komt dat binnen 5 s na een gewone website, dan hoort het
 * bij die website en is het geen Facebook-gebruik (17 okt 20:23: thisiseindhoven.com vanuit Google; de Facebook-rij werd 14 min te lang).
 * Niet als de Facebook-app zelf binnen een minuut actief is (zie FB_APP).
 */
const FB_PIXEL_LOAD = /^connect\.facebook\.net$|^(scontent|static)\.(fallback\.)?xx\.fbcdn\.net$|^star(-mini)?(\.fallback)?\.c10r\.facebook\.com$|^www\.facebook\.com$/;
// Adressen van de Facebook-app zelf (niet van de pixel): netwerkmeting, chat, verbinding. Komt een website vanuit de Facebook-app
// (10 okt 15:38: eerst Facebook met chat en netwerkmeting, daarna een advertentie-website), dan blijft het Facebook-gebruik.
const FB_APP = /-netseer-ipaddr-assoc\.[a-z]+\.fbcdn\.net$|^(dgw|mqtt|chat-e2ee)\.c10r\.facebook\.com$|^(graph-fallback|gateway|edge-mqtt|mobile|payments-graph|chat-e2ee|rupload|lookaside|web)\.facebook\.com$/;
export function facebookPixel(ev: { t: number; dev: string; host: string; page?: boolean }[]): Set<string> {
  const out = new Set<string>();
  const byDev = new Map<string, typeof ev>();
  for (const e of ev) (byDev.get(e.dev) ?? byDev.set(e.dev, []).get(e.dev)!).push(e);
  for (const [dev, list] of byDev) {
    list.sort((a, b) => a.t - b.t);
    const conn = list.filter((e) => e.host === "connect.facebook.net").map((e) => e.t);
    const pages = list.filter((e) => e.page).map((e) => e.t);
    const app = list.filter((e) => FB_APP.test(e.host) || IG_OWN.test(e.host)).map((e) => e.t); // Facebook- of Instagram-app zelf is open: dan hoort het er wel bij
    const near = (ts: number[], a: number, b: number) => ts.some((x) => x >= a && x <= b);
    for (const e of list) {
      if (!FB_PIXEL_LOAD.test(e.host)) continue;
      const c = conn.find((x) => Math.abs(x - e.t) <= 3_000);
      // Of zonder connect.facebook.net (zat nog in het geheugen van de browser): vlak na het openen van een website (17 okt neoseum.com).
      const anchor = c ?? (e.host !== "connect.facebook.net" && near(pages, e.t - 3_000, e.t) ? e.t : undefined);
      if (anchor !== undefined && !near(app, anchor - 60_000, anchor + 60_000)) out.add(dev + "|" + e.t + "|" + e.host);
    }
  }
  return out;
}
