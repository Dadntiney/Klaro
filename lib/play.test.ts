import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPlayback, liveTvApp, nowWindow } from "./play.ts";

const m = (x: number) => 1_800_000_000_000 + x * 60_000;
const ZIGGO = "cws-lgi.conviva.com";
const DISNEY = "0123456789abcdef0123456789abcdef01234567.cws.conviva.com";

test("Ziggo GO: afspeelmeldingen tellen als kijken, ook als de app zelf 7 minuten niets opvraagt", () => {
  // App opent om 0 en vraagt elke 7 minuten iets op; Conviva meldt elke minuut, tot 30 (daarna stopt het kijken).
  const app = [0, 7, 14, 21].map((x) => ({ t: m(x), host: "spark-prod-nl.gnp.cloud.ziggogo.tv", site: "ziggogo.tv" }));
  const sig = Array.from({ length: 31 }, (_, i) => ({ t: m(i) + 2_000, host: ZIGGO }));
  const got = assignPlayback([...app, ...sig]);
  assert.equal(got.size, sig.length);
  assert.ok([...got.values()].every((s) => s === "ziggogo.tv"));
});

test("geen vals kijken: meldingen zonder tv-app, of na een pauze van meer dan 5 minuten, tellen niet", () => {
  assert.equal(assignPlayback([{ t: m(0), host: ZIGGO }, { t: m(1), host: ZIGGO }]).size, 0);
  const got = assignPlayback([{ t: m(0), host: "x.ziggogo.tv", site: "ziggogo.tv" }, { t: m(1), host: ZIGGO }, { t: m(20), host: ZIGGO }]);
  assert.deepEqual([...got.keys()], [m(1)]);
});

test("een andere app die tussendoor even aanklopt, neemt de meldingen van Disney+ niet over", () => {
  const ev = [
    { t: m(0), host: "disney.playback.edge.bamgrid.com", site: "disneyplus.com" },
    ...Array.from({ length: 20 }, (_, i) => ({ t: m(i + 1), host: DISNEY })),
    { t: m(8), host: "spark-prod-nl.gnp.cloud.ziggogo.tv", site: "ziggogo.tv" }, // Ziggo GO op de achtergrond
    { t: m(15), host: "disney.api.edge.bamgrid.com", site: "disneyplus.com" },
  ];
  const got = assignPlayback(ev);
  assert.equal(got.size, 20);
  assert.ok([...got.values()].every((s) => s === "disneyplus.com"));
});

test("live: een afspeelsignaal gaat naar de tv-app waarvan de reeks nog loopt", () => {
  const groups = [
    { d: "2026-10-16", dev: "Apple TV", site: "ziggogo.tv", lm: m(10) },
    { d: "2026-10-16", dev: "Apple TV", site: "netflix.com", lm: m(11) }, // geen tv-app met meldingen
    { d: "2026-10-16", dev: "iPad", site: "disneyplus.com", lm: m(11) },
  ];
  assert.equal(liveTvApp(groups, "2026-10-16", "Apple TV", m(12))?.site, "ziggogo.tv");
  assert.equal(liveTvApp(groups, "2026-10-16", "Apple TV", m(16)), undefined); // reeks al voorbij
  assert.equal(liveTvApp(groups, "2026-10-16", "MacBook", m(12)), undefined);
});

test("'nu' bij een rij: 5 minuten als er beeld/geluid speelt (zoals de chip), anders 3", () => {
  assert.equal(nowWindow(m(10), m(10)), 300_000);
  assert.equal(nowWindow(m(10), m(2)), 180_000);
  assert.equal(nowWindow(m(10)), 180_000);
});

test("chip en rij: dezelfde regel voor 'nu' (lang gebruik 6 min, Facebook-achtig of beeld/geluid 5 min, anders 3)", async () => {
  const { isNow } = await import("./play.ts");
  const x = { s: m(0), e: m(20), n: 30 };
  assert.equal(isNow(m(25), x, { site: "netflix.com" }), true); // lang gekeken: 6 minuten
  assert.equal(isNow(m(27), x, { site: "netflix.com" }), false);
  assert.equal(isNow(m(25), x, { site: "whatsapp.com" }), false); // berichten-app: open laten staan is geen lang gebruik
  const y = { s: m(0), e: m(2), n: 3, f: 2 };
  assert.equal(isNow(m(6), y, { site: "facebook.com" }), true);
  assert.equal(isNow(m(8), y, { site: "facebook.com" }), false);
  const z = { s: m(0), e: m(1), n: 2 };
  assert.equal(isNow(m(3.5), z, { site: "nu.nl" }), true);
  assert.equal(isNow(m(4.5), z, { site: "nu.nl" }), false);
  assert.equal(isNow(m(4.5), z, { site: "youtube.com", lm: m(1) }), true); // beeld/geluid van deze sessie: 5 minuten
});

test("tv: stukjes kijken met minder dan 15 minuten ertussen zijn één geheel, tenzij er tussendoor een andere app begon", async () => {
  const { tvStart } = await import("./play.ts");
  const pieces = [{ s: m(0), e: m(10) }, { s: m(20), e: m(30) }, { s: m(40), e: m(41) }];
  assert.equal(tvStart(pieces[2], pieces, []), m(0));
  assert.equal(tvStart(pieces[2], pieces, [m(35)]), m(40)); // andere app tussendoor: nieuw bezoek
  assert.equal(tvStart(pieces[2], [{ s: m(0), e: m(10) }, pieces[2]], []), m(40)); // 30 minuten ertussen
});
