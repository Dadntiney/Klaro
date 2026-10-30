/**
 * Zelf leren welke adressen van een app bewijzen dat hij echt open is (en niet alleen op de achtergrond ververst), over alle
 * dagen en alle apparaten, zonder dat iemand iets hoeft aan te wijzen. Twee groepen voorbeelden die de gegevens zelf geven:
 *  - zeker gebruik: een moment van de app waarna binnen 15 s een gewone website opent (een link uit de app: dat kan alleen als
 *    iemand erin zit), of een moment waarin al bekende inhoud laadt (FG_RULES: foto's, video's);
 *  - zeker achtergrond: 's nachts (01:00-05:30) terwijl er een uur ervoor en erna geen enkele website op dat apparaat opende.
 * Een adres wordt bewijs als het bij zeker gebruik vaak voorkomt (minstens 10 keer en 15%) en bij zeker achtergrond nooit,
 * en pas als er genoeg nachtvoorbeelden zijn (minstens 20): met meer dagen wordt het vanzelf sterker. Een adres dat 's nachts
 * wél voorkomt, wordt nooit bewijs. Gemeten (17 okt): Facebook netseer 0% 's nachts / 67% bij gebruik; graph/gateway 80% 's nachts.
 */
export const LEARN = { night: 20, pos: 30, hits: 10, rate: 0.15 };
const NO_LEARN = new Set(["google.com", "bing.com"]);
// Adressen die websites zelf meeladen (Facebook-pixel, Pinterest-tag, OpenAI-teller): die staan altijd vlak bij een website en
// lijken daardoor bewijs, maar zeggen niets over de app (18 okt: connect.facebook.net wachtte op leren).
const WEB_EMBED = /^connect\.facebook\.net$|^(scontent|static)\.(fallback\.)?xx\.fbcdn\.net$|^star-mini(\.fallback)?\.c10r\.facebook\.com$|^www\.facebook\.com$|^(ct|s|assets|widgets)\.pinterest\.com$|^s\.pinimg\.com$|^www\.pinterest\.[a-z.]+$|^bzr(cdn)?\.openai\.com$/;

export type LearnEvent = { t: number; dev: string; host: string; site: string; app?: boolean; known?: boolean; page?: boolean };

const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false });
const hourIn = (t: number) => {
  const p = hmFmt.formatToParts(t);
  return Number(p.find((x) => x.type === "hour")!.value) % 24 + Number(p.find((x) => x.type === "minute")!.value) / 60;
};

export type LearnStat = { pos: number; night: number; ready: boolean; learned: string[]; waiting: string[] };

/** Per app (site) de geleerde bewijs-adressen. `app` = adres van een app met achtergrondverkeer, `known` = al bekende inhoud, `page` = gewone website. */
export function learnFg(ev: LearnEvent[], th = LEARN): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [site, s] of learnStats(ev, th)) if (s.learned.length) out.set(site, new Set(s.learned));
  return out;
}

/** Voortgang per app: hoeveel zekere voorbeelden, wat geleerd is en welke adressen nog op genoeg nachtvoorbeelden wachten. */
export function learnStats(ev: LearnEvent[], th = LEARN): Map<string, LearnStat> {
  const byDev = new Map<string, LearnEvent[]>();
  // Zoekmachines niet: die hebben al een sterke vaste regel (de zoekpagina zelf), en daar wordt niets aan verbeterd.
  for (const e of ev) if ((e.app && !NO_LEARN.has(e.site)) || e.page) (byDev.get(e.dev) ?? byDev.set(e.dev, []).get(e.dev)!).push(e);
  const st = new Map<string, { pos: number; night: number; p: Map<string, number>; n: Set<string>; known: Set<string> }>();
  for (const [, l] of byDev) {
    l.sort((a, b) => a.t - b.t);
    const pages = l.filter((e) => e.page).map((e) => e.t);
    let pi = 0;
    // Momenten van een app: alles van die app binnen 60 s.
    const open = new Map<string, { t: number; hosts: Set<string>; known: boolean; knownHosts: Set<string> }>();
    const close = (site: string) => {
      const m = open.get(site);
      if (!m) return;
      open.delete(site);
      const s = st.get(site) ?? st.set(site, { pos: 0, night: 0, p: new Map(), n: new Set(), known: new Set() }).get(site)!;
      for (const x of m.knownHosts) s.known.add(x);
      while (pi < pages.length && pages[pi] < m.t - 3_600_000) pi++;
      const link = pages.some((t) => t > m.t && t - m.t <= 15_000);
      const quiet = !pages.slice(pi).some((t) => Math.abs(t - m.t) <= 3_600_000);
      const h = hourIn(m.t);
      if (link || m.known) { s.pos++; for (const x of m.hosts) s.p.set(x, (s.p.get(x) ?? 0) + 1); }
      else if (h >= 1 && h <= 5.5 && quiet) { s.night++; for (const x of m.hosts) s.n.add(x); }
    };
    for (const e of l) {
      if (!e.app) continue;
      const m = open.get(e.site);
      if (m && e.t - m.t > 60_000) close(e.site);
      const cur = open.get(e.site) ?? open.set(e.site, { t: e.t, hosts: new Set(), known: false, knownHosts: new Set() }).get(e.site)!;
      if (!WEB_EMBED.test(e.host)) cur.hosts.add(e.host.replace(/^[0-9a-f-]{36}(?=-)/, "*"));
      if (e.known) { cur.known = true; cur.knownHosts.add(e.host); }
    }
    for (const site of [...open.keys()]) close(site);
  }
  const out = new Map<string, LearnStat>();
  for (const [site, s] of st) {
    const ready = s.night >= th.night && s.pos >= th.pos;
    // Adressen die al als inhoud bekend zijn (FG_RULES) hoeven niet geleerd te worden.
    const cand = [...s.p].filter(([h, c]) => c >= th.hits && c >= th.rate * s.pos && !s.n.has(h) && !s.known.has(h)).map(([h]) => h);
    out.set(site, { pos: s.pos, night: s.night, ready, learned: ready ? cand : [], waiting: ready ? [] : cand });
  }
  return out;
}
