import { test } from "node:test";
import assert from "node:assert/strict";
import { findAlerts, flagOf } from "../scripts/waarschuw.ts";

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
