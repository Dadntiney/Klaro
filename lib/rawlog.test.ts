import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRaw, queryRaw, rawEvents } from "./rawlog.ts";

const head = "timestamp\tdomain\tstatus\treasons\tdestination_country\tclient_ip\tdevice_id\tdevice_name\tdevice_model";
const line = (iso: string, host: string, dev: string, status = "") => [iso, host, status, status ? "blocklist:test" : "", "", "10.0.0.1", dev, dev === "D1" ? "Telefoon" : "Xyzzy MacBook", ""].join("\t");
const tsv = [
  head,
  line("2026-10-01T10:00:00.000Z", "www.voorbeeld.nl", "D1"),
  line("2026-10-02T10:00:00.000Z", "api.whatsapp.net", "D1"),
  line("2026-10-03T10:00:00.000Z", "tracker.reclame.com", "D2", "blocked"),
  line("2026-10-04T10:00:00.000Z", "static.whatsapp.net", "D2"),
].join("\n");

test("NextDNS-weergave: alle regels uit de download, nieuwste eerst, zoeken in alle dagen", () => {
  const rows = parseRaw(tsv);
  assert.deepEqual(rows.map((r) => r.host), ["static.whatsapp.net", "tracker.reclame.com", "api.whatsapp.net", "www.voorbeeld.nl"]);
  assert.deepEqual(queryRaw(rows, { q: "WhatsApp" }).hits.map((r) => r.host), ["static.whatsapp.net", "api.whatsapp.net"]);
  assert.deepEqual(queryRaw(rows, { devIds: ["D1"] }).hits.map((r) => r.host), ["api.whatsapp.net", "www.voorbeeld.nl"]);
  assert.equal(queryRaw(rows, { q: "bestaat-niet" }).hits.length, 0);
});

test("NextDNS-weergave: verder terugbladeren en naar een moment springen", () => {
  const rows = parseRaw(tsv);
  const p1 = queryRaw(rows, { limit: 2 });
  assert.equal(p1.more, true);
  const p2 = queryRaw(rows, { limit: 2, before: p1.hits[1].t });
  assert.deepEqual(p2.hits.map((r) => r.host), ["api.whatsapp.net", "www.voorbeeld.nl"]);
  assert.equal(p2.more, false);
  assert.deepEqual(queryRaw(rows, { before: Date.parse("2026-10-02T12:00:00Z") }).hits.map((r) => r.host), ["api.whatsapp.net", "www.voorbeeld.nl"]);
});

test("NextDNS-weergave: regels zoals live (geblokkeerd, icoon), zonder de echte apparaatnaam", async () => {
  const { events } = await rawEvents(parseRaw(tsv), { q: "reclame" });
  assert.equal(events.length, 1);
  assert.equal(events[0].blocked, true);
  assert.equal(events[0].devId, "D2");
  assert.ok(!JSON.stringify(events).includes("Xyzzy"));
});
