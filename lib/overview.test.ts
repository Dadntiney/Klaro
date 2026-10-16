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
