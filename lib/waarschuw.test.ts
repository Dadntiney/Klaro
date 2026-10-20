import { test } from "node:test";
import assert from "node:assert/strict";
import { findAlerts, flagOf, screenTime, silentAlerts, weeklyAlert, type DevStat } from "../scripts/waarschuw.ts";

test("waarschuwen: 18+, dating, VPN en door NextDNS geblokkeerde porno worden gemeld", () => {
  assert.equal(flagOf("www.pornhub.com", "", ""), "18+");
  assert.equal(flagOf("tinder.com", "", ""), "Dating");
  assert.equal(flagOf("nordvpn.com", "", ""), "VPN/proxy");
  assert.equal(flagOf("onbekend-voorbeeld.nl", "blocked", "parental-control:porn"), "Geblokkeerd 18+/dating");
});

test("waarschuwen: geen vals alarm bij gewone sites, advertenties, nieuwsbrieven en de VPN-controle van Vinted", () => {
  for (const h of ["www.google.com", "www.youtube.com", "us.list-manage.com", "www.vkmag.com", "www.essex.nl", "www.sussex.ac.uk", "k8s-sdkvpnde-sdkvpnde-c633b417a4-2e9163e3b57e1aac.elb.us-east-1.amazonaws.com"]) assert.equal(flagOf(h, "", ""), undefined, h);
  assert.equal(flagOf("ads.voorbeeld.nl", "blocked", "blocklist:nextdns-recommended"), undefined);
});

test("waarschuwen: één melding per apparaat en site, met het soort apparaat (geen naam) en de eerste tijd", () => {
  const cols = ["timestamp", "domain", "status", "reasons", "destination_country", "client_ip", "device_id", "device_name", "device_model"];
  const row = (t: string, h: string, id = "A1", name = "Iemands iPhone") => [t, h, "", "", "", "", id, name, ""].join("\t");
  const a = findAlerts(cols, [row("2026-10-20T08:00:05.000Z", "cdn.pornhub.com"), row("2026-10-20T08:00:01.000Z", "www.pornhub.com"), row("2026-10-20T08:01:00.000Z", "www.google.com"), row("2026-10-20T08:02:00.000Z", "www.pornhub.com", "B2", "Iemands iPad")]);
  assert.equal(a.length, 2);
  assert.equal(a[0].key, "A1|pornhub.com");
  assert.equal(a[0].title, "Klaro: 18+");
  assert.match(a[0].body, /^pornhub\.com op iPhone, 10:00$/);
  assert.ok(!a.some((x) => /Iemands/.test(x.body)), "nooit de naam van het apparaat");
  assert.match(a[1].body, /op iPad/);
});

const H = 3_600_000, DAY = 24 * H;
const NOW = Date.parse("2026-10-20T12:00:00Z");
const dev = (o: Partial<DevStat>): DevStat => ({ id: "A1", first: NOW - 14 * DAY, last: NOW - 10 * 60_000, maxGap: 0.5 * H, days7: 7, name: "Iemands iPhone", model: "", ...o });

test("apparaat stil: iPhone die normaal nooit langer dan een half uur stil is, na 4 uur wel; na 2 uur nog niet", () => {
  const a = silentAlerts([dev({ last: NOW - 4 * H })], NOW);
  assert.equal(a.length, 1);
  assert.equal(a[0].key, "stil|A1");
  assert.match(a[0].body, /^iPhone is al 4 uur stil \(normaal hooguit 1 uur\)/);
  assert.equal(silentAlerts([dev({ last: NOW - 2 * H })], NOW).length, 0);
});

test("apparaat stil: geen vals alarm bij een iPad die vaker lang stil is, een MacBook die vaak uit staat, of te weinig geschiedenis", () => {
  assert.equal(silentAlerts([dev({ name: "iPad", last: NOW - 13 * H, maxGap: 12 * H })], NOW).length, 0); // 's nachts uit: normaal
  assert.equal(silentAlerts([dev({ name: "iPad", last: NOW - 25 * H, maxGap: 12 * H })], NOW).length, 1); // langer dan ooit: wel
  assert.equal(silentAlerts([dev({ name: "MacBook", last: NOW - 5 * DAY, maxGap: 4 * DAY, days7: 2 })], NOW).length, 0);
  assert.equal(silentAlerts([dev({ first: NOW - 3 * DAY, last: NOW - 5 * H })], NOW).length, 0);
});

test("weekbericht alleen op zondagavond, met aantallen en apparaten (soort, geen naam)", () => {
  const sun = Date.parse("2026-10-25T18:30:00Z"); // zondag 19:30 in Nederland
  const devs = [dev({ last: sun - 60_000 }), dev({ id: "B2", name: "Iemands iPad", last: sun - 3 * DAY })];
  const w = weeklyAlert(devs, sun, 0)!;
  assert.equal(w.key, "week|2026-10-25");
  assert.match(w.body, /^Geen waarschuwingen deze week\. Actief: iPhone\. Al langer stil: iPad \(3 dagen\)\. Waarschuwen werkt\.$/);
  assert.equal(weeklyAlert(devs, sun - 3 * H, 0), undefined); // zondagmiddag
  assert.equal(weeklyAlert(devs, Date.parse("2026-10-24T18:30:00Z"), 0), undefined); // zaterdag
  assert.match(weeklyAlert(devs, sun, 2)!.body, /^2 waarschuwingen/);
});

test("weekbericht met schermtijd: per apparaat gemiddeld per dag, in plaats van alleen 'actief'", () => {
  const sun = Date.parse("2026-10-25T18:30:00Z");
  const w = weeklyAlert([dev({ last: sun - 60_000 })], sun, 0, "iPhone 1u 5m (vooral YouTube)")!;
  assert.match(w.body, /^Geen waarschuwingen deze week\. Schermtijd per dag: iPhone 1u 5m \(vooral YouTube\)\. Waarschuwen werkt\.$/);
});

const week = (rows: [number, string][]) => {
  const head = "timestamp\tdomain\tstatus\treasons\tdestination_country\tclient_ip\tdevice_id\tdevice_name\tdevice_model";
  const T = Date.parse("2026-10-25T10:00:00Z");
  return { now: T + 3 * H, tsv: [head, ...rows.map(([t, h]) => [new Date(T + t).toISOString(), h, "", "", "", "10.0.0.1", "P1", "iPhone", ""].join("\t")).reverse()].join("\n") };
};

test("schermtijd: 35 minuten YouTube in een week is 5 minuten per dag (zelfde telling als de pagina)", async () => {
  const rows: [number, string][] = [];
  for (let t = 0; t <= 35 * 60_000; t += 20_000) rows.push([t, t % 60_000 ? "i.ytimg.com" : "www.youtube.com"]);
  const { tsv, now } = week(rows);
  assert.equal(await screenTime(tsv, now), "iPhone 5m (vooral YouTube)");
});

test("schermtijd: alleen achtergrondverkeer telt niet mee", async () => {
  const rows: [number, string][] = [];
  for (let t = 0; t <= 60 * 60_000; t += 60_000) rows.push([t, "gateway.icloud.com"]);
  const { tsv, now } = week(rows);
  assert.equal(await screenTime(tsv, now), "");
});
