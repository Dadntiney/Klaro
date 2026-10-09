import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRows } from "./merge.ts";

test("dezelfde site direct na elkaar wordt samengevoegd, een andere ertussen niet", () => {
  const fb = { n: "fb" };
  const lidl = { n: "lidl" };
  const mk = (g: object, s: number) => ({ g, t: s, ss: [{ s, e: s + 60_000 }], first: false, newest: false });
  const out = mergeRows([mk(fb, 300), mk(fb, 200), mk(fb, 100), mk(lidl, 90), mk(fb, 80)]);
  assert.equal(out.length, 3);
  assert.equal(out[0].t, 300); // tijd van het laatste bezoek
  assert.equal(out[0].ss.length, 3);
  assert.equal(out[1].ss.length, 1);
  assert.equal(out[2].ss.length, 1);
});
