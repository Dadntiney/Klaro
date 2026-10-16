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
    [1_800_000, "whatsapp.com"], [1_800_500, "api.whatsapp.net"], [1_801_000, "chat.cdn.whatsapp.net"],
  ]);
  assert.equal(shown(o, "whatsapp.com").length, 0);
});
