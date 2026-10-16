import { test } from "node:test";
import assert from "node:assert/strict";
import { activityReporter } from "./activity.ts";

function setup(visible = true) {
  let t = 0;
  const sent: { at: number; ago: number }[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const r = activityReporter({ now: () => t, visible: () => visible, send: (ago) => sent.push({ at: t, ago }), later: (fn, ms) => timers.push({ at: t + ms, fn }) });
  const advance = (to: number) => { t = to; for (const x of timers.splice(0).sort((a, b) => a.at - b.at)) if (x.at <= t) x.fn(); else timers.push(x); };
  return { r, sent, advance, set: (x: number) => (t = x) };
}

test("echt gebruik wordt gemeld; hooguit eens per minuut, en het laatste gebruik in die minuut komt achteraf met 'hoe lang geleden'", () => {
  const { r, sent, advance, set } = setup();
  r(true); // t=0
  set(10_000); r(true);
  set(50_000); r(true);
  assert.equal(sent.length, 1);
  advance(60_000);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], { at: 60_000, ago: 10 }); // gebruik was om 50 s: 10 s geleden
});

test("geen verlenging door nagemaakte gebeurtenissen of door een tabblad op de achtergrond", () => {
  const a = setup();
  a.r(false);
  assert.equal(a.sent.length, 0);
  const b = setup(false);
  b.r(true);
  assert.equal(b.sent.length, 0);
});
