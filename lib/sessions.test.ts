import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterSessions, extendSessions, minutes, totalMinutes } from "./sessions.ts";

const m = (x: number) => 1_700_000_000_000 + x * 60_000; // vaste starttijd (0 zou "geen tijd" betekenen)

test("verzoeken vlak na elkaar worden één sessie", () => {
  const ss = clusterSessions([m(0), m(1), m(2), m(10), m(11), m(100)]);
  assert.deepEqual(ss, [{ s: m(100), e: m(100), n: 1 }, { s: m(10), e: m(11), n: 2 }, { s: m(0), e: m(2), n: 3 }]);
  assert.deepEqual(ss.map(minutes), [0, 1, 2]);
});

test("extendSessions verlengt of start een nieuwe sessie", () => {
  let ss = clusterSessions([m(0), m(3)]);
  ss = extendSessions(ss, m(5));
  assert.deepEqual(ss, [{ s: m(0), e: m(5), n: 3 }]);
  ss = extendSessions(ss, m(60));
  assert.equal(ss.length, 2);
  assert.deepEqual(ss[0], { s: m(60), e: m(60), n: 1 });
});

test("totalMinutes telt alle sessies, ook meer dan de getoonde vijf", () => {
  const times = Array.from({ length: 8 }, (_, i) => [m(i * 100), m(i * 100 + 4)]).flat();
  assert.equal(clusterSessions(times).length, 5);
  assert.equal(totalMinutes(times), 8 * 4);
});

test("isHuman: korte achtergrondverzoeken zijn geen gebruik", async () => {
  const { isHuman, allSessions } = await import("./sessions.ts");
  const t0 = 1_000_000_000_000;
  // twee verzoeken kort na elkaar: een app die even verversen
  assert.equal(isHuman(allSessions([t0, t0 + 2000])[0]), false);
  // veel verzoeken: echt gebruik
  assert.equal(isHuman(allSessions(Array.from({ length: 8 }, (_, i) => t0 + i * 3000))[0]), true);
  // een paar verzoeken verspreid over meer dan een minuut
  assert.equal(isHuman(allSessions([t0, t0 + 40_000, t0 + 90_000])[0]), true);
  // zonder telling (oude gegevens) telt mee
  assert.equal(isHuman({ s: 1, e: 2 }), true);
});
