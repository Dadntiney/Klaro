/**
 * Dagelijkse zelfcontrole van Klaro over ALLE opgeslagen logboeken (zie docs/dagelijkse-controle.md). Haalt de volledige download
 * één keer op via de eigen server (pichya.nl/api/nd.php) en kijkt of de regels zelf kloppen:
 *   1. Vangnet: adressen op de 18+/datinglijst of met duidelijke woorden (porn, dating, vpn, versleutelde dns) die niet rood zijn.
 *   2. Door NextDNS als gevaarlijk geblokkeerd.
 *   3. Achtergrond-adressen die op een echte site lijken en vaak los voorkomen (misschien ten onrechte achtergrond).
 *   4. Getoonde sites die elke keer binnen 5 s na een andere pagina opduiken (misschien een onderdeel van die pagina).
 *   5. Onbekende adressen met veel verkeer (misschien een app die we nog niet kennen, zoals een spel); 5b: onbekende app die los opent.
 *   6. Chip en rij nagespeeld: elke 10 minuten van het laatste etmaal, alleen met de gegevens tot dat moment.
 *   7. Ritme: een site die kort en regelmatig terugkomt (open tabblad, widget).
 *   8. Veel korte rijen van één site op één dag.
 *   9. Apps die misschien geopend zijn maar niet getoond (veel adressen van de app binnen 5 s).
 *  10. Versnipperd gebruik: 3+ stukjes op een dag met telkens 5-15 min ertussen (doorlopend gebruik waarbij DNS stil is?).
 *  11. Rij voor rij: getoonde rijen die tegelijk met een app beginnen of als één moment midden in een app vallen.
 *  12. Zelf leren: per app hoeveel zekere voorbeelden er zijn en welke bewijs-adressen geleerd zijn of nog wachten.
 * Met * gemarkeerd: de laatste 3 dagen (daar heeft nog niemand naar gekeken).
 * Alles wat hier verschijnt: nalopen in de ruwe regels, en alleen algemeen oplossen (met doorrekenen en tests).
 * Gebruik: KLARO_PW=... node --experimental-strip-types scripts/controle.ts [--bestand download.tsv] [--uren 24]
 * Toont nooit echte apparaatnamen (alleen de labels van Klaro) en geen lokale namen uit het thuisnetwerk.
 */
import fs from "node:fs";
import { buildOverview } from "../lib/overview.ts";
import { FG_RULES, classify, isMainHost, isNeverFlag } from "../lib/sites.ts";
import { LEARN, learnStats, type LearnEvent } from "../lib/selflearn.ts";
import { FB_OWN } from "../lib/companion.ts";
import { baseDomain } from "../lib/parse.ts";
import { inAdultList, inDatingList } from "../lib/adultlist.ts";
import { isPlainSite, isSystemSite } from "../lib/system.ts";
import { isHuman, type Session } from "../lib/sessions.ts";
import { usage } from "../lib/usage.ts";
import { isNow } from "../lib/play.ts";
import { ALWAYS_SHOW, deviceUse, isActiveNow, isTv, superseded, type LiveGroup } from "../lib/livestatus.ts";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
let text: string;
if (arg("--bestand")) text = fs.readFileSync(arg("--bestand")!, "utf8");
else {
  const pw = process.env.KLARO_PW;
  if (!pw) throw new Error("KLARO_PW ontbreekt");
  const site = process.env.KLARO_SITE ?? "https://pichya.nl";
  const res = await fetch(`${site}/api/nd.php?download=1`, { headers: { Authorization: "Basic " + Buffer.from("klaro:" + pw).toString("base64") }, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error("Download mislukt: " + res.status);
  text = await res.text();
}
const lines = text.split("\n").filter(Boolean);
const head = lines[0].split(/[\t,]/);
const col = (n: string) => head.indexOf(n);
const [cT, cH, cS, cR, cD] = [col("timestamp"), col("domain"), col("status"), col("reasons"), col("device_id")];
const rows = lines.slice(1).map((l) => l.split("\t")).map((r) => ({ t: Date.parse(r[cT]), h: (r[cH] ?? "").toLowerCase(), blocked: r[cS] === "blocked", why: r[cR] ?? "", id: r[cD] ?? "" })).filter((r) => r.t && r.h);
rows.sort((a, b) => a.t - b.t);
const LOCAL = /\.(home|lan|local|localdomain|internal)$|^[^.]+$/; // namen uit het thuisnetwerk: nooit tonen
const days = new Set(rows.map((r) => new Date(r.t).toISOString().slice(0, 10)));

const overview = async (body: string[], now: number) => {
  const txt = [lines[0], ...body].join("\n");
  const res = { ok: true, status: 200, text: async () => txt, json: async () => ({}) };
  const real = Date.now;
  Date.now = () => now;
  try { return (await buildOverview({ logs: async () => res, download: async () => res }, { todayOnly: false })).body as { groups: (LiveGroup & { ss: Session[]; susp?: string })[]; auto?: string[]; deviceMap: Record<string, string> }; }
  finally { Date.now = real; }
};
const now = Date.now();
const ov = await overview(lines.slice(1), now);
const label = (id: string) => ov.deviceMap[id] ?? "onbekend";
const hm = (t: number) => new Date(t).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const section = (title: string, items: string[], none: string) => { console.log(`\n## ${title} (${items.length})`); console.log(items.length ? items.join("\n") : none); };
console.log(`Klaro-controle: ${rows.length} regels, ${days.size} dagen (${[...days].sort()[0]} t/m ${[...days].sort().pop()}).`);

// 1. Vangnet
const WORDS = /porn|xxx|hentai|nude|naakt|escort|onlyfans|fansly|chaturbate|stripchat|bongacams|livejasmin|camgirl|nsfw|dating|tinder|bumble|badoo|grindr|parship|lexa\.|flirt|vpn|psiphon|torproject|ultrasurf|windscribe|dns\.google|cloudflare-dns|quad9|adguard-dns|dns\.nextdns|controld|doh\./;
const hosts = [...new Set(rows.map((r) => r.h))].filter((h) => !LOCAL.test(h));
const vang = hosts.filter((h) => !classify(h).flag && !isNeverFlag(h) && (inAdultList(h) || inDatingList(h) || WORDS.test(h)))
  .map((h) => `${h}  [${inAdultList(h) ? "18+-lijst" : inDatingList(h) ? "datinglijst" : "woord"}, ${rows.filter((r) => r.h === h).length}x]`);
section("Vangnet: verdacht maar niet rood", vang, "Niets.");
const never = hosts.filter((h) => isNeverFlag(h) && (inAdultList(h) || inDatingList(h)));
if (never.length) console.log(`(Op een lijst, maar bewust nooit rood: ${never.join(", ")})`);
const flagged = ov.groups.filter((g) => g.flag || g.susp).map((g) => `${g.d} ${g.dev} ${g.flag ?? "verdacht"} ${g.site}`);
section("Rood of verdacht getoond", flagged, "Niets rood of verdacht.");

// 2. Bedreigingen
const threats = new Map<string, number>();
for (const r of rows) if (r.blocked && /threat|malware|phish/.test(r.why)) threats.set(`${label(r.id)} ${r.h}`, (threats.get(`${label(r.id)} ${r.h}`) ?? 0) + 1);
section("Door NextDNS als gevaarlijk geblokkeerd", [...threats].map(([k, n]) => `${k}  ${n}x`), "Niets.");

// 3. Achtergrond die op een echte site lijkt en vaak los voorkomt
const visT = new Map<string, number[]>();
for (const r of rows) { const c = classify(r.h); if (!c.bg && c.main) (visT.get(r.id) ?? visT.set(r.id, []).get(r.id)!).push(r.t); }
const near = (id: string, t: number) => { const a = visT.get(id) ?? []; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < t - 60_000) lo = m + 1; else hi = m; } return lo < a.length && a[lo] <= t + 60_000; };
const bgLoose = new Map<string, { n: number; alone: number }>();
for (const r of rows) {
  if (r.blocked || LOCAL.test(r.h)) continue;
  const c = classify(r.h), base = baseDomain(r.h);
  if (!c.bg || !isMainHost(r.h, base) || isSystemSite(base)) continue;
  const a = bgLoose.get(base) ?? { n: 0, alone: 0 }; a.n++; if (!near(r.id, r.t)) a.alone++; bgLoose.set(base, a);
}
section("Achtergrond die vaak los voorkomt (nalopen: echt gebruik?)", [...bgLoose].filter(([, a]) => a.alone >= 5).sort((p, q) => q[1].alone - p[1].alone).map(([b, a]) => `${b}  ${a.alone} van ${a.n}x los`),
  "Niets opvallends.");

// 4. Getoonde sites die elke keer vlak na een andere pagina opduiken
const SEARCH = new Set(["google.com", "bing.com", "duckduckgo.com", "ecosia.org"]);
const pages = new Map<string, { t: number; site: string }[]>();
for (const r of rows) { const c = classify(r.h); if (c.main && !c.bg && !c.flag && isPlainSite(c) && !SEARCH.has(c.site)) (pages.get(label(r.id)) ?? pages.set(label(r.id), []).get(label(r.id))!).push({ t: r.t, site: c.site }); }
const auto = new Set(ov.auto ?? []);
const fol = new Map<string, { n: number; f: number }>();
for (const g of ov.groups) {
  if (!g.main || g.bg || g.flag || !isPlainSite(g) || isTv(g.dev)) continue;
  for (const x of g.ss) {
    if (!isHuman(x) || x.lg || (x.n ?? 0) > 1 || (x.pv && auto.has(g.dev + "|" + g.site))) continue;
    const a = fol.get(g.site) ?? { n: 0, f: 0 }; a.n++;
    if ((pages.get(g.dev) ?? []).some((p) => p.site !== g.site && p.t <= x.s && x.s - p.t <= 5_000)) a.f++;
    fol.set(g.site, a);
  }
}
section("Getoond, maar elke keer vlak na een andere pagina (onderdeel?)", [...fol].filter(([, a]) => a.n >= 2 && a.f === a.n).map(([s, a]) => `${s}  ${a.n}x`), "Niets.");

// 5. Onbekende adressen met veel verkeer (geen app, geen achtergrond, nooit getoond)
const shownSites = new Set(ov.groups.filter((g) => g.ss.some((x) => isHuman(x))).map((g) => g.site));
const unk = new Map<string, { n: number; devs: Set<string>; days: Set<string> }>();
for (const g of ov.groups) {
  if (g.bg || g.name !== g.site || isSystemSite(g.site) || shownSites.has(g.site) || LOCAL.test(g.site)) continue;
  const a = unk.get(g.site) ?? { n: 0, devs: new Set(), days: new Set() }; a.n += g.n; a.devs.add(g.dev); a.days.add(g.d); unk.set(g.site, a);
}
section("Onbekend met veel verkeer (een app die we nog niet kennen?)", [...unk].filter(([, a]) => a.n >= 20).sort((p, q) => q[1].n - p[1].n).slice(0, 15).map(([s, a]) => `${s}  ${a.n}x op ${a.days.size} dagen, ${[...a.devs].join("+")}`),
  "Niets opvallends.");

// 5b. Onbekende app die los opent: 2+ eigen adressen binnen 3 s, zonder een website of app vlak ervoor (5 s). Zo opent een app die
// we niet kennen (Shazam vóór 17 okt). Per adres bekeken, niet per groep: een groep die met een achtergrondadres begint, heet in
// het overzicht helemaal achtergrond, ook als er later app-adressen komen.
const reallyShown = new Set(ov.groups.filter((g) => !g.bg && g.main && g.ss.some((x) => isHuman(x))).map((g) => g.site));
const unkEv = new Map<string, { t: number; h: string }[]>();
for (const r of rows) {
  if (r.blocked) continue;
  const c = classify(r.h);
  if (c.bg || c.flag || isSystemSite(c.site) || LOCAL.test(c.site)) continue;
  if (!c.main && c.name === c.site && !reallyShown.has(c.site)) { const k = r.id + "|" + c.site; (unkEv.get(k) ?? unkEv.set(k, []).get(k)!).push({ t: r.t, h: r.h }); }
}
const loose = new Map<string, { n: number; last: number; hs: Set<string> }>();
for (const [k, ev] of unkEv) {
  const [id, site] = k.split("|"); const vt = visT.get(id) ?? [];
  for (let i = 0; i < ev.length; ) {
    let j = i; const hs = new Set<string>();
    while (j < ev.length && ev[j].t - ev[i].t <= 3_000) hs.add(ev[j++].h);
    const t = ev[i].t;
    if (hs.size >= 2 && !vt.some((v) => v >= t - 5_000 && v <= t + 2_000)) { // ingesloten onderdelen komen vlak na/met de pagina
      const key = label(id) + " " + site; const a = loose.get(key) ?? { n: 0, last: 0, hs: new Set() };
      a.n++; a.last = Math.max(a.last, t); hs.forEach((h) => a.hs.add(h)); loose.set(key, a);
    }
    i = j;
  }
}
section("Onbekende app die los opent (2+ eigen adressen tegelijk, geen website vlak ervoor)", [...loose].filter(([, a]) => a.n >= 2).sort((p, q) => q[1].last - p[1].last).slice(0, 25)
  .map(([k, a]) => `${[...days].sort().slice(-3).includes(new Date(a.last).toISOString().slice(0, 10)) ? "* " : "  "}${k}  ${a.n}x, laatst ${hm(a.last)}: ${[...a.hs].slice(0, 4).join(" ")}`), "Niets.");

// 7-9. Patronen in wat getoond wordt (zelf leren van de dagen, zonder dat iemand schermafbeeldingen hoeft na te kijken).
const shownSs = (g: (typeof ov.groups)[number]) => g.ss.filter((x) => isHuman(x) && !(x.pv && !x.lg && auto.has(g.dev + "|" + g.site)));
const recent = new Set([...days].sort().slice(-3)); // vooral de laatste dagen: daar is nog niets aan gedaan

// 7. Ritme: een site die op één dag minstens 4 keer kort terugkomt met steeds ongeveer even lange pauzes (open tabblad, widget).
const rhythm: string[] = [];
for (const g of ov.groups) {
  if (!g.main || g.bg || g.flag || isTv(g.dev) || ALWAYS_SHOW.has(g.site)) continue;
  const xs = shownSs(g).filter((x) => x.e - x.s < 120_000).sort((a, b) => a.s - b.s);
  if (xs.length < 4) continue;
  const gaps = xs.slice(1).map((x, i) => x.s - xs[i].s).filter((d) => d < 3_600_000);
  if (gaps.length < 3) continue;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  if (sd / mean < 0.35) rhythm.push(`${recent.has(g.d) ? "* " : "  "}${g.d} ${g.dev} ${g.site}  ${xs.length} korte rijen, elke ~${Math.round(mean / 60_000)} min`);
}
section("Ritme: kort en regelmatig terug (open tabblad of widget?)", rhythm.sort().reverse(), "Niets.");

// 8. Veel korte losse rijen van één site op één dag (minstens 5, elk korter dan 30 s): achtergrond of een echt bezoek?
const shorts: string[] = [];
for (const g of ov.groups) {
  if (!g.main || g.bg || g.flag || isTv(g.dev) || ALWAYS_SHOW.has(g.site) || SEARCH.has(g.site)) continue;
  const xs = shownSs(g).filter((x) => x.e - x.s < 30_000);
  if (xs.length >= 5) shorts.push(`${recent.has(g.d) ? "* " : "  "}${g.d} ${g.dev} ${g.site}  ${xs.length} korte rijen (${xs.map((x) => hm(x.s).slice(-5)).slice(0, 6).join(", ")}${xs.length > 6 ? ", ..." : ""})`);
}
section("Veel korte rijen op één dag (nalopen)", shorts.sort().reverse().slice(0, 30), "Niets.");

// 10. Versnipperd gebruik: een app of site waarvan het gebruik op één dag in 3 of meer stukjes valt met telkens 5 tot 15 minuten
// ertussen (ook verborgen stukjes). Zo zag een speelbeurt van Toca Boca eruit (meldingen soms 6-8 min uit elkaar) en een rit met
// Waze (kaartstukjes elke 4-17 min). Nalopen: is het één doorlopend gebruik waarvan DNS tussendoor stil is? Meet dan de
// verdeling van de pauzes over ALLE dagen voordat je een grens kiest.
const pieces: string[] = [];
const autoSet = new Set(ov.auto ?? []);
for (const g of ov.groups) {
  // (Tv's niet: daar voegt de lijst stukjes met minder dan 15 min ertussen al samen.)
  if (!g.main || g.bg || g.flag || isTv(g.dev) || ALWAYS_SHOW.has(g.site) || autoSet.has(g.dev + "|" + g.site) || /^(whatsapp|telegram|signal|messenger|snapchat)\./.test(g.site)) continue;
  const xs = [...(g.ss ?? [])].sort((a, b) => a.s - b.s);
  let run: Session[] = [];
  const flush = () => {
    if (run.length >= 3 && run.some((x) => !isHuman(x))) {
      const gaps = run.slice(1).map((x, i) => Math.round((x.s - run[i].e) / 60_000));
      pieces.push(`${recent.has(g.d) ? "* " : "  "}${g.d} ${g.dev} ${g.site}  ${run.length} stukjes ${hm(run[0].s).slice(-5)}-${hm(run[run.length - 1].e).slice(-5)}, pauzes ${gaps.join(", ")} min, ${run.filter((x) => !isHuman(x)).length} verborgen`);
    }
    run = [];
  };
  for (const x of xs) {
    const prev = run[run.length - 1];
    if (prev && x.s - prev.e >= 5 * 60_000 && x.s - prev.e <= 15 * 60_000) run.push(x);
    else { flush(); run = [x]; }
  }
  flush();
}
section("Versnipperd gebruik: stukjes met 5-15 min ertussen (één doorlopend gebruik?)", pieces.sort().reverse().slice(0, 30), "Niets.");

// 11. Rij voor rij (zoals de eigenaar kijkt): elke getoonde rij die begint in dezelfde 3 s als een app op hetzelfde apparaat
// (dan is het vaak iets wat die app laadt: Google-advertentiemodule bij een spel, meetcode bij Squla), of die als bezoek binnen
// een andere doorlopende app-sessie valt zonder eigen vervolg (één moment). Nalopen in de ruwe regels; algemeen oplossen.
const rowChecks: string[] = [];
const named = (g: LiveGroup) => g.main && !g.bg && !g.flag && !isPlainSite(g as never);
for (const g of ov.groups) {
  if (!g.main || g.bg || g.flag || ALWAYS_SHOW.has(g.site)) continue;
  for (const x of g.ss) {
    if (!isHuman(x) || x.uz) continue; // al als onzeker getoond (advertentie in een social-app of echt geopend)
    const others = ov.groups.filter((h) => h.dev === g.dev && h.site !== g.site && named(h));
    const sameStart = others.find((h) => h.ss.some((y) => isHuman(y) && Math.abs(y.s - x.s) <= 3_000));
    const inside = (x.n ?? 0) <= 1 && others.find((h) => h.ss.some((y) => isHuman(y) && y.s < x.s - 3_000 && y.e > x.e + 60_000));
    if (sameStart) rowChecks.push(`${recent.has(g.d) ? "* " : "  "}${hm(x.s)} ${g.dev} ${g.site}  begint tegelijk met ${sameStart.name}`);
    else if (inside) rowChecks.push(`${recent.has(g.d) ? "* " : "  "}${hm(x.s)} ${g.dev} ${g.site}  één moment midden in ${inside.name}`);
  }
}
section("Rij voor rij: begint tegelijk met een app, of één moment midden in een app", rowChecks.sort().reverse().slice(0, 40), "Niets.");

// 12. Zelf leren (lib/selflearn.ts): per app met achtergrondverkeer hoeveel zekere voorbeelden er zijn (gebruik / nacht), wat
// geleerd is als bewijs dat de app open is, en wat nog op genoeg nachtvoorbeelden wacht. Groeit vanzelf met elke dag.
{
  const ev: LearnEvent[] = [];
  for (const r of rows) {
    if (r.blocked) continue;
    const c = classify(r.h);
    const app = !!FG_RULES[c.site];
    const page = !app && c.main && !c.bg && !c.flag && isPlainSite(c) && !SEARCH.has(c.site);
    if (app || page) ev.push({ t: r.t, dev: r.id, host: r.h, site: c.site, app, known: app && FG_RULES[c.site].test(r.h), page });
  }
  const out: string[] = [];
  for (const [site, s] of [...learnStats(ev)].sort((a, b) => b[1].pos - a[1].pos)) {
    out.push(`${site}: gebruik ${s.pos}/${LEARN.pos}, nacht ${s.night}/${LEARN.night}${s.ready ? "" : " (nog niet genoeg)"}${s.learned.length ? `; geleerd: ${s.learned.join(", ")}` : ""}${s.waiting.length ? `; wacht: ${s.waiting.slice(0, 6).join(", ")}` : ""}`);
  }
  section("Zelf leren: bewijs dat een app open is (groeit elke dag)", out, "Nog niets te leren.");
}

// 9. App geopend maar niet getoond? Veel verschillende adressen van een app binnen 5 s (zo opent een app), zonder zichtbare rij.
const missed: string[] = [];
const byDevApp = new Map<string, { t: number; h: string }[]>();
// Facebook: alleen eigen Facebook-adressen tellen; de gedeelde (graph, gateway, star, dgw, netwerkmeting) gebruikt Instagram ook.
for (const r of rows) { const c = classify(r.h); if (!c.main || c.bg || c.flag || isPlainSite(c) || r.blocked || (c.site === "facebook.com" && !FB_OWN.test(r.h))) continue; const k = label(r.id) + "|" + c.site; (byDevApp.get(k) ?? byDevApp.set(k, []).get(k)!).push({ t: r.t, h: r.h }); }
const shownAt = new Map<string, Session[]>();
for (const g of ov.groups) (shownAt.get(g.dev + "|" + g.site) ?? shownAt.set(g.dev + "|" + g.site, []).get(g.dev + "|" + g.site)!).push(...shownSs(g));
for (const [k, ev] of byDevApp) {
  const [dev] = k.split("|");
  if (isTv(dev)) continue;
  let i = 0;
  while (i < ev.length) {
    let j = i; const hs = new Set<string>();
    while (j < ev.length && ev[j].t - ev[i].t <= 5_000) { hs.add(ev[j].h); j++; }
    const t = ev[i].t;
    if (hs.size >= 5 && !(shownAt.get(k) ?? []).some((x) => t >= x.s - 120_000 && t <= x.e + 120_000))
      missed.push(`${recent.has(new Date(t).toISOString().slice(0, 10)) ? "* " : "  "}${hm(t)} ${k.replace("|", " ")}  ${hs.size} adressen: ${[...hs].slice(0, 5).join(" ")}`);
    i = j;
  }
}
section("App misschien geopend maar niet getoond (veel adressen tegelijk)", missed.sort().reverse().slice(0, 30), "Niets.");

// 6. Chip en rij nagespeeld
const hours = Number(arg("--uren") ?? 24);
const today = (t: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(t);
const mism: string[] = [];
let checks = 0;
for (let T = now - hours * 3_600_000; T <= now; T += 600_000) {
  const o = await overview(lines.slice(1).filter((l) => { const t = Date.parse(l.slice(0, 24)); return t <= T && t >= T - 30 * 3_600_000; }), T);
  const groups = o.groups, au = new Set(o.auto ?? []);
  const use = deviceUse(groups, au, (o as { followers?: Record<string, string> }).followers ?? {});
  // Dezelfde rijen als de pagina (lib/usage.ts): wat als gebruik telt, en op een tv samengevoegd (met beeld-bruggen).
  const rowsT: { g: LiveGroup; x: Session }[] = [];
  const todayGroups = groups.filter((g) => g.d === today(T));
  const { listed, shown } = usage(todayGroups as never[], { auto: au, followers: (o as { followers?: Record<string, string> }).followers ?? {} });
  for (const g of todayGroups) {
    if (!listed(g as never)) continue;
    for (const x of shown(g as never)) rowsT.push({ g, x });
  }
  const human = rowsT.filter((r) => r.g.flag || isHuman(r.x));
  for (const dev of new Set(groups.filter((g) => g.d === today(T)).map((g) => g.dev))) {
    checks++;
    const nu = rowsT.filter((r) => r.g.dev === dev && (r.g.flag || isHuman(r.x)) && isNow(T, r.x, r.g) && !superseded(r.x, human.filter((o) => o.g.dev === dev && o !== r).map((o) => o.x)));
    const chip = isActiveNow(use, dev, T);
    if (chip !== nu.length > 0) mism.push(`${hm(T)} ${dev}: chip ${chip ? "groen" : "uit"}, rij "nu": ${nu.map((r) => r.g.name).join(", ") || "geen"}`);
  }
}
section(`Chip en rij nagespeeld (${checks} momenten, laatste ${hours} uur)`, mism, "Chip en rij zeggen steeds hetzelfde.");

// Nieuwe adressen (laatste 24 uur voor het eerst gezien): staat er een echte website? (websitecontrole via de server, zie
// scripts/sitecheck.ts). Nalopen: ⚠ getoond maar geen echte website (onderdeel?) of een echte website met eigen pagina die niet
// getoond wordt (gemist?). 18+/dating/VPN wordt nooit opgehaald.
{
  const pw = process.env.KLARO_PW;
  const first = new Map<string, number>();
  for (const r of rows) { const b = baseDomain(r.h); if (!LOCAL.test(r.h) && !first.has(b)) first.set(b, r.t); }
  const fresh = [...first].filter(([, t]) => t >= now - 24 * 3_600_000).map(([b]) => b);
  const out: string[] = [];
  if (pw && fresh.length) {
    const site = process.env.KLARO_SITE ?? "https://pichya.nl";
    const auth = { Authorization: "Basic " + Buffer.from("klaro:" + pw).toString("base64") };
    for (const b of fresh.slice(0, 60)) {
      const hs = [...new Set(rows.filter((r) => baseDomain(r.h) === b).map((r) => r.h))];
      if (hs.some((h) => classify(h).flag || inAdultList(h) || inDatingList(h))) continue; // vangnet: niet ophalen
      const page = hs.some((h) => isMainHost(h, b));
      const site0 = classify(hs[0]).site;
      const shown = ov.groups.some((g) => g.site === site0 && g.main && !g.bg && (g.ss ?? []).some((x) => isHuman(x)));
      if (!page && !shown) continue; // alleen onderdelen: daar zegt een voorpagina weinig
      const v = await fetch(`${site}/api/sitecheck.php?host=${encodeURIComponent(hs.find((h) => isMainHost(h, b)) ?? b)}`, { headers: auth, signal: AbortSignal.timeout(20_000) }).then((r) => r.json()).catch(() => null) as { soort?: string; titel?: string; naar?: string } | null;
      const echt = v?.soort === "website" || v?.soort === "doorsturen";
      const geen = v?.soort === "techniek" || v?.soort === "geen pagina" || v?.soort === "leeg";
      const warn = (shown && geen) || (!shown && page && echt);
      out.push(`${warn ? "⚠ " : "  "}${b}  ${shown ? "getoond" : "niet getoond"}  ${v?.soort ?? "?"}${v?.titel ? ` "${v.titel}"` : ""}${v?.naar ? ` -> ${v.naar}` : ""}`);
    }
  }
  section("Nieuwe adressen (24 uur): echte website? (⚠ = nalopen)", out.sort(), pw ? "Geen nieuwe adressen met een eigen pagina." : "Overgeslagen (geen KLARO_PW).");
}
