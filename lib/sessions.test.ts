import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterSessions, extendSessions, isHuman, minutes, totalMinutes } from "./sessions.ts";

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

test("isHuman: beeld/geluid (video, muziek) telt als gebruik, ook met weinig verzoeken", async () => {
  const { isHuman } = await import("./sessions.ts");
  assert.equal(isHuman({ s: 1, e: 2, n: 3, m: 2 }), true);
  assert.equal(isHuman({ s: 1, e: 2, n: 3, m: 1 }), false);
});

test("apps met achtergrondverkeer: alleen echte inhoud telt, en alleen die bepaalt de duur", () => {
  const t = 1_000_000_000;
  let ss: import("./sessions.ts").Session[] = [];
  ss = extendSessions(ss, t, false, false); // Facebook ververst op de achtergrond
  ss = extendSessions(ss, t + 1_000, false, false);
  assert.equal(isHuman(ss[0]), false);
  ss = extendSessions(ss, t + 60_000, true, true); // foto's laden: app is open
  ss = extendSessions(ss, t + 180_000, true, true);
  assert.equal(isHuman(ss[0]), true);
  assert.equal(ss[0].s, t + 60_000); // gebruik begint bij de eerste inhoud
  ss = extendSessions(ss, t + 400_000, false, false); // daarna weer achtergrond: rekt de duur niet op
  assert.equal(ss[0].e, t + 180_000);
  assert.equal(minutes(ss[0]), 2);
});

test("een ingesloten filmpje op een andere site is geen eigen bezoek", () => {
  assert.equal(isHuman({ s: 0, e: 120_000, n: 12, m: 4, emb: 1 }), false);
});

test("alleen losse onderdelen (teller op een webwinkel) is geen bezoek; met de site zelf erbij wel", () => {
  const t = 1_000_000_000;
  let ss = extendSessions([], t, false, undefined, true);
  ss = extendSessions(ss, t + 1_000, false, undefined, true);
  assert.equal(isHuman({ ...ss[0], n: 8 }), false);
  ss = extendSessions(ss, t + 2_000, false, undefined, false); // www.site.nl erbij
  assert.equal(ss[0].res, undefined);
});

test("momenten: dezelfde foto die 3x wordt opgevraagd telt als één moment", async () => {
  const { moments } = await import("./sessions.ts");
  assert.equal(moments([1000, 1001, 1003]), 1);
  assert.equal(moments([1000, 1001, 9000]), 2);
  const t = 1_000_000_000;
  let ss = extendSessions([], t, true, true);
  ss = extendSessions(ss, t + 5, true, true);
  ss = extendSessions(ss, t + 9, true, true); // A, AAAA, HTTPS van hetzelfde plaatje
  assert.equal(ss[0].f, 1);
  assert.equal(isHuman(ss[0]), false);
  ss = extendSessions(ss, t + 30_000, true, true); // echt verder scrollen
  assert.equal(isHuman(ss[0]), true);
});
