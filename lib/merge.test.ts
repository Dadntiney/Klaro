import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRows } from "./merge.ts";

test("dezelfde site direct na elkaar wordt samengevoegd; met een andere ertussen en lang daarna niet", () => {
  const fb = { n: "fb" };
  const lidl = { n: "lidl" };
  const mk = (g: object, s: number) => ({ g, t: s, ss: [{ s, e: s + 60_000 }], first: false, newest: false });
  const out = mergeRows([mk(fb, 300), mk(fb, 200), mk(fb, 100), mk(lidl, 90), mk(fb, -3_600_000)]);
  assert.equal(out.length, 3);
  assert.equal(out[0].t, 100); // tijd van het eerste bezoek
  assert.equal(out[0].ss.length, 3);
  assert.equal(out[1].ss.length, 1);
  assert.equal(out[2].ss.length, 1);
});

test("dezelfde app binnen 15 minuten wordt één regel, ook met andere apps ertussen; langer ertussen niet", () => {
  const gpt = { n: "chatgpt" };
  const shop = { n: "shop" };
  const min = 60_000;
  const mk = (g: object, s: number, d = 60_000) => ({ g, t: s * min, ss: [{ s: s * min, e: s * min + d }], first: false, newest: false });
  // nieuwste eerst: ChatGPT 09:32, shop 09:31, ChatGPT 09:24, shop 09:24, ChatGPT 09:15, ChatGPT 08:30
  const out = mergeRows([mk(gpt, 572), mk(shop, 571), mk(gpt, 564), mk(shop, 564), mk(gpt, 555), mk(gpt, 510)]);
  const g = out.filter((r) => r.g === gpt);
  assert.equal(g.length, 2); // 09:15-09:33 samen, 08:30 los (45 min ertussen)
  assert.equal(g[0].t, 555 * min);
  assert.equal(g[0].ss.length, 3);
  assert.equal(out.filter((r) => r.g === shop).length, 1);
  assert.deepEqual(out.map((r) => r.t), [...out.map((r) => r.t)].sort((a, b) => b - a)); // nog steeds op tijd
});

test("hetzelfde spel twee keer met een uur ertussen: twee rijen, ook als ze direct onder elkaar staan", () => {
  const toca = { n: "toca" };
  const min = 60_000;
  const mk = (s: number, e: number) => ({ g: toca, t: s * min, ss: [{ s: s * min, e: e * min }], first: false, newest: false });
  const out = mergeRows([mk(731, 762), mk(643, 663)]); // 12:11-12:42 en 10:43-11:03
  assert.equal(out.length, 2);
});
