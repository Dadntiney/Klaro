import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterSessions, extendSessions, minutes, totalMinutes } from "./sessions.ts";

const m = (x: number) => 1_700_000_000_000 + x * 60_000; // vaste starttijd (0 zou "geen tijd" betekenen)

test("verzoeken vlak na elkaar worden één sessie", () => {
  const ss = clusterSessions([m(0), m(1), m(2), m(10), m(11), m(100)]);
  assert.deepEqual(ss, [{ s: m(100), e: m(100) }, { s: m(10), e: m(11) }, { s: m(0), e: m(2) }]);
  assert.deepEqual(ss.map(minutes), [0, 1, 2]);
});

test("extendSessions verlengt of start een nieuwe sessie", () => {
  let ss = clusterSessions([m(0), m(3)]);
  ss = extendSessions(ss, m(5));
  assert.deepEqual(ss, [{ s: m(0), e: m(5) }]);
  ss = extendSessions(ss, m(60));
  assert.equal(ss.length, 2);
  assert.deepEqual(ss[0], { s: m(60), e: m(60) });
});

test("totalMinutes telt alle sessies, ook meer dan de getoonde vijf", () => {
  const times = Array.from({ length: 8 }, (_, i) => [m(i * 100), m(i * 100 + 4)]).flat();
  assert.equal(clusterSessions(times).length, 5);
  assert.equal(totalMinutes(times), 8 * 4);
});
