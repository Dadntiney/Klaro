import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMinutes } from "./usage.ts";

test("actieve minuten: twee apps tegelijk op één apparaat tellen niet dubbel, losse stukken wel", () => {
  const M = 60_000;
  assert.equal(activeMinutes([{ s: 0, e: 10 * M }, { s: 5 * M, e: 12 * M }]), 12);
  assert.equal(activeMinutes([{ s: 0, e: 10 * M }, { s: 20 * M, e: 25 * M }]), 15);
  assert.equal(activeMinutes([]), 0);
});

import { usage } from "./usage.ts";
const M = 60_000;
const tvGroup = (dev: string, ss: { s: number; e: number; n?: number; m?: number }[]) => ({ d: "2026-10-24", dev, site: "netflix.com", name: "Netflix", main: true, bg: false, n: 10, last: ss[ss.length - 1].e, ss });

test("tv: los beeldmoment (videoserver) verbindt echte kijkstukken binnen 15 min tot één geheel", () => {
  const g = tvGroup("Apple TV", [{ s: 0, e: 3 * M, n: 3, m: 1 }, { s: 10 * M, e: 10 * M, n: 1, m: 1 }, { s: 22 * M, e: 30 * M, n: 4, m: 2 }]);
  const { shown } = usage([g] as never[], { auto: new Set(), followers: {} });
  const ss = shown(g as never);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].s, 0);
  assert.equal(ss[0].e, 30 * M);
});

test("geen vals kijken: los beeldmoment zonder echt kijkstuk ernaast wordt geen regel, en niet op een telefoon", () => {
  const alone = tvGroup("Apple TV", [{ s: 0, e: 0, n: 1, m: 1 }, { s: 60 * M, e: 60 * M, n: 1, m: 1 }]);
  assert.equal(usage([alone] as never[], { auto: new Set(), followers: {} }).shown(alone as never).length, 0);
  const phone = tvGroup("iPhone", [{ s: 0, e: 3 * M, n: 3, m: 1 }, { s: 10 * M, e: 10 * M, n: 1, m: 1 }]);
  const ss = usage([phone] as never[], { auto: new Set(), followers: {} }).shown(phone as never);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].e, 3 * M);
  // ver weg (meer dan 15 min) verlengt niet
  const far = tvGroup("Apple TV", [{ s: 0, e: 3 * M, n: 3, m: 1 }, { s: 20 * M, e: 20 * M, n: 1, m: 1 }]);
  assert.equal(usage([far] as never[], { auto: new Set(), followers: {} }).shown(far as never)[0].e, 3 * M);
});

test("spel dat echt opstartte: stukjes met hooguit 7 min ertussen (spelmotor meldt elke 5 min) zijn één keer spelen", () => {
  const g = { d: "2026-10-24", dev: "iPad", site: "spelvoorbeeld.com", name: "Spel (spel)", main: true, bg: false, n: 10, last: 41 * M,
    ss: [{ s: 0, e: 5 * M, n: 3, gs: 1 }, { s: 10 * M, e: 15 * M, n: 2 }, { s: 20 * M, e: 20 * M, n: 1 }, { s: 25 * M, e: 41 * M, n: 5, gs: 1 }] };
  const ss = usage([g] as never[], { auto: new Set(), followers: {} }).shown(g as never);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].e - ss[0].s, 41 * M);
  // geen spel-opstart (gs) die dag: niet samenvoegen
  const site = { ...g, site: "website.nl", name: "website.nl", ss: g.ss.map(({ gs: _g, ...x }) => ({ ...x, n: 3 })) };
  assert.equal(usage([site] as never[], { auto: new Set(), followers: {} }).shown(site as never).length, 4);
  // een gat van bijna 10 min: er mist een melding van de spelmotor, het spel lag stil (26 okt LPRA 15:54-16:04)
  const paused = { ...g, ss: [{ s: 0, e: 3 * M, n: 3, gs: 1 }, { s: 13 * M, e: 13 * M, n: 1 }] };
  const ps = usage([paused] as never[], { auto: new Set(), followers: {} }).shown(paused as never);
  assert.ok(ps.every((x) => x.e - x.s <= 3 * M), "niet doorgetrokken over het stille gat");
});

test("doorverwijs-adres zonder vaste melding: twee keer kort openen is geen gebruik ertussen (29 okt Hue 06:17 en 06:24)", () => {
  const g = { d: "2026-10-29", dev: "iPhone", site: "app.example", name: "App", main: true, bg: false, n: 6, last: 7 * M,
    ss: [{ s: 7 * M, e: 7 * M, n: 3, f: 3 }, { s: 0, e: 0, n: 3, f: 3 }] };
  const fol = { "iPhone|cdn.example.net": "app.example" };
  const ss = usage([g] as never[], { auto: new Set(), followers: fol, heartbeat: [] }).shown(g as never);
  assert.ok(ss.every((x) => x.e === x.s), "niet aan elkaar geplakt");
  // wel een echte vaste melding (de server zag het adres vaak los terugkomen): één keer gebruik
  const hb = usage([g] as never[], { auto: new Set(), followers: fol, heartbeat: ["iPhone|app.example"] }).shown(g as never);
  assert.equal(hb.length, 1);
  assert.equal(hb[0].e - hb[0].s, 7 * M);
  // een kant die al even duurde (doorspelen): wel samenvoegen
  const long = { ...g, ss: [{ s: 7 * M, e: 7 * M, n: 3, f: 3 }, { s: 0, e: 2 * M, n: 6, f: 3 }] };
  const ls = usage([long] as never[], { auto: new Set(), followers: fol, heartbeat: [] }).shown(long as never);
  assert.equal(ls.length, 1);
});
