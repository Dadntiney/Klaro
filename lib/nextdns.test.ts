import { test } from "node:test";
import assert from "node:assert/strict";
import { amsterdamMidnight, nextdnsError, windowStart } from "./nextdns.ts";
import { netKey } from "./network.ts";
import { sameText } from "./auth.ts";
import { anonId } from "./names.ts";

test("begin van de dag klopt ook op de dagen dat de klok verzet wordt", () => {
  // Gewone zomerdag: middernacht = 22:00 UTC de dag ervoor.
  assert.equal(new Date(amsterdamMidnight(Date.parse("2026-10-11T08:00:00Z"))).toISOString(), "2026-10-10T22:00:00.000Z");
  // Wintertijd: middernacht = 23:00 UTC.
  assert.equal(new Date(amsterdamMidnight(Date.parse("2026-12-01T12:00:00Z"))).toISOString(), "2026-11-30T23:00:00.000Z");
  // Klok terug (25 okt 2026): de dag begon nog in zomertijd, om 22:00 UTC.
  assert.equal(new Date(amsterdamMidnight(Date.parse("2026-10-25T09:00:00Z"))).toISOString(), "2026-10-24T22:00:00.000Z");
  // Klok vooruit (29 mrt 2026): de dag begon nog in wintertijd, om 23:00 UTC.
  assert.equal(new Date(amsterdamMidnight(Date.parse("2026-03-29T09:00:00Z"))).toISOString(), "2026-03-28T23:00:00.000Z");
  // Net na middernacht en net ervoor.
  assert.equal(new Date(amsterdamMidnight(Date.parse("2026-10-10T22:00:30Z"))).toISOString(), "2026-10-10T22:00:00.000Z");
  assert.equal(new Date(amsterdamMidnight(Date.parse("2026-10-10T21:59:30Z"))).toISOString(), "2026-10-09T22:00:00.000Z");
  // Laatste stuk van de dag: nooit vóór middernacht.
  const now = Date.parse("2026-10-10T22:30:00Z");
  assert.equal(windowStart(1.5, now), amsterdamMidnight(now));
  assert.equal(windowStart(0.25, now), now - 900_000);
});

test("foutmeldingen van NextDNS in gewone taal, zonder ruwe tekst", () => {
  assert.match(nextdnsError(429), /te veel verzoeken/);
  assert.match(nextdnsError(401), /API-sleutel/);
  assert.doesNotMatch(nextdnsError(500, "geheime details"), /geheime/);
});

test("thuisnetwerk (IPv6): verkort en voluit geschreven adressen geven hetzelfde netwerk", () => {
  assert.equal(netKey("2a02:a46::1c2b:3d4e:5f60:7a8b"), "2a02:a46:0:0");
  assert.equal(netKey("2a02:a46:0:0:aaaa:bbbb:cccc:dddd"), "2a02:a46:0:0");
  assert.equal(netKey("2a02:a46:12:3400::1"), netKey("2a02:a46:0012:3400:9:8:7:6"));
  assert.equal(netKey("84.1.2.3"), "84.1.2.3");
});

test("wachtwoord vergelijken", () => {
  assert.ok(sameText("geheim123", "geheim123"));
  assert.ok(!sameText("geheim12", "geheim123"));
  assert.ok(!sameText("geheim1234", "geheim123"));
  assert.ok(!sameText("", "x"));
});

test("apparaat zonder id: vaste anonieme sleutel, nooit de naam zelf", () => {
  assert.equal(anonId("iPhone van Jan"), anonId("iPhone van Jan"));
  assert.notEqual(anonId("iPhone van Jan"), anonId("iPhone van Piet"));
  assert.doesNotMatch(anonId("iPhone van Jan"), /Jan/);
});
