import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorOf, assignGameSdk, chainTimes, companionFor } from "./companion.ts";

const m = (x: number) => 1_800_000_000_000 + x * 60_000;

test("Minecraft: meetgegevens tellen als spelen zolang ze aansluiten op het spel", () => {
  // Spel start (16:42), daarna 90 minuten elke 20 s meetgegevens, dan stopt het spel.
  const tele = Array.from({ length: 270 }, (_, i) => m(1) + i * 20_000);
  const got = chainTimes([m(0)], tele, 300_000, 60_000);
  assert.equal(got.size, tele.length);
});

test("geen vals alarm: meetgegevens van Edge/Office zonder spel, of na een pauze van meer dan 5 minuten, tellen niet", () => {
  assert.equal(chainTimes([], [m(10), m(11), m(12)], 300_000, 60_000).size, 0);
  const got = chainTimes([m(0)], [m(2), m(4), m(20), m(21)], 300_000, 60_000);
  assert.deepEqual([...got], [m(2), m(4)]);
});

test("Xbox-aanmelding vlak vóór het spel hoort bij het opstarten", () => {
  const got = chainTimes([m(1)], [m(1) - 20_000], 300_000, 60_000);
  assert.equal(got.size, 1);
  assert.equal(chainTimes([m(10)], [m(1)], 300_000, 60_000).size, 0);
});

test("herkenning: spel-adressen en algemene adressen", () => {
  assert.equal(anchorOf("signal-northeurope.franchise.minecraft-services.net")?.app, "minecraft.net");
  assert.equal(anchorOf("play.galaxite.net")?.app, "minecraft.net");
  assert.equal(anchorOf("www.minecraft.net"), undefined); // de website is geen spel
  assert.equal(companionFor("onedscolprdeus16.eastus.cloudapp.azure.com")?.app, "minecraft.net");
  assert.equal(companionFor("self.events.data.microsoft.com")?.app, "minecraft.net");
  assert.equal(companionFor("www.microsoft.com"), undefined);
  assert.equal(companionFor("portal.azure.com"), undefined);
});

test("loadedWith: alleen sites die elke keer (3 keer, 2 dagen) na hetzelfde hulpadres komen", async () => {
  const { loadedWith } = await import("./companion.ts");
  const day = 86_400_000;
  const ev = [0, 1, 2].flatMap((d) => [
    { t: d * day, dev: "A", host: "publish.bouwer.nl", site: "bouwer.nl", helper: true },
    { t: d * day + 200, dev: "A", host: "script.github.io", site: "script.github.io", page: true },
    { t: d * day + 500, dev: "A", host: "www.eigen.nl", site: "eigen.nl", page: true }, // laadt het hulpadres niet: ander apparaat ook niet
  ]);
  ev.push({ t: 5 * day, dev: "A", host: "www.eigen.nl", site: "eigen.nl", page: true });
  assert.deepEqual([...loadedWith(ev)], ["script.github.io"]);
  assert.equal(loadedWith(ev.filter((e) => e.t < 2 * day)).size, 0); // maar 2 keer: te weinig bewijs
});

test("gedeelde Meta-adressen: bij Instagram als het dichtstbijzijnde eigen adres van Instagram is, anders Facebook", async () => {
  const { instagramShared } = await import("./companion.ts");
  const ev = [
    { t: 0, dev: "A", host: "i.instagram.com" }, { t: 1_000, dev: "A", host: "graph.facebook.com" }, { t: 2_000, dev: "A", host: "dgw-ig.c10r.facebook.com" },
    { t: 1_000_000, dev: "A", host: "lookaside.facebook.com" }, { t: 1_010_000, dev: "A", host: "graph.facebook.com" },
    { t: 1_000, dev: "B", host: "graph.facebook.com" }, // ander apparaat: geen Instagram in de buurt
    { t: 5_000_000, dev: "A", host: "graph.facebook.com" }, // niets in de buurt: blijft Facebook
  ];
  const s = instagramShared(ev);
  assert.ok(s.has("A|1000|graph.facebook.com"));
  assert.ok(s.has("A|2000|dgw-ig.c10r.facebook.com"));
  assert.ok(!s.has("A|1010000|graph.facebook.com"));
  assert.ok(!s.has("B|1000|graph.facebook.com"));
  assert.ok(!s.has("A|5000000|graph.facebook.com"));
});

test("spel-motor in hetzelfde moment vlak vóór de start van een spel hoort bij dat spel; eerder of bij een andere app niet", () => {
  const ev = [{ t: m(0) - 400, sdk: true }, { t: m(0), game: "spel.net" }, { t: m(5), sdk: true }];
  const got = assignGameSdk(ev, 600_000);
  assert.equal(got.get(m(0) - 400), "spel.net");
  assert.equal(got.get(m(5)), "spel.net");
  // Ruim vóór de start (10 s): hoort er niet bij.
  assert.equal(assignGameSdk([{ t: m(0) - 10_000, sdk: true }, { t: m(0), game: "spel.net" }], 600_000).size, 0);
});
