import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorOf, chainTimes, companionFor } from "./companion.ts";

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
