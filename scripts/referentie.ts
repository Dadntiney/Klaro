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
  { day: "2026-10-11", dev: "iPhone", site: "jobescape.me", at: "11:00", want: false, why: "advertentie in X: alleen het adres opgevraagd, niets van de pagina geladen (22 okt bewezen: geen onderdelen binnen 8 s)" },
  { day: "2026-10-11", dev: "iPhone", site: "wwiqtest.com", at: "10:53", want: false, why: "advertentie in X: alleen het adres opgevraagd, niets van de pagina geladen (22 okt bewezen: geen onderdelen binnen 8 s)" },
  { day: "2026-10-11", dev: "iPhone", site: "ift.tt", at: "10:53", want: false, why: "doorstuur-link" },
  { day: "2026-10-11", dev: "iPhone", site: "dpgmedia.nl", at: "10:53", want: false, why: "inlog/privacy achter nu.nl" },
  { day: "2026-10-11", dev: "iPhone", site: "voetbalkrant.com", at: "*", want: false, why: "widget ververst zichzelf" },
  { day: "2026-10-11", dev: "iPhone", site: "onsoranje26.nl", at: "*", want: false, why: "widget ververst zichzelf" },
  { day: "2026-10-11", dev: "iPhone", site: "amazon.com", at: "23:22", want: false, why: "Amazon-app op de achtergrond (melding/verversen), alleen plaatjes" },
  { day: "2026-10-08", dev: "Apple TV", site: "youtube.com", at: "00:16", want: true, why: "YouTube-app (kanaalplaatjes), alleen video daarna" },
  { day: "2026-10-11", dev: "iPhone", site: "youtube.com", at: "18:28", want: false, why: "videoclip in Shazam, YouTube niet geopend" },
  { day: "2026-10-11", dev: "iPad", site: "minecraft.net", at: "16:42", want: true, why: "Minecraft gespeeld (meetgegevens tijdens het spel)" },
  { day: "2026-10-11", dev: "iPhone", site: "whatsapp.com", at: "14:06", want: true, why: "app geopend, bericht verstuurd" },
  { day: "2026-10-16", dev: "iPhone", site: "whatsapp.com", at: "16:08", want: true, why: "app geopend (graph. nog in het geheugen)" },
  { day: "2026-10-12", dev: "MacBook", site: "canva.com", at: "08:48", want: true, why: "Canva geopend (sjablonen, plaatjes)" },
  { day: "2026-10-15", dev: "iPad", site: "netflix.com", at: "09:32", want: false, why: "Netflix-app op de achtergrond wakker (geen beeld)" },
  { day: "2026-10-15", dev: "iPad", site: "netflix.com", at: "11:47", want: false, why: "Netflix-app op de achtergrond wakker (geen beeld)" },
  { day: "2026-10-15", dev: "iPad", site: "netflix.com", at: "17:54", want: true, why: "Netflix gekeken (beeld en titels)" },
  { day: "2026-10-12", dev: "MacBook", site: "canva.com", at: "09:21", want: false, why: "open tabblad meldt zich (www. + meetadres)" },
  { day: "2026-10-12", dev: "MacBook", site: "canva.com", at: "10:59", want: false, why: "open tabblad meldt zich (www. + meetadres)" },
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
  { day: "2026-10-17", dev: "iPhone", site: "waze.com", at: "09:50", until: "10:22", want: true, why: "rit met Waze: kaartstukjes maar af en toe, één rit" },
  { day: "2026-10-17", dev: "iPhone", site: "waze.com", at: "18:48", until: "19:07", want: true, why: "rit met Waze: daarna elke ~1,5 min een Firebase-melding van de app" },
  { day: "2026-10-17", dev: "Apple TV", site: "youtube.com", at: "01:49", want: true, why: "YouTube gekeken: kijkmeldingen aan www.youtube.com" },
  { day: "2026-10-17", dev: "iPad", site: "tocaboca.com", at: "10:43", until: "11:00", want: true, why: "Toca Boca gespeeld: meldingen via een Amazon-adres (doorverwijzing)" },
  { day: "2026-10-17", dev: "iPad", site: "tocaboca.com", at: "12:11", until: "12:42", want: true, why: "Toca Boca gespeeld, meldingen soms 6-8 min uit elkaar: één keer spelen" },
  { day: "2026-10-14", dev: "iPad", site: "tutotoons.com", at: "17:58", until: "18:37", want: true, why: "TutoTOONS gespeeld: meetgegevens van Unity tussendoor" },
  { day: "2026-10-17", dev: "iPad", site: "google.com", at: "12:49", want: false, why: "TutoTOONS start op en vraagt www.google.com op (advertentiemodule), geen zoekopdracht" },
  { day: "2026-10-17", dev: "iPad", site: "google.com", at: "09:37", want: false, why: "Squla laadt Google-meetcode (www.google.nl), geen zoekopdracht" },
  { day: "2026-10-17", dev: "iPhone", site: "whatsapp.com", at: "07:24", want: false, why: "binnenkomend bericht met foto (g. → static./media. → api., zonder whatsapp.com), eerste van de ochtend" },
  { day: "2026-10-18", dev: "iPhone", site: "whatsapp.com", at: "07:15", want: false, why: "binnenkomend bericht met foto, geen openen (eigenaar)" },
  { day: "2026-10-18", dev: "iPhone", site: "whatsapp.com", at: "10:06", want: true, why: "WhatsApp geopend (whatsapp.com + graph + static), na het lezen van mail" },
  { day: "2026-10-18", dev: "iPhone", site: "whatsapp.com", at: "10:22", want: true, why: "eigenaar zat op WhatsApp: chat.cdn → whatsapp.com → mmx-ds, zonder foto's" },
  { day: "2026-10-17", dev: "iPhone", site: "vinted.com", at: "08:59", want: true, why: "Vinted volledig opgestart (met meetmodules van andere diensten)" },
  { day: "2026-10-16", dev: "iPad", site: "budgestudios.ca", at: "06:45", until: "07:01", want: true, why: "Budge-spel gespeeld: meetgegevens van Unity/Amplitude" },
  { day: "2026-10-11", dev: "iPhone", site: "trivago.nl", at: "17:09", want: false, why: "tabblad opnieuw geladen (tien sites in 17 s)" },
  { day: "2026-10-11", dev: "iPhone", site: "allcamps.nl", at: "17:09", want: false, why: "tabblad opnieuw geladen (tien sites in 17 s)" },
  { day: "2026-10-11", dev: "iPhone", site: "ravensburger.nl", at: "16:01", want: true, why: "winkel echt geopend (hele pagina geladen); het 'scrollen in Facebook' erna was de Facebook-pixel van een andere site" },
  { day: "2026-10-19", dev: "iPad", site: "tutotoons.com", at: "08:04", want: true, why: "TutoTOONS volledig opgestart (apps./tutoclub./tutopulse./h-kafka in één moment), daarna 9 min stil spelen" },
  { day: "2026-10-19", dev: "iPhone", site: "buienradar.nl", at: "14:58", want: true, why: "Buienradar-app even geopend (9 eigen adressen, toestemmingsscherm en advertenties in dezelfde seconden)" },
  { day: "2026-10-19", dev: "iPhone", site: "xenos.nl", at: "10:30", want: true, why: "in de nieuwsbrief getikt (url861.xenos.nl), winkel 28 s later geopend; leukerecepten.nl herlaadde toevallig tegelijk" },
  { day: "2026-10-20", dev: "iPhone", site: "happywithyoga.com", at: "11:44", until: "12:09", want: true, why: "yogales: Wistia-filmpje op de cursussite speelde 25 min (Google laadde als teller mee en kreeg eerst de tijd)" },
  { day: "2026-10-20", dev: "iPhone", site: "4kmedia-market.com", at: "19:12", want: false, why: "plaatje uit een spammail (laadt elke keer alleen met mails mee); de Google-teller van getdrezzed.nl leek een zoekopdracht (eigenaar: \"niet gebruikt\")" },
  { day: "2026-10-21", dev: "iPhone", site: "dwin2.com", at: "10:31", want: false, why: "Awin-affiliateteller die go-kids.nl meelaadde (go-kids.nl zelf blijft staan; eigenaar: \"niet gebruikt\")" },
  { day: "2026-10-21", dev: "iPhone", site: "go-kids.nl", at: "10:31", want: true, why: "na een zoekopdracht geopend; dwin2.com was alleen de teller erin" },
  { day: "2026-10-21", dev: "iPhone", site: "starlink.com", at: "14:37", want: false, why: "advertentie in X: alleen het adres opgevraagd, niets van de pagina geladen" },
  { day: "2026-10-21", dev: "iPhone", site: "ftmo.com", at: "15:21", want: false, why: "advertentie in X: alleen het adres, geen onderdelen" },
  { day: "2026-10-22", dev: "iPhone", site: "youshouldask.ai", at: "14:26", want: false, why: "chatknop in de Scapino-site, geen eigen bezoek" },
  { day: "2026-10-22", dev: "iPhone", site: "hcaptcha.com", at: "19:51", want: false, why: "captcha bij afrekenen in een webwinkel" },
  { day: "2026-10-22", dev: "iPad", site: "playpiknik.com", at: "18:39", want: true, why: "Piknik (spel) opgestart: account-api.playpiknik.com met Unity en AppsFlyer-launch" },
  { day: "2026-10-19", dev: "Apple TV", site: "primevideo.com", at: "19:35", want: true, why: "Prime Video gekeken tot 21:42 (amazonvideo.com, api.amazon.com en beeld van pv-cdn.net horen samen)" },
  { day: "2026-10-19", dev: "Apple TV", site: "amazon.com", at: "19:35", want: false, why: "op een tv is Amazon-verkeer de Prime Video-app" },
  { day: "2026-10-19", dev: "iPhone", site: "leukerecepten.nl", at: "18:46", want: false, why: "open tabblad dat Safari herlaadt (zes sites in 27 s), mijn. laadt bij elke pagina mee" },
  { day: "2026-10-19", dev: "iPhone", site: "leukerecepten.nl", at: "08:19", want: true, why: "recept echt gelezen (6 min)" },
  { day: "2026-10-19", dev: "iPhone", site: "xellybeauty.nl", at: "10:33", want: true, why: "Shopify-winkel echt geladen (cdn.shopify.com, reviews, Shop Pay in dezelfde seconden); daarna PayPal" },
  { day: "2026-10-19", dev: "iPhone", site: "shop.app", at: "10:33", want: false, why: "Shop Pay-knop in de Shopify-winkel, geen eigen bezoek" },
  { day: "2026-10-19", dev: "iPhone", site: "judge.me", at: "10:33", want: false, why: "reviews in de Shopify-winkel, geen eigen bezoek" },
  { day: "2026-10-19", dev: "iPhone", site: "chatbase.co", at: "09:16", want: false, why: "AI-chatknop die in leukerecepten.nl zit, geen eigen bezoek" },
  { day: "2026-10-19", dev: "iPad", site: "ipapi.co", at: "07:15", want: false, why: "IP/land-opzoekdienst die een kinder-app bij het opstarten aanroept" },
  { day: "2026-10-18", dev: "iPad", site: "bobo-world.com", at: "16:25", want: true, why: "kinderspel BoBo World gestart (svip./www.bobo-world + www.kalegames), daarna elke ~4 min cp.papoworld" },
  { day: "2026-10-18", dev: "iPad", site: "papoworld.com", at: "16:26", want: false, why: "hoort bij het spel BoBo World, geen aparte site" },
  { day: "2026-10-11", dev: "iPhone", site: "ravensburger.cloud", at: "16:01", want: false, why: "onderdeel van ravensburger.nl (zelfde merk)" },
  { day: "2026-10-11", dev: "iPhone", site: "nu.nl", at: "10:53", want: true, why: "link uit X geopend" },
  { day: "2026-10-17", dev: "iPhone", site: "shazam.com", at: "14:49", want: true, why: "Shazam geopend (nummer herkend, daarna door naar Spotify)" },
  { day: "2026-10-16", dev: "iPhone", site: "shazam.com", at: "*", want: false, why: "alleen achtergrondmeldingen (beacon) van Shazam, dag en nacht" },
  { day: "2026-10-17", dev: "iPhone", site: "instagram.com", at: "13:42", want: true, why: "Instagram: vier foto's van cdninstagram (gedeelde Meta-adressen horen hierbij)" },
  { day: "2026-10-17", dev: "iPhone", site: "facebook.com", at: "13:42", want: false, why: "was Instagram (netwerkmeting en graph.facebook.com gedeeld)" },
  { day: "2026-10-17", dev: "iPhone", site: "instagram.com", at: "08:59", want: true, why: "Instagram gebruikt, daarna via een link naar een webwinkel" },
  { day: "2026-10-17", dev: "iPhone", site: "instagram.com", at: "14:50", want: "onzeker", why: "Instagram gestart (www.instagram.com), geen foto's geladen" },
  { day: "2026-10-16", dev: "iPhone", site: "facebook.com", at: "11:57", want: true, why: "echt Facebook: chat, lookaside en eigen foto-servers" },
  { day: "2026-10-17", dev: "iPhone", site: "facebook.com", at: "20:23", want: false, why: "Facebook-pixel op een website (vanuit Google geopend)" },
  { day: "2026-10-17", dev: "iPhone", site: "neoseum.com", at: "20:24", want: true, why: "echt bezocht (eigenaar bevestigt); de Facebook-pixel van de site maakte hem eerder onzeker" },
  { day: "2026-10-18", dev: "iPhone", site: "chatgpt.com", at: "07:21", want: false, why: "advertentie-teller van OpenAI (bzr.) op een webwinkel" },
  { day: "2026-10-18", dev: "iPhone", site: "getdrezzed.nl", at: "07:21", want: true, why: "geopend vanuit Google" },
  { day: "2026-10-18", dev: "iPhone", site: "meditopia.com", at: "08:56", want: "onzeker", why: "app start telkens even als eerste bij ontgrendelen (5-6 s); eigenaar twijfelt" },
  { day: "2026-10-18", dev: "iPhone", site: "degroenelinde.nl", at: "*", want: false, why: "alleen in het alfabet-rijtje van een lijst opgeslagen sites (logo's), geen bezoek" },
  { day: "2026-10-18", dev: "iPhone", site: "voetbalkrant.com", at: "09:19", want: false, why: "ververst zichzelf (samen met onsoranje26.nl), viel toevallig na een zoekopdracht" },
  { day: "2026-10-18", dev: "iPhone", site: "onsoranje26.nl", at: "09:19", want: false, why: "ververst zichzelf (samen met voetbalkrant.com)" },
  { day: "2026-10-10", dev: "iPhone", site: "facebook.com", at: "15:38", want: true, why: "Facebook-app open (chat, netwerkmeting), daarna een website vanuit Facebook" },
  { day: "2026-10-24", dev: "iPhone", site: "loislee.nl", at: "08:18", want: true, why: "webwinkel geopend (vanuit YouTube)" },
  { day: "2026-10-24", dev: "iPhone", site: "varify.io", at: "08:18", want: false, why: "A/B-testtool die de webwinkel meelaadt (3 s na de pagina, midden in het laden)" },
  { day: "2026-10-24", dev: "iPhone", site: "stackflowaisolutions.com", at: "08:26", want: false, why: "chatknop van een webwinkel (11 s na de pagina, die nog laadde)" },
  { day: "2026-10-24", dev: "iPhone", site: "placehold.co", at: "09:06", want: false, why: "vervang-plaatjes op een betaalpagina" },
  { day: "2026-10-24", dev: "iPhone", site: "happinez.nl", at: "11:39", want: true, why: "vanuit een nieuwsbrief naar de site getikt (www.email. → www., hele pagina geladen)" },
  { day: "2026-10-15", dev: "iPhone", site: "marktplaats.nl", at: "12:44", want: true, why: "Marktplaats-app geopend vlak na het lezen van mail (app.marktplaats.nl en de hele app laadde)" },
  { day: "2026-10-25", dev: "iPad", site: "my-little-princess.net", at: "08:38", want: true, why: "kinderspel (Unity) na Netflix gestart; tot 09:01 gespeeld (motor meldt elke 5 min)" },
];
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const auto = new Set<string>(d.auto ?? []);
const hm = (t: number) => new Date(t).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
let bad = 0, skipped = 0;
// Dagen die niet meer in NextDNS staan (logboek leeggemaakt of te oud): overslaan. De regels zelf staan in de code en blijven.
const have = new Set<string>(d.groups.map((g: any) => g.d));
for (const c of CASES) {
  if (!have.has(c.day)) { skipped++; continue; }
  const gs = d.groups.filter((g: any) => g.d === c.day && g.dev === c.dev && (c.site.startsWith("*.") ? g.site.endsWith(c.site.slice(1)) : g.site === c.site) && !g.bg && g.main);
  const visS = gs.flatMap((g: any) => (g.ss ?? []).filter((x: any) => isHuman(x) && !(x.pv && !x.lg && auto.has(g.dev + "|" + g.site))));
  const vis = visS.map((x: any) => hm(x.s));
  const got = c.at === "*" ? vis.length > 0 : visS.some((x: any) => hm(x.s) === c.at && (!c.until || hm(x.e) >= c.until));
  const unsure = visS.some((x: any) => (c.at === "*" || hm(x.s) === c.at) && x.uz);
  const ok = c.want === "onzeker" ? got && unsure : got === c.want && !(c.want && unsure);
  if (!ok) bad++;
  // Op GitHub zijn de logboeken openbaar: daar geen dagen en sites, alleen het nummer van het geval.
  if (process.env.GITHUB_ACTIONS) { if (!ok) console.log(`✗ referentiegeval ${CASES.indexOf(c) + 1} klopt niet`); continue; }
  console.log(`${ok ? "✓" : "✗"} ${c.day} ${c.at} ${c.site} → ${c.want === "onzeker" ? "tonen als onzeker" : c.want ? "tonen" + (c.until ? ` tot ${c.until}` : "") : "niet tonen"} (${c.why})${ok ? "" : `  [nu: ${got ? (unsure ? "getoond als onzeker" : "getoond") : "niet getoond"}]`}`);
}
if (skipped) console.log(`\n${skipped} referentiegeval(len) overgeslagen: die dag staat niet meer in NextDNS.`);
console.log(bad ? `\n${bad} referentiegeval(len) kloppen niet.` : "\nAlle referentiegevallen kloppen.");
process.exit(bad ? 1 : 0);
