/**
 * Referentiegevallen: situaties die de eigenaar zelf heeft gecontroleerd (11 okt 2026). Na elke wijziging draaien op het
 * overzicht van /api/nextdns: alles moet nog kloppen, anders niet live laten staan.
 * Gebruik: node --experimental-strip-types scripts/referentie.ts overzicht.json
 */
import fs from "node:fs";
import { isHuman } from "../lib/sessions.ts";

type Case = { day: string; dev: string; site: string /* "*.github.io": elke site daaronder */; at: string; until?: string; want: boolean | "onzeker"; why: string }; // until: sessie loopt minstens tot dan
const CASES: Case[] = [
  { day: "2026-10-11", dev: "iPhone", site: "praxis.nl", at: "10:27", want: true, why: "website geopend na zoeken" },
  { day: "2026-10-11", dev: "iPhone", site: "decathlon.nl", at: "10:16", want: true, why: "inloggen na zoeken" },
  { day: "2026-10-11", dev: "iPhone", site: "rabobank.nl", at: "10:28", want: true, why: "bank-app" },
  { day: "2026-10-11", dev: "iPhone", site: "nu.nl", at: "10:53", want: true, why: "artikel via X" },
  { day: "2026-10-11", dev: "iPhone", site: "inspirerendleven.nl", at: "09:33", want: true, why: "klik in nieuwsbrief" },
  { day: "2026-10-11", dev: "iPhone", site: "marktplaats.nl", at: "09:14", want: true, why: "app geopend" },
  { day: "2026-10-11", dev: "iPhone", site: "nespresso.com", at: "10:47", want: false, why: "plaatje in nieuwsbrief" },
  { day: "2026-10-11", dev: "iPhone", site: "jobescape.me", at: "11:00", want: "onzeker", why: "advertentie in X (of toch geopend)" },
  { day: "2026-10-11", dev: "iPhone", site: "wwiqtest.com", at: "10:53", want: "onzeker", why: "advertentie in X (of toch geopend)" },
  { day: "2026-10-11", dev: "iPhone", site: "ift.tt", at: "10:53", want: false, why: "doorstuur-link" },
  { day: "2026-10-11", dev: "iPhone", site: "dpgmedia.nl", at: "10:53", want: false, why: "inlog/privacy achter nu.nl" },
  { day: "2026-10-11", dev: "iPhone", site: "voetbalkrant.com", at: "*", want: false, why: "widget ververst zichzelf" },
  { day: "2026-10-11", dev: "iPhone", site: "onsoranje26.nl", at: "*", want: false, why: "widget ververst zichzelf" },
  { day: "2026-10-11", dev: "iPhone", site: "amazon.com", at: "23:22", want: false, why: "Amazon-app op de achtergrond (melding/verversen), alleen plaatjes" },
  { day: "2026-10-08", dev: "Apple TV", site: "youtube.com", at: "00:16", want: true, why: "YouTube-app (kanaalplaatjes), alleen video daarna" },
  { day: "2026-10-11", dev: "iPhone", site: "youtube.com", at: "18:28", want: false, why: "videoclip in Shazam, YouTube niet geopend" },
  { day: "2026-10-11", dev: "iPad", site: "minecraft.net", at: "16:42", want: true, why: "Minecraft gespeeld (meetgegevens tijdens het spel)" },
  { day: "2026-10-11", dev: "iPhone", site: "whatsapp.com", at: "14:06", want: true, why: "app geopend, bericht verstuurd" },
  { day: "2026-10-10", dev: "iPhone", site: "werkenbijseverinus.nl", at: "12:36", want: true, why: "vacature geopend" },
  { day: "2026-10-08", dev: "MacBook", site: "msn.com", at: "15:06", want: false, why: "nieuw tabblad Edge" },
  { day: "2026-10-15", dev: "iPhone", site: "iculture.nl", at: "12:52", want: true, why: "artikel geopend na zoeken" },
  { day: "2026-10-15", dev: "iPhone", site: "iculture.report", at: "*", want: false, why: "geladen door de pagina van iCulture" },
  { day: "2026-10-15", dev: "iPhone", site: "bigspark.link", at: "*", want: false, why: "affiliate-link in de pagina van iCulture" },
  { day: "2026-10-15", dev: "iPhone", site: "wct-2.com", at: "*", want: false, why: "productwidget in de pagina van iCulture" },
  { day: "2026-10-16", dev: "Apple TV", site: "ziggogo.tv", at: "09:12", until: "12:19", want: true, why: "Ziggo GO gekeken tot 12:20 (afspeelmeldingen), één rij" },
  { day: "2026-10-16", dev: "Apple TV", site: "disneyplus.com", at: "*", want: false, why: "Ziggo-videoplatform (dmdsdp) is geen Disney+" },
  { day: "2026-10-15", dev: "iPad", site: "tutotoons.com", at: "06:31", want: true, why: "TutoTOONS-spel gespeeld (reclame/gegevens elke paar minuten)" },
  { day: "2026-10-10", dev: "Apple TV", site: "pathe-thuis.nl", at: "21:29", until: "23:22", want: true, why: "film op Pathé Thuis (melding elke minuut)" },
  { day: "2026-10-16", dev: "iPhone", site: "happywithyoga.com", at: "09:56", until: "10:45", want: true, why: "cursusvideo (Wistia) gekeken op de cursus-site" },
  { day: "2026-10-16", dev: "iPhone", site: "thinkific.com", at: "*", want: false, why: "platform onder de cursus-site, geen eigen bezoek" },
  { day: "2026-10-15", dev: "iPhone", site: "dewerkendewebsite.nl", at: "*", want: false, why: "maker van de website, laadt mee met stap.nu" },
  { day: "2026-10-15", dev: "iPhone", site: "*.github.io", at: "*", want: false, why: "script dat de websitebouwer bij elke pagina laadt" },
  { day: "2026-10-15", dev: "MacBook", site: "*.github.io", at: "*", want: false, why: "script dat de websitebouwer bij elke pagina laadt" },
  { day: "2026-10-15", dev: "iPhone", site: "voetbalkrant.com", at: "*", want: false, why: "widget ververst zichzelf (ook twee keer kort na elkaar)" },
  { day: "2026-10-15", dev: "iPhone", site: "exact.com", at: "12:45", want: true, why: "geopend na zoeken in Google" },
  { day: "2026-10-16", dev: "iPhone", site: "scapino.nl", at: "13:02", want: true, why: "winkel geopend na zoeken" },
  { day: "2026-10-16", dev: "iPhone", site: "youshouldask.ai", at: "*", want: false, why: "advies-widget in de winkelpagina" },
  { day: "2026-10-07", dev: "iPhone", site: "scanid.nl", at: "11:55", want: true, why: "site geopend na zoeken" },
  { day: "2026-10-07", dev: "iPhone", site: "agepop.nl", at: "*", want: false, why: "zustersite die scanid.nl meelaadt" },
  { day: "2026-10-16", dev: "iPhone", site: "hoerakinderschoenen.nl", at: "13:12", want: true, why: "webwinkel geopend na zoeken" },
  { day: "2026-10-16", dev: "iPhone", site: "ecwid.com", at: "*", want: false, why: "winkelplatform dat de webwinkel meelaadt" },
  { day: "2026-10-16", dev: "iPhone", site: "ecomm.events", at: "*", want: false, why: "teller van het winkelplatform" },
  { day: "2026-10-16", dev: "iPhone", site: "anjazerrouk.nl", at: "13:25", want: true, why: "cursusportaal (academy.) geopend" },
  { day: "2026-10-16", dev: "iPhone", site: "bodygraphchart.com", at: "*", want: false, why: "ingebouwde tool (embed.) in het cursusportaal" },
  { day: "2026-10-16", dev: "iPhone", site: "weeztix.com", at: "11:50", want: true, why: "ticketshop geopend vanaf de evenementensite" },
  { day: "2026-10-11", dev: "iPhone", site: "vkmag.com", at: "19:59", want: true, why: "site zelf geopend (eigen embed. hoort erbij)" },
];
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const auto = new Set<string>(d.auto ?? []);
const hm = (t: number) => new Date(t).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
let bad = 0;
for (const c of CASES) {
  const gs = d.groups.filter((g: any) => g.d === c.day && g.dev === c.dev && (c.site.startsWith("*.") ? g.site.endsWith(c.site.slice(1)) : g.site === c.site) && !g.bg && g.main);
  const visS = gs.flatMap((g: any) => (g.ss ?? []).filter((x: any) => isHuman(x) && !(x.pv && !x.lg && auto.has(g.dev + "|" + g.site))));
  const vis = visS.map((x: any) => hm(x.s));
  const got = c.at === "*" ? vis.length > 0 : visS.some((x: any) => hm(x.s) === c.at && (!c.until || hm(x.e) >= c.until));
  const unsure = visS.some((x: any) => (c.at === "*" || hm(x.s) === c.at) && x.uz);
  const ok = c.want === "onzeker" ? got && unsure : got === c.want && !(c.want && unsure);
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${c.day} ${c.at} ${c.site} → ${c.want === "onzeker" ? "tonen als onzeker" : c.want ? "tonen" + (c.until ? ` tot ${c.until}` : "") : "niet tonen"} (${c.why})${ok ? "" : `  [nu: ${got ? (unsure ? "getoond als onzeker" : "getoond") : "niet getoond"}]`}`);
}
console.log(bad ? `\n${bad} referentiegeval(len) kloppen niet.` : "\nAlle referentiegevallen kloppen.");
process.exit(bad ? 1 : 0);
