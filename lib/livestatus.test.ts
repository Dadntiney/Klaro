import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceUse, isActiveNow } from "./livestatus.ts";

const m = (x: number) => 1_800_000_000_000 + x * 60_000;
const g = (o: Record<string, unknown>) => ({ d: "2026-10-16", dev: "iPhone", n: 5, bg: false, main: true, ...o }) as never;

test("chip groen bij echt gebruik nu, en net zo lang als de rij 'nu' zegt", () => {
  const use = deviceUse([g({ site: "nu.nl", name: "nu.nl", ss: [{ s: m(0), e: m(1), n: 3 }], ts: [m(1)] })], new Set());
  assert.equal(isActiveNow(use, "iPhone", m(3.5)), true);
  assert.equal(isActiveNow(use, "iPhone", m(4.5)), false);
});

test("geen vals groen: Facebook en Instagram die samen op de achtergrond verversen", () => {
  const groups = [
    g({ site: "facebook.com", name: "Facebook", ss: [{ s: m(0), e: m(1), n: 3, f: 0 }], ts: [m(0), m(0.5), m(1)] }),
    g({ site: "instagram.com", name: "Instagram", ss: [{ s: m(0), e: m(1), n: 2, f: 0 }], ts: [m(0.2), m(1)] }),
  ];
  assert.equal(isActiveNow(deviceUse(groups, new Set()), "iPhone", m(1.5)), false);
});

test("geen vals groen: één los voorgeladen filmpje (Netflix op de iPad)", () => {
  const use = deviceUse([g({ dev: "iPad", site: "netflix.com", name: "Netflix", lm: m(0), ss: [{ s: m(0), e: m(0), n: 1, m: 1 }], ts: [m(0)] })], new Set());
  assert.equal(isActiveNow(use, "iPad", m(1)), false);
});

test("Google-zoekopdracht telt voor de chip (zoals in de lijst); een widget die zichzelf ververst niet", () => {
  const use = deviceUse([g({ site: "google.com", name: "Google", ss: [{ s: m(0), e: m(1), n: 3, f: 3 }], ts: [m(1)] })], new Set());
  assert.equal(isActiveNow(use, "iPhone", m(2)), true);
  const w = g({ site: "voetbal.nl", name: "voetbal.nl", ss: [{ s: m(0), e: m(0), n: 1, pv: 1 }], ts: [m(0), m(0.5), m(1.2)] });
  assert.equal(isActiveNow(deviceUse([w], new Set(["iPhone|voetbal.nl"])), "iPhone", m(1.5)), false);
});

test("groene chip noemt de app alleen als die zeker nu bezig is; anders geen naam (niet raden)", async () => {
  const { activeWhat } = await import("./livestatus.ts");
  const use = deviceUse([g({ dev: "Apple TV", site: "ziggogo.tv", name: "Ziggo GO", lm: m(40), ss: [{ s: m(0), e: m(40), n: 30, m: 30 }], ts: [m(40)] })], new Set());
  assert.equal(activeWhat(use, "Apple TV", m(42)), "Ziggo GO");
  assert.equal(activeWhat(use, "Apple TV", m(60)), undefined); // al lang niets meer
  assert.equal(activeWhat(use, "iPhone", m(42)), undefined);
});
