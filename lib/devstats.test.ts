import { test } from "node:test";
import assert from "node:assert/strict";
import { gapP95, isSilent } from "./devstats.ts";

const H = 3_600_000;

test("gapP95 en isSilent", () => {
  // elke 2 min een verzoek, overdag, met een enkele pauze van 20 min
  const times: number[] = [];
  let t = 1_700_000_000_000;
  for (let i = 0; i < 200; i++) { t += (i % 40 === 0 ? 20 : 2) * 60_000; times.push(t); }
  const p = gapP95(times, () => 12);
  assert.ok(p <= 20 * 60_000 && p >= 2 * 60_000);
  assert.equal(isSilent(t + 3 * H, t, p, 14, 5).silent, true);
  assert.equal(isSilent(t + 30 * 60_000, t, p, 14, 5).silent, false);
  assert.equal(isSilent(t + 3 * H, t, p, 3, 5).silent, false); // 's nachts niet
  assert.equal(isSilent(t + 3 * H, t, p, 14, 1).silent, false); // te weinig geschiedenis
});
