import { test } from "node:test";
import assert from "node:assert/strict";
import { hasNewRow, rowCounts } from "./sound.ts";

const now = 1_800_000_000_000;
const row = (site: string, e: number) => ({ g: { dev: "iPhone", site }, ss: [{ s: e - 60_000, e }] });

test("geluid bij een nieuwe regel (nieuwe app of nieuw bezoek), niet bij meer verkeer in een bestaande regel", () => {
  const before = [row("whatsapp.com", now - 600_000)];
  const prev = rowCounts(before);
  // Bestaande regel krijgt nieuwe opvragingen: geen geluid.
  assert.equal(hasNewRow(prev, [row("whatsapp.com", now)], now), false);
  // Nieuwe app: geluid.
  assert.equal(hasNewRow(prev, [row("youtube.com", now), ...before], now), true);
  // Nieuw bezoek aan dezelfde app (tweede regel): geluid.
  assert.equal(hasNewRow(prev, [row("whatsapp.com", now), ...before], now), true);
});

test("geen geluid voor een regel die pas later verschijnt maar over iets van eerder gaat", () => {
  const prev = rowCounts([]);
  assert.equal(hasNewRow(prev, [row("nu.nl", now - 20 * 60_000)], now), false);
});
