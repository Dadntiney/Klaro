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
