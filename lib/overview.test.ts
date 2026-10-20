import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverview } from "./overview.ts";
import { isHuman } from "./sessions.ts";

// Kleine nep-download van NextDNS (zelfde kolommen), met verzonnen apparaten.
const T0 = Date.parse("2026-09-01T10:52:38Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
type R = [number, string, string?, string?];
async function overview(rows: R[]) {
  const head = "timestamp\tdomain\tstatus\treasons\tdestination_country\tclient_ip\tdevice_id\tdevice_name\tdevice_model";
  const tsv = [head, ...rows.sort((a, b) => a[0] - b[0]).map(([t, host, dev = "P1", status = ""]) => [at(t), host, status, "", "", "10.0.0.1", dev, dev === "TV1" ? "Apple TV" : "iPhone", ""].join("\t"))].join("\n");
  const res = { ok: true, status: 200, text: async () => tsv, json: async () => ({}) };
  const r = await buildOverview({ logs: async () => res, download: async () => res }, { todayOnly: false });
  return r.body as { groups: { site: string; dev: string; lm?: number; ss: { s: number; e: number; emb?: 1 }[] }[] };
}
const shown = (o: Awaited<ReturnType<typeof overview>>, site: string) => o.groups.filter((g) => g.site === site).flatMap((g) => g.ss.filter((x) => isHuman(x as never)));

test("pagina laadt zelf andere adressen (affiliate-link, productwidget): alleen de pagina zelf is een bezoek", async () => {
  const o = await overview([
    [0, "www.google.com"], [800, "www.iculture.nl"], [1050, "iculture.report"], [1380, "bigspark.link"], [1400, "securepubads.g.doubleclick.net", "P1", "blocked"],
    [2100, "fonts.gstatic.com"], [2940, "wct-2.com"],
  ]);
  assert.equal(shown(o, "iculture.nl").length, 1); // na zoeken geopend: telt
  for (const s of ["iculture.report", "bigspark.link", "wct-2.com"]) assert.equal(shown(o, s).length, 0, s);
});

test("geen vals weglaten: los geopende site, doorgestuurd naar www., of na een zoekmachine blijft een bezoek", async () => {
  const o = await overview([
    [0, "www.iculture.nl"], [600, "www.bol.com"], // doorgestuurd naar een webwinkel (www.)
    [120_000, "www.google.com"], [120_900, "nu.nl"], // tik op een zoekresultaat
    [400_000, "tweakers.net"], // later los geopend
  ]);
  assert.equal(shown(o, "bol.com").length, 1);
  assert.equal(shown(o, "nu.nl").length, 1);
  assert.equal(shown(o, "tweakers.net").length, 1);
});

test("Ziggo GO op de Apple TV: kijken met afspeelmeldingen is één doorlopende sessie tot de laatste melding", async () => {
  const min = 60_000;
  const rows: R[] = [];
  for (let x = 0; x <= 63; x += 7) rows.push([x * min, "spark-prod-nl.gnp.cloud.ziggogo.tv", "TV1"]);
  rows.push([3_000, "messagebroker-prod-nl.gnp.cloud.dmdsdp.com", "TV1"]);
  for (let x = 0; x <= 68; x++) rows.push([x * min + 20_000, "cws-lgi.conviva.com", "TV1", "blocked"]);
  const o = await overview(rows);
  const zig = o.groups.filter((g) => g.site === "ziggogo.tv");
  assert.equal(zig.length, 1);
  assert.equal(zig[0].ss.length, 1);
  assert.equal(zig[0].ss[0].e, T0 + 68 * min + 20_000); // tot de laatste afspeelmelding: de rij en de chip zeggen hetzelfde
  assert.equal(zig[0].lm, T0 + 68 * min + 20_000);
  assert.equal(o.groups.filter((g) => g.site === "disneyplus.com").length, 0);
});

test("geen vals kijken: afspeelmeldingen na het stoppen (meer dan 5 minuten stil) horen niet meer bij Ziggo GO", async () => {
  const min = 60_000;
  const o = await overview([[0, "spark-prod-nl.gnp.cloud.ziggogo.tv", "TV1"], [1 * min, "cws-lgi.conviva.com", "TV1", "blocked"], [20 * min, "cws-lgi.conviva.com", "TV1", "blocked"]]);
  const zig = o.groups.find((g) => g.site === "ziggogo.tv")!;
  assert.equal(Math.max(...zig.ss.map((x) => x.e)), T0 + min);
});

test("onderdelen van een pagina na zoeken (rond een geopende nieuwsbrief): alleen de site zelf telt", async () => {
  // Echt voorbeeld: mail opgehaald, nieuwsbrief, dan zoeken op Google, dan de winkel; de winkel laadt een advies-widget mee.
  const o = await overview([
    [0, "imap.mail.me.com"], [430, "winkel.acemlna.com"], [18_600, "www.google.nl"], [18_800, "www.google.com"], [21_000, "encrypted-tbn0.gstatic.com"],
    [38_100, "www.scapino.nl"], [39_400, "product-images.scapino.nl"], [39_400, "app.youshouldask.ai"], [130_000, "www.google.nl"], [131_000, "encrypted-tbn1.gstatic.com"],
  ]);
  assert.equal(shown(o, "scapino.nl").length, 1);
  assert.equal(shown(o, "youshouldask.ai").length, 0);
});

test("site die altijd samen met een andere site opduikt (maker van de website) is een onderdeel; de site zelf blijft", async () => {
  const day = 86_400_000;
  const rows: R[] = [];
  for (let i = 0; i < 3; i++) rows.push([i * day, "www.stap.nu"], [i * day + 300, "www.dewerkendewebsite.nl"], [i * day + 400, "code.dewerkendewebsite.nl"]);
  rows.push([3 * day, "www.stap.nu"]); // de site zelf wordt ook los geopend
  const o = await overview(rows);
  assert.equal(shown(o, "dewerkendewebsite.nl").length, 0);
  assert.equal(shown(o, "stap.nu").length, 4);
});

test("geen vals weglaten: een site die ook los geopend wordt, blijft ook als hij soms samen met een andere opduikt", async () => {
  const day = 86_400_000;
  const o = await overview([[0, "www.stap.nu"], [300, "www.zorgsite.nl"], [day, "www.stap.nu"], [day + 300, "www.zorgsite.nl"], [2 * day, "www.zorgsite.nl"]]);
  assert.equal(shown(o, "zorgsite.nl").length, 3);
  // Twee sites die alleen samen voorkomen: allebei tonen (niet allebei wegstrepen).
  const p = await overview([[0, "www.a-winkel.nl"], [0, "www.b-winkel.nl"], [day, "www.a-winkel.nl"], [day, "www.b-winkel.nl"]]);
  assert.ok(shown(p, "a-winkel.nl").length + shown(p, "b-winkel.nl").length >= 2);
});

test("twee nieuwe sites in dezelfde halve seconde na een pagina: zustersites die de pagina laadt", async () => {
  const o = await overview([[0, "www.scanid.nl"], [1100, "www.leeftijdscanner.nl"], [1150, "www.agepop.nl"]]);
  assert.equal(shown(o, "scanid.nl").length, 1);
  assert.equal(shown(o, "leeftijdscanner.nl").length, 0);
  assert.equal(shown(o, "agepop.nl").length, 0);
});

test("geen vals weglaten: twee sites kort na elkaar zonder pagina ervoor, of na een zoekmachine, blijven", async () => {
  const o = await overview([[0, "www.google.com"], [900, "www.fietsen-a.nl"], [1000, "www.fietsen-b.nl"]]);
  assert.equal(shown(o, "fietsen-a.nl").length + shown(o, "fietsen-b.nl").length, 2);
});

test("ingesloten videospeler die doorspeelt (Wistia in een cursus): de cursus-site loopt door tot het einde van het filmpje", async () => {
  const min = 60_000;
  const rows: R[] = [[0, "academy.cursussite.com"], [1_000, "cdn.thinkific.com"], [17_000, "assets.thinkific.com"], [17_000, "fast.wistia.net"], [69_000, "fast.wistia.com"], [70_000, "embed-ssl.wistia.com"]];
  for (let x = 2; x <= 48; x += 2) rows.push([x * min, "distillery.wistia.com", "P1", "blocked"], [x * min + 500, "pipedream.wistia.com", "P1", "blocked"]);
  const o = await overview(rows);
  const end = Math.max(...shown(o, "cursussite.com").map((x) => x.e));
  assert.ok(o.groups.filter((g) => g.site === "thinkific.com").every((g) => (g as { bg?: boolean }).bg)); // het platform eronder is geen eigen bezoek
  assert.ok(end >= T0 + 48 * min, "cursus tot het einde van het filmpje");
  assert.equal(shown(o, "wistia.com").length, 0);
});

test("geen vals kijken: een los filmpje zonder site eromheen telt niet als bezoek aan een andere site", async () => {
  const o = await overview([[0, "www.nieuws.nl"], [600_000, "player.vimeo.com"], [610_000, "player.vimeo.com"]]);
  assert.equal(Math.max(...shown(o, "nieuws.nl").map((x) => x.e)), T0);
});

test("winkelplatform dat bij elke pagina van een webwinkel meelaadt (ook binnen één bezoek): onderdeel; de winkel blijft", async () => {
  const o = await overview([
    [0, "www.google.com"], [28_000, "hoerakinderschoenen.nl"], [28_450, "app.ecwid.com"],
    [68_000, "hoerakinderschoenen.nl"], [68_300, "app.ecwid.com"],
  ]);
  assert.equal(shown(o, "hoerakinderschoenen.nl").length, 1);
  assert.equal(shown(o, "ecwid.com").length, 0);
});

test("ingebouwde tool (embed.) in een cursusportaal: het portaal is het bezoek, de tool niet; gebruik van de tool telt mee", async () => {
  const o = await overview([[0, "academy.cursussite.nl"], [700, "embed.toolsite.com"], [42_000, "app.toolsite.com"]]);
  assert.equal(shown(o, "toolsite.com").length, 0);
  const s = shown(o, "cursussite.nl");
  assert.equal(s.length, 1);
  assert.ok(s[0].e >= T0 + 42_000, "portaal loopt door zolang de tool gebruikt wordt");
});

test("geen vals weglaten: een site die zelf geopend wordt met zijn eigen embed.-onderdeel blijft een bezoek", async () => {
  const o = await overview([[0, "www.nieuwssite.nl"], [3_000, "www.tijdschrift.nl"], [3_400, "embed.tijdschrift.nl"], [12_000, "www.tijdschrift.nl"]]);
  assert.equal(shown(o, "tijdschrift.nl").length, 1);
});

test("script dat een websitebouwer bij elke pagina laadt (op github.io): elke keer na hetzelfde hulpadres, dus geen eigen bezoek", async () => {
  const day = 86_400_000;
  const rows: R[] = [];
  for (const d of [0, 1, 2]) rows.push([d * day, "publish.sitebouwer.nl"], [d * day + 300, "maker-script.github.io"]);
  rows.push([2 * day + 600_000, "publish.sitebouwer.nl"], [2 * day + 608_000, "maker-script.github.io"]); // tot 10 s erna
  const o = await overview(rows);
  assert.equal(shown(o, "maker-script.github.io").length, 0);
});

test("geen vals weglaten: een github.io-site die ook een keer zonder dat hulpadres geopend wordt, of maar twee keer, blijft staan", async () => {
  const day = 86_400_000;
  const rows: R[] = [];
  for (const d of [0, 1, 2]) rows.push([d * day, "publish.sitebouwer.nl"], [d * day + 300, "maker-script.github.io"]);
  rows.push([3 * day, "maker-script.github.io"]); // los geopend
  for (const d of [0, 1]) rows.push([d * day + 3_600_000, "publish.sitebouwer.nl"], [d * day + 3_600_300, "ander-project.github.io"]);
  const o = await overview(rows);
  assert.ok(shown(o, "maker-script.github.io").length >= 1);
  assert.equal(shown(o, "ander-project.github.io").length, 2);
});

test("widget die zichzelf ververst: twee verversingen binnen 5 minuten zijn ook geen bezoek; een echte pagina met plaatjes wel", async () => {
  const day = 86_400_000, min = 60_000;
  const rows: R[] = [];
  for (const d of [0, 1, 2]) for (let i = 0; i < 6; i++) rows.push([d * day + i * 40 * min, "voetbalwidget.nl"], [d * day + i * 40 * min + 100, "www.voetbalwidget.nl"]);
  rows.push([3 * day, "voetbalwidget.nl"], [3 * day + 4 * min, "www.voetbalwidget.nl"]); // twee verversingen 4 min uit elkaar
  rows.push([3 * day + 120 * min, "www.voetbalwidget.nl"], [3 * day + 120 * min + 2_000, "img.voetbalwidget.nl"], [3 * day + 123 * min, "www.voetbalwidget.nl"]); // echt bekeken
  rows.push([3 * day + 200 * min, "www.krant.nl"], [3 * day + 204 * min, "krant.nl"]); // andere site: gewoon een bezoek
  const o = await overview(rows);
  const vis = shown(o, "voetbalwidget.nl");
  assert.equal(vis.length, 1);
  assert.equal(vis[0].s, T0 + 3 * day + 120 * min);
  assert.equal(shown(o, "krant.nl").length, 1);
});

test("WhatsApp geopend terwijl graph. nog in het geheugen ligt: de volledige opstart (kale naam, api., g., static.) telt als openen", async () => {
  const o = await overview([[0, "g.whatsapp.net"], [1_000, "whatsapp.com"], [2_500, "static.whatsapp.net"], [2_600, "mmx-ds.cdn.whatsapp.net"], [3_500, "api.whatsapp.net"]]);
  assert.equal(shown(o, "whatsapp.com").length, 1);
});

test("geen vals WhatsApp: een binnenkomend bericht (api. + g. + plaatje, of zonder de kale naam) is geen openen", async () => {
  const o = await overview([
    [0, "api.whatsapp.net"], [500, "g.whatsapp.net"], [900, "mmx-ds.cdn.whatsapp.net"],
    [600_000, "static.whatsapp.net"], [600_300, "mmx-ds.cdn.whatsapp.net"],
    [1_200_000, "api.whatsapp.net"], [1_200_400, "g.whatsapp.net"], [1_201_000, "static.whatsapp.net"],
  ]);
  assert.equal(shown(o, "whatsapp.com").length, 0);
  // Met de kale naam (whatsapp.com) is het wel openen (18 okt, bevestigd door de eigenaar: chat.cdn → whatsapp.com → mmx-ds).
  const open = await overview([[0, "chat.cdn.whatsapp.net"], [400, "whatsapp.com"], [1_000, "mmx-ds.cdn.whatsapp.net"]]);
  assert.equal(shown(open, "whatsapp.com").length, 1);
});

test("open tabblad (Canva): elke paar minuten alleen www. en een meetadres is geen gebruik; het openen zelf wel", async () => {
  const day = 86_400_000, min = 60_000;
  const rows: R[] = [];
  for (const d of [0, 1, 2]) for (let i = 0; i < 6; i++) rows.push([d * day + i * 40 * min, "www.tekentool.nl"]);
  rows.push([3 * day, "www.tekentool.nl"], [3 * day + 500, "static.tekentool.nl"], [3 * day + 2_000, "media.tekentool.nl"], [3 * day + 4_000, "template.tekentool.nl"]); // geopend
  rows.push([3 * day + 6 * min, "www.tekentool.nl"], [3 * day + 6 * min + 15_000, "telemetry.tekentool.nl"]); // tabblad meldt zich
  const o = await overview(rows);
  const vis = shown(o, "tekentool.nl");
  assert.equal(vis.length, 1);
  assert.equal(vis[0].s, T0 + 3 * day);
});

test("Netflix op een tablet: elk uur even wakker op de achtergrond (zonder beeld of plaatjes) is geen kijken; kijken wel", async () => {
  const min = 60_000;
  const rows: R[] = [];
  for (const h of [0, 60, 120]) rows.push([h * min, "push.prod.netflix.com"], [h * min + 300, "ios.prod.cloud.netflix.com"], [h * min + 2_000, "logs.netflix.com"], [h * min + 2_500, "www.netflix.com"]);
  // echt kijken: titels (plaatjes) en beeld, met tussendoor meldingen van de speler
  rows.push([200 * min, "www.netflix.com"], [200 * min + 1_000, "occ-0-1-2.1.nflxso.net"], [201 * min, "ipv6-c1-ams001-ix.1.oca.nflxvideo.net"], [204 * min, "logs.netflix.com"], [208 * min, "logs.netflix.com"]);
  const o = await overview(rows);
  const vis = shown(o, "netflix.com");
  assert.equal(vis.length, 1);
  assert.equal(vis[0].s, T0 + 200 * min);
});

test("YouTube op de Apple TV: kijkmeldingen aan www.youtube.com rekken het kijken op; een ingebouwde video op een site niet", async () => {
  const s = 1_000;
  const o = await overview([
    [-29 * s, "www.youtube.com", "TV1"], [0, "i.ytimg.com", "TV1"], [4 * s, "googleads.g.doubleclick.net", "TV1", "blocked"],
    [182 * s, "www.youtube.com", "TV1"], [266 * s, "www.youtube.com", "TV1"], // video speelt over een open verbinding
    // Ingebouwde video op een site (iPhone): www + plaatje + bare youtube.com binnen een paar seconden: geen bezoek.
    [3_600 * s, "www.youtube.com"], [3_600.2 * s, "i.ytimg.com"], [3_601 * s, "rr5---sn-x.googlevideo.com"], [3_603 * s, "youtube.com"],
  ]);
  const tv = shown(o, "youtube.com").filter((x) => x.s < T0 + 1_000 * s);
  assert.equal(tv.length, 1);
  assert.equal(tv[0].e, T0 + 266 * s);
  assert.equal(shown(o, "youtube.com").filter((x) => x.s > T0 + 1_000 * s).length, 0);
});

test("Waze: onderweg komen kaartstukjes maar af en toe; stukjes met hooguit 20 minuten ertussen zijn één rit, een rit later niet", async () => {
  const min = 60_000;
  const burst = (t: number): R[] => ["cresg.waze.com", "sdk.waze.com", "rt-xlb-row.waze.com", "ctilesgcs-row.waze.com", "wig-row.waze.com", "dexter.waze.com"].map((h, i) => [t + i * 300, h]);
  const o = await overview([
    ...burst(0), [2 * min, "cres.waze.com"], [11 * min, "ctilesgcs-row.waze.com"], [11 * min + 800, "dexter.waze.com"], [15 * min, "renderer-row.waze.com"], [32 * min, "rt-xlb-row.waze.com"],
    ...burst(80 * min), // later opnieuw geopend: een nieuwe rit
  ]);
  const ss = o.groups.filter((g) => g.site === "waze.com").flatMap((g) => g.ss).sort((a, b) => a.s - b.s);
  assert.equal(ss.length, 2);
  assert.equal(ss[0].e - ss[0].s, 32 * min);
});

test("doorverwijs-adres: Toca Boca meldt tijdens het spelen via een Amazon-adres; dat telt als spelen, een algemeen CDN-adres niet", async () => {
  const min = 60_000;
  const elb = "event-alb-1.eu-west-1.elb.amazonaws.com";
  const rows: R[] = [[0, "lifeserver.tocaboca.com", "P2"], [500, "analytics.tocaboca.com", "P2"]];
  // Eigen adres elke 7,5 minuut (steeds samen met het Amazon-adres), het Amazon-adres zelf elke 2,5 minuut.
  for (let t = 0; t <= 15 * min; t += 7.5 * min) rows.push([t + 40_000, "analytics-events.tocaboca.com", "P2"], [t + 40_050, elb, "P2"]);
  for (let t = 3 * min; t <= 17 * min; t += 2.5 * min) rows.push([t, elb, "P2"]);
  // Een algemeen CDN-adres dat met allerlei apps meekomt, en een Amazon-adres dat lang na het spelen opduikt.
  rows.push([1 * min, "c.sni.global.fastly.net", "P2"], [1 * min + 100, "c.sni.global.fastly.net", "P2"], [90 * min, elb, "P2"]);
  for (const [i, h] of ["www.netflix.com", "open.spotify.com", "www.npo.nl"].entries()) rows.push([(30 + i * 10) * min, h, "P2"], [(30 + i * 10) * min + 200, "c.sni.global.fastly.net", "P2"]);
  const o = await overview(rows);
  const toca = o.groups.filter((g) => g.site === "tocaboca.com" && g.dev !== "").flatMap((g) => g.ss).sort((a, b) => a.s - b.s);
  assert.equal(toca[0].s, T0);
  assert.ok(toca[0].e >= T0 + 15 * min, "spelen loopt door tot de laatste melding");
  assert.ok(!toca.some((x) => x.e >= T0 + 80 * min), "een melding lang na het spelen hoort er niet bij");
  assert.ok(!o.groups.some((g) => g.site === "tocaboca.com" && g.ss.some((x) => x.s >= T0 + 25 * min)));
});

test("tabbladen opnieuw geladen: vier sites binnen 20 s die elk maar even laden zijn geen bezoek; een site waar je verder kijkt wel", async () => {
  const s = 1_000;
  const o = await overview([
    [0, "www.trivago.nl"], [1 * s, "www.tui.nl"], [10 * s, "www.lijstje.nl"], [11 * s, "www.allcamps.nl"],
    [12 * s, "www.bol.com"], [40 * s, "www.bol.com"], [90 * s, "www.bol.com"], // daarna echt verder gekeken
    [600 * s, "www.tui.nl"], [640 * s, "www.tui.nl"], // later los geopend: wel een bezoek
  ]);
  for (const site of ["trivago.nl", "allcamps.nl", "lijstje.nl"]) assert.equal(shown(o, site).length, 0, site);
  assert.equal(shown(o, "bol.com").length, 1);
  assert.equal(shown(o, "tui.nl").length, 1);
  assert.ok(shown(o, "tui.nl")[0].s >= T0 + 600 * s);
});

test("zelfde merk, andere extensie kort na elkaar (ravensburger.nl en ravensburger.cloud): één bezoek; twee losse sites niet", async () => {
  const s = 1_000;
  const o = await overview([
    [0, "www.ravensburger.nl"], [5 * s, "ravensburger.cloud"],
    [200 * s, "www.intertoys.nl"], [205 * s, "www.bol.com"],
  ]);
  assert.equal(shown(o, "ravensburger.nl").length, 1);
  assert.equal(shown(o, "ravensburger.cloud").length, 0);
  assert.equal(shown(o, "intertoys.nl").length, 1);
  assert.equal(shown(o, "bol.com").length, 1);
});

test("vaste melding: tot 10 minuten tussen twee meldingen is nog steeds spelen; een pauze van een kwartier niet", async () => {
  const min = 60_000;
  const elb = "event-alb-2.eu-west-1.elb.amazonaws.com";
  const rows: R[] = [[0, "lifeserver.tocaboca.com", "P3"]];
  // Eigen adres steeds samen met het Amazon-adres (doorverwijzing), en daartussen het Amazon-adres los, soms pas na 8 minuten.
  for (const t of [0.5, 10, 20, 30]) rows.push([t * min, "analytics-events.tocaboca.com", "P3"], [t * min + 50, elb, "P3"]);
  for (const t of [2, 4, 6, 14, 16, 18, 22, 24, 26, 28, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62]) rows.push([t * min, elb, "P3"]);
  rows.push([70 * min, elb, "P3"], [78 * min, elb, "P3"]); // 8 minuten stil: hoort er nog bij
  rows.push([93 * min, elb, "P3"]); // 15 minuten stil: een nieuwe keer (of niets)
  const o = await overview(rows);
  const ss = o.groups.filter((g) => g.site === "tocaboca.com").flatMap((g) => g.ss).sort((a, b) => a.s - b.s);
  assert.equal(ss[0].s, T0);
  assert.equal(ss[0].e, T0 + 78 * min);
  assert.ok(!ss.some((x) => x.s < T0 + 78 * min && x.e > T0 + 78 * min));
});

test("spel-motor (Unity) tijdens een spel hoort bij dat spel; na een andere app of zonder spel ervoor niet", async () => {
  const min = 60_000;
  const rows: R[] = [[0, "apps.tutotoons.com", "P4"], [500, "tutopulse.tutotoons.com", "P4"]];
  for (const t of [2, 4, 9, 14, 19, 24, 29]) rows.push([t * min, "cdp.cloud.unity3d.com", "P4", "blocked"]);
  rows.push([31 * min, "www.netflix.com", "P4"], [31 * min + 400, "ios.prod.ftl.netflix.com", "P4"]); // andere app geopend
  rows.push([33 * min, "cdp.cloud.unity3d.com", "P4", "blocked"]); // hoort niet meer bij het spel
  rows.push([200 * min, "cdp.cloud.unity3d.com", "P4", "blocked"], [205 * min, "cdp.cloud.unity3d.com", "P4", "blocked"]); // geen spel ervoor
  const o = await overview(rows);
  const tuto = o.groups.filter((g) => g.site === "tutotoons.com").flatMap((g) => g.ss).sort((a, b) => a.s - b.s);
  assert.equal(tuto[0].s, T0);
  assert.equal(tuto[0].e, T0 + 29 * min);
  assert.ok(!tuto.some((x) => x.e > T0 + 30 * min));
  const unknown = o.groups.filter((g) => g.site === "unity3d.com").flatMap((g) => g.ss);
  assert.ok(unknown.some((x) => x.s >= T0 + 200 * min), "zonder spel ervoor blijft het een onbekend spel");
});

test("Google: alleen www.google.nl tegelijk met de meetcode van een andere site is geen zoekopdracht; met zoekresultaten wel", async () => {
  const s = 1_000;
  const o = await overview([
    [0, "leukleren.squla.nl", "P5"], [1.5 * s, "www.googletagmanager.com", "P5"], [4.5 * s, "www.google.nl", "P5"], [4.6 * s, "stats.g.doubleclick.net", "P5", "blocked"],
    // echte zoekopdracht: zoekpagina, resultaten met plaatjes, even later nog een zoekopdracht
    [600 * s, "www.google.nl", "P5"], [601 * s, "ogads-pa.clients6.google.com", "P5"], [606 * s, "encrypted-tbn0.gstatic.com", "P5"], [620 * s, "www.google.nl", "P5"], [621 * s, "encrypted-tbn1.gstatic.com", "P5"],
  ]);
  const g = shown(o, "google.com");
  assert.equal(g.length, 1);
  assert.ok(g[0].s >= T0 + 600 * s);
});

test("telefoon ontgrendeld: veel apps verversen tegelijk; een korte app-rij daarin is onzeker, een volledige app-start niet", async () => {
  const s = 1_000;
  const o = await overview([
    // drie verschillende apps (gateway.facebook.com hoort bij Instagram, www.google.com vraagt WhatsApp zelf op)
    [0, "i.instagram.com", "P6"], [0, "gateway.facebook.com", "P6"], [0.1 * s, "www.google.com", "P6"], [0.2 * s, "api.buienradar.nl", "P6"],
    [2.5 * s, "graph.whatsapp.com", "P6"], [2.6 * s, "static.whatsapp.net", "P6"], [5 * s, "mmx-ds.cdn.whatsapp.net", "P6"],
    // later: Vinted echt geopend (veel eigen adressen), met meetmodules van Facebook en een reclamenetwerk erbij
    [600 * s, "api.vinted.com", "P6"], [600.2 * s, "www.vinted.com", "P6"], [600.4 * s, "flags.svc.vinted.com", "P6"], [601 * s, "images1.vinted.net", "P6"],
    [600.1 * s, "star.c10r.facebook.com", "P6"], [602 * s, "ms.applovin.com", "P6", "blocked"], [610 * s, "logs-ingress.svc.vinted.com", "P6"],
  ]);
  const wa = o.groups.filter((g) => g.site === "whatsapp.com").flatMap((g) => g.ss).filter((x) => isHuman(x as never));
  for (const x of wa) assert.equal((x as { uz?: 1 }).uz, 1);
  const vin = shown(o, "vinted.com");
  assert.equal(vin.length, 1);
  assert.notEqual((vin[0] as { uz?: 1 }).uz, 1);
});

test("Instagram gebruikt met gedeelde Meta-adressen (netwerkmeting, graph.facebook.com): de rij heet Instagram, niet Facebook", async () => {
  const ns = "5d33d294-f526-4fe5-af28-cadb473de3bc-netseer-ipaddr-assoc.xz.fbcdn.net";
  const o = await overview([
    [0, "i.instagram.com"], [100, "gateway.facebook.com"], [600, "scontent-lhr11-1.cdninstagram.com"], [700, "graph.facebook.com"],
    [800, "www.facebook.com"], [1_200, "edge-mqtt.facebook.com"], [6_000, ns], [8_000, ns.replace("5d33", "5066")], [11_000, "graph.instagram.com"],
  ]);
  assert.equal(shown(o, "instagram.com").length, 1);
  assert.equal(shown(o, "facebook.com").length, 0);
});

test("geen vals Instagram: echt Facebook (chat, lookaside, eigen foto-servers) blijft Facebook, ook met Instagram ervoor", async () => {
  const ns = "11111111-2222-3333-4444-555555555555-netseer-ipaddr-assoc.xz.fbcdn.net";
  const o = await overview([
    [0, "instagram.c10r.instagram.com"], // Instagram op de achtergrond, 4 min eerder
    [240_000, "lookaside.facebook.com"], [240_300, "chat-e2ee.facebook.com"], [240_500, "external-ams2-1.xx.fbcdn.net"],
    [240_600, "static-ams2-1.xx.fbcdn.net"], [243_000, ns], [250_000, "scontent-ams2-1.xx.fbcdn.net"], [260_000, ns.replace("1111", "9999")],
  ]);
  assert.equal(shown(o, "facebook.com").length, 1);
  assert.equal(shown(o, "instagram.com").length, 0);
});

test("Instagram gestart (www.instagram.com) zonder foto's: tonen als onzeker; alleen achtergrondverkeer niet", async () => {
  const o = await overview([
    [0, "www.instagram.com"], [300, "i.instagram.com"], [400, "gateway.instagram.com"], [500, "test-gateway.instagram.com"], [11_000, "graph.instagram.com"],
    [3_600_000, "i.instagram.com"], [3_600_300, "gateway.instagram.com"], [3_600_400, "test-gateway.instagram.com"], [3_610_000, "graph.instagram.com"],
  ]);
  const ig = shown(o, "instagram.com") as { uz?: 1; ao?: 1 }[];
  assert.equal(ig.length, 1);
  assert.equal(ig[0].uz, 1);
  assert.equal(ig[0].ao, 1);
});

test("Waze: Firebase-meldingen tijdens de rit horen bij Waze; na een spel of zonder app ervoor niet", async () => {
  const min = 60_000;
  const fb = "firebaselogging-pa.googleapis.com";
  const pings = (from: number, n: number, dev = "P1"): R[] => Array.from({ length: n }, (_, i) => [from + i * 1.5 * min, fb, dev, "blocked"] as R);
  const o = await overview([
    [0, "cresg.waze.com"], [300, "rt-xlb-row.waze.com"], [600, "dexter.waze.com"], [2 * min, "renderer-row.waze.com"], ...pings(3.5 * min, 12),
    // iPad: spel, daarna een andere app met dezelfde melding
    [0, "analytics.tocaboca.com", "P7"], [400, "lifeserver.tocaboca.com", "P7"], ...pings(3 * min, 12, "P7"),
  ]);
  const waze = o.groups.filter((g) => g.site === "waze.com").flatMap((g) => g.ss);
  assert.equal(waze.length, 1);
  assert.ok(waze[0].e - waze[0].s >= 19 * min);
  const toca = o.groups.filter((g) => g.site === "tocaboca.com" && g.dev === "P7").flatMap((g) => g.ss);
  assert.ok(toca.every((x) => x.e - x.s < 2 * min));
});

test("regel zonder geldige tijd (half overgekomen) telt niet mee: geen 'Datum onbekend'", async () => {
  const head = "timestamp\tdomain\tstatus\treasons\tdestination_country\tclient_ip\tdevice_id\tdevice_name\tdevice_model";
  const tsv = [head, `${at(0)}\twww.nu.nl\t\t\t\t10.0.0.1\tP1\tiPhone\t`, "7T20:09:12.123Z\tgraph.facebook.com\t\t\t\t10.0.0.1\tP1\tiPhone\t"].join("\n");
  const res = { ok: true, status: 200, text: async () => tsv, json: async () => ({}) };
  const r = await buildOverview({ logs: async () => res, download: async () => res }, { todayOnly: false });
  const b = r.body as { groups: { d: string; site: string }[] };
  assert.equal(b.groups.some((g) => g.d === "onbekend"), false);
});

test("Facebook-pixel op een website is geen Facebook-gebruik; een website vanuit de Facebook-app laat het Facebook-gebruik staan", async () => {
  const pixel = (t: number, dev: string): R[] => [[t, "connect.facebook.net", dev], [t + 100, "scontent.xx.fbcdn.net", dev], [t + 200, "scontent.fallback.xx.fbcdn.net", dev], [t + 300, "star-mini.c10r.facebook.com", dev], [t + 2_000, "static.xx.fbcdn.net", dev]];
  const ns = "11111111-2222-3333-4444-555555555555-netseer-ipaddr-assoc.xy.fbcdn.net";
  const o = await overview([
    [0, "www.voorbeeldwinkel.nl", "P8"], [300, "cdn.voorbeeldwinkel.nl", "P8"], ...pixel(1_000, "P8"),
    // P9: eerst de Facebook-app (netwerkmeting, chat), daarna vanuit Facebook een website met dezelfde pixel
    [0, ns, "P9"], [200, "scontent.xx.fbcdn.net", "P9"], [500, "chat-e2ee.c10r.facebook.com", "P9"], [27_000, "www.voorbeeldwinkel.nl", "P9"], ...pixel(27_500, "P9"),
  ]);
  const lab = (o as unknown as { deviceMap: Record<string, string> }).deviceMap;
  const fb = (id: string) => o.groups.filter((g) => g.site === "facebook.com" && g.dev === lab[id]).flatMap((g) => g.ss).filter((x) => isHuman(x as never)).length;
  assert.equal(fb("P8"), 0);
  assert.equal(fb("P9"), 1);
});

test("eufy (altijd tonen) alleen als de app echt opengaat: start-adressen wel, website-logo of pushverkeer niet", async () => {
  const o = await overview([
    [0, "app.eufy.com"], [300, "app-passport-eu-pr.eufy.com"], [600, "app-house-eu-pr.eufy.com"], [5_000, "mall-web-eu.eufy.com"],
    [3_600_000, "www.eufy.com"], [3_600_400, "www.digid.nl"], // wachtwoordenlijst haalt logo's op
    [7_200_000, "app-openapi-eu-pr.eufy.com"],
  ]);
  const ss = o.groups.filter((g) => g.site === "eufy.com").flatMap((g) => g.ss) as { s: number; op?: 1 }[];
  const at = (ms: number) => ss.find((x) => Math.abs(x.s - (Date.parse("2026-09-01T10:52:38Z") + ms)) < 2_000);
  assert.equal(at(0)?.op, 1);
  assert.notEqual(at(3_600_000)?.op, 1);
  assert.notEqual(at(7_200_000)?.op, 1);
});

test("Meditopia die alleen even start (paar seconden) staat er als onzeker; één losse opvraging helemaal niet", async () => {
  const o = await overview([
    [0, "updates.meditopia.com"], [300, "api.meditopia.com"], [5_000, "media.meditopia.com"],
    [3_600_000, "images.meditationapp.co"],
  ]);
  const shownMed = shown(o, "meditopia.com") as { uz?: 1 }[];
  assert.equal(shownMed.length, 1);
  assert.equal(shownMed[0].uz, 1);
});

test("WhatsApp: opnieuw de kale naam vlak na een geopende sessie verlengt die; een bericht zonder kale naam maakt geen rij", async () => {
  const min = 60_000;
  const o = await overview([
    [0, "whatsapp.com"], [100, "g.whatsapp.net"], [300, "static.whatsapp.net"], [600, "graph.whatsapp.com"], [2_000, "api.whatsapp.net"],
    [100_000, "chat.cdn.whatsapp.net"], [100_300, "whatsapp.com"], [100_600, "mmx-ds.cdn.whatsapp.net"],
    // een uur later: alleen chatverbinding + media, zonder kale naam (binnenkomend bericht): geen eigen rij
    [60 * min, "chat.cdn.whatsapp.net"], [60 * min + 2_000, "mmx-ds.cdn.whatsapp.net"],
  ]);
  const ss = shown(o, "whatsapp.com").sort((a, b) => a.s - b.s);
  assert.equal(ss.length, 1);
  assert.ok(ss[0].e - ss[0].s >= 99_000);
});

test("spel dat volledig opstart (3+ eigen adressen in één moment) is geopend, ook zonder verkeer daarna; 1 of 2 adressen niet", async () => {
  const min = 60_000;
  const rows: R[] = [[0, "apps.tutotoons.com", "P4"], [300, "tutoclub.tutotoons.com", "P4"], [600, "tutopulse.tutotoons.com", "P4"]];
  rows.push([120 * min, "h-kafka-rest.tutotoons.com", "P4"], [120 * min + 400, "tutopulse.tutotoons.com", "P4"]); // alleen 2: geen opstart
  rows.push([240 * min, "h-kafka-rest.tutotoons.com", "P4"]); // los meetbericht
  const o = await overview(rows);
  const tuto = o.groups.filter((g) => g.site === "tutotoons.com").flatMap((g) => g.ss);
  const human = tuto.filter((x) => isHuman(x));
  assert.equal(human.length, 1);
  assert.equal(human[0].s, T0);
  assert.equal((human[0] as { gs?: 1 }).gs, 1);
});

test("Shopify-winkel met één eigen adres tijdens scrollen in Instagram: echt geladen (cdn.shopify.com), niet onzeker; zonder winkel-onderdelen wel onzeker", async () => {
  const rows: R[] = [];
  for (const s of [0, 20, 40, 60, 80]) rows.push([s * 1000, "scontent-ams2-1.cdninstagram.com", "P1"], [s * 1000 + 300, "i.instagram.com", "P1"]);
  rows.push([30_000, "winkelvoorbeeld.nl", "P1"], [30_700, "cdn.shopify.com", "P1"], [30_800, "shop.app", "P1"], [31_000, "cdn.judge.me", "P1"]);
  rows.push([70_000, "anderewinkel.nl", "P1"]); // alleen de naam: kan een aangeklopte advertentie zijn
  const o = await overview(rows);
  const shop = o.groups.find((g) => g.site === "winkelvoorbeeld.nl")!.ss[0] as { s: number; e: number; uz?: 1 };
  assert.ok(isHuman(shop) && !shop.uz, "winkel echt geladen");
  assert.ok(!o.groups.some((g) => (g.site === "shop.app" || g.site === "judge.me") && !(g as { bg?: boolean }).bg && g.ss.some((x) => isHuman(x))), "onderdelen geen eigen rij");
  const other = o.groups.find((g) => g.site === "anderewinkel.nl")!.ss[0] as { s: number; e: number; uz?: 1 };
  assert.equal(other.uz, 1);
});

test("Amazon-verkeer op een tv hoort bij Prime Video (één rij); op een telefoon blijft Amazon Amazon", async () => {
  const min = 60_000;
  const rows: R[] = [];
  for (let m = 0; m <= 60; m += 2) rows.push([m * min, "api.amazon.com", "TV1"], [m * min + 300, "abc.zaz.api.amazonvideo.com", "TV1"]);
  rows.push([1 * min, "x.ta.vod-hls.main.amazon.pv-cdn.net", "TV1"], [30 * min, "y.ta.vod-hls.main.amazon.pv-cdn.net", "TV1"]);
  rows.push([0, "minerva.devices.a2z.com", "P1"], [400, "api.amazon.com", "P1"], [5 * min, "minerva.devices.a2z.com", "P1"]);
  const o = await overview(rows);
  assert.ok(!o.groups.some((g) => g.dev === "Apple TV" && g.site === "amazon.com"), "geen aparte Amazon-rij op de tv");
  const pv = o.groups.find((g) => g.dev === "Apple TV" && g.site === "primevideo.com")!;
  assert.ok(pv.ss.some((x) => x.e - x.s >= 55 * min), "Prime Video als één geheel");
  assert.ok(o.groups.some((g) => g.dev === "iPhone" && g.site === "amazon.com"), "op de telefoon blijft het Amazon");
});

test("inlog-adres dat bij elke pagina meelaadt, in een vaak herladen tabblad, is geen inloggen; één keer inloggen wel", async () => {
  const min = 60_000;
  const rows: R[] = [];
  for (const m of [0, 40, 80, 120, 160, 200]) rows.push([m * min, "www.receptensite.nl", "P1"], [m * min + 80, "mijn.receptensite.nl", "P1"]);
  rows.push([300 * min, "mijn.bankvoorbeeld.nl", "P1"]);
  const o = await overview(rows);
  const rec = o.groups.find((g) => g.site === "receptensite.nl")!;
  assert.ok(!rec.ss.some((x) => isHuman(x)), "herladen tabblad met mijn.: geen bezoek");
  const bank = o.groups.find((g) => g.site === "bankvoorbeeld.nl")!;
  assert.ok(bank.ss.some((x) => isHuman(x)), "één keer inloggen telt wel");
});

test("klik in een nieuwsbrief via het eigen klik-adres van de winkel telt, ook als een ander tabblad tegelijk herlaadt; Mail die veel nieuwsbrieven opent niet", async () => {
  const s = 1000;
  const rows: R[] = [[0, "url861.winkelmail.nl", "P1"], [1 * s, "sendgrid.net", "P1"], [28 * s, "www.winkelmail.nl", "P1"], [32 * s, "sgtm.winkelmail.nl", "P1"]];
  rows.push([28 * s, "www.ander-tabblad.nl", "P1"]); // Safari herlaadt toevallig tegelijk een ander tabblad
  const T = 3_600_000; // later: Mail opent veel nieuwsbrieven tegelijk
  for (const h of ["click.mail.supermarkt.nl", "image.mail.supermarkt.nl", "email.merk1.nl", "email.merk2.nl", "res.mail.merk3.nl", "t.mail.merk4.nl"]) rows.push([T, h, "P1"]);
  rows.push([T + 50, "www.supermarkt.nl", "P1"], [T + 60, "www.drogist.nl", "P1"], [T + 70, "www.warenhuis.nl", "P1"]); // mail laadt pagina's van meerdere winkels voor
  const o = await overview(rows);
  const shop = o.groups.find((g) => g.site === "winkelmail.nl")!.ss[0] as { s: number; e: number; ck?: 1 };
  assert.ok(isHuman(shop as never) && shop.ck === 1, "geklikt");
  const sm = o.groups.find((g) => g.site === "supermarkt.nl")!.ss[0];
  assert.ok(!isHuman(sm as never), "mail geopend, niet geklikt");
});

test("Buienradar even openen (volledige opstart in één moment) is gebruik; één los adres niet", async () => {
  const rows: R[] = [];
  for (const [i, h] of ["location", "graphdata", "image-lite", "data", "userapi", "forecast", "tiles"].entries()) rows.push([i * 120, h + ".buienradar.nl", "P1"]);
  rows.push([3_600_000, "observations.buienradar.nl", "P1"]);
  const o = await overview(rows);
  const br = o.groups.find((g) => g.site === "buienradar.nl")!;
  const human = br.ss.filter((x) => isHuman(x as never));
  assert.equal(human.length, 1);
  assert.ok(human[0].s < T0 + 1000);
});
