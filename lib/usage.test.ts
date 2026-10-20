import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMinutes } from "./usage.ts";

test("actieve minuten: twee apps tegelijk op één apparaat tellen niet dubbel, losse stukken wel", () => {
  const M = 60_000;
  assert.equal(activeMinutes([{ s: 0, e: 10 * M }, { s: 5 * M, e: 12 * M }]), 12);
  assert.equal(activeMinutes([{ s: 0, e: 10 * M }, { s: 20 * M, e: 25 * M }]), 15);
  assert.equal(activeMinutes([]), 0);
});
