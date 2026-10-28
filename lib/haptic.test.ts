import { test } from "node:test";
import assert from "node:assert/strict";
import { haptic, startHaptics, HAPTIC_TARGETS } from "./haptic.ts";

test("haptische tik: zonder browser gebeurt er niets (geen fout)", () => {
  assert.doesNotThrow(() => haptic());
  const stop = startHaptics();
  assert.doesNotThrow(() => stop());
  for (const s of ["button", ".chip", ".item.clickable", "summary"]) assert.ok(HAPTIC_TARGETS.includes(s), s);
});
