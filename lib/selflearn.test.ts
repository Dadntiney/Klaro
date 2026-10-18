import { test } from "node:test";
import assert from "node:assert/strict";
import { learnStats, type LearnEvent } from "./selflearn.ts";

// Verzonnen dagen: 's middags app open met een link naar een website erna; 's nachts alleen achtergrond.
const day = (d: number, h: number, m = 0) => Date.parse(`2026-10-${String(d).padStart(2, "0")}T${String(h - 2).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

test("zelf leren: een adres dat alleen bij echt gebruik voorkomt wordt bewijs, een adres dat 's nachts ook voorkomt nooit", () => {
  const ev: LearnEvent[] = [];
  for (let d = 1; d <= 30; d++) {
    // gebruik: app-adressen + daarna een website (link uit de app)
    const t = day(d, 14, d % 50);
    ev.push({ t, dev: "P", host: "dgw.app.com", site: "app.com", app: true }, { t: t + 500, dev: "P", host: "gateway.app.com", site: "app.com", app: true }, { t: t + 8_000, dev: "P", host: "www.winkel.nl", site: "winkel.nl", page: true });
    // nacht: alleen achtergrond
    ev.push({ t: day(d, 3), dev: "P", host: "gateway.app.com", site: "app.com", app: true });
  }
  const s = learnStats(ev).get("app.com")!;
  assert.equal(s.ready, true);
  assert.deepEqual(s.learned, ["dgw.app.com"]);
});

test("zelf leren: met te weinig nachtvoorbeelden wordt nog niets geleerd (wacht)", () => {
  const ev: LearnEvent[] = [];
  for (let d = 1; d <= 30; d++) {
    const t = day(d, 14, d % 50);
    ev.push({ t, dev: "P", host: "dgw.app.com", site: "app.com", app: true }, { t: t + 8_000, dev: "P", host: "www.winkel.nl", site: "winkel.nl", page: true });
    if (d <= 5) ev.push({ t: day(d, 3), dev: "P", host: "gateway.app.com", site: "app.com", app: true });
  }
  const s = learnStats(ev).get("app.com")!;
  assert.equal(s.ready, false);
  assert.deepEqual(s.learned, []);
  assert.deepEqual(s.waiting, ["dgw.app.com"]);
});

test("zelf leren: adressen die websites meeladen (Facebook-pixel) worden nooit bewijs", async () => {
  const { learnStats } = await import("./selflearn.ts");
  const ev: { t: number; dev: string; host: string; site: string; app?: boolean; page?: boolean }[] = [];
  const day = 86_400_000;
  for (let i = 0; i < 40; i++) {
    const t = Date.parse("2026-10-01T10:00:00Z") + i * day;
    ev.push({ t, dev: "A", host: "connect.facebook.net", site: "facebook.com", app: true }, { t: t + 5_000, dev: "A", host: "www.voorbeeld.nl", site: "voorbeeld.nl", page: true });
  }
  for (let i = 0; i < 25; i++) ev.push({ t: Date.parse("2026-10-01T01:30:00Z") + i * day, dev: "A", host: "graph.facebook.com", site: "facebook.com", app: true });
  const s = learnStats(ev as never).get("facebook.com")!;
  assert.equal(s.learned.includes("connect.facebook.net"), false);
  assert.equal(s.waiting.includes("connect.facebook.net"), false);
});
