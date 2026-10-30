import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDownload } from "./rawsource.ts";
import { mergeLiveGroup, mergeRecent } from "./recent.ts";

const H = "timestamp\tdomain\tstatus";
const line = (iso: string, host: string) => `${iso}\t${host}\t`;

test("download aanvullen: nieuwe regels bovenaan, bewaarde regels vanaf het overlap-moment eronder, niets dubbel", () => {
  const old = [H, line("2026-10-17T09:05:00.000Z", "b.nl"), line("2026-10-17T09:00:00.000Z", "a.nl"), line("2026-10-16T20:00:00.000Z", "z.nl")].join("\n") + "\n";
  const since = Date.parse("2026-10-17T08:58:00.000Z");
  const fresh = [H, line("2026-10-17T09:10:00.000Z", "c.nl"), line("2026-10-17T09:05:00.000Z", "b.nl"), line("2026-10-17T09:00:00.000Z", "a.nl")].join("\n") + "\n";
  const out = mergeDownload(old, fresh, since)!.trim().split("\n");
  assert.deepEqual(out.map((l) => l.split("\t")[1]), ["domain", "c.nl", "b.nl", "a.nl", "z.nl"]);
});

test("download aanvullen: andere kolommen (Klaro bewaart meer na een update) = alles opnieuw ophalen", () => {
  const old = [H, line("2026-10-17T09:00:00.000Z", "a.nl")].join("\n") + "\n";
  const fresh = ["timestamp\tdomain\tstatus\textra", "2026-10-17T09:10:00.000Z\tc.nl\t\t"].join("\n") + "\n";
  assert.equal(mergeDownload(old, fresh, 0), null);
});

test("snel herberekenen: vandaag komt uit de verse berekening (labels via het apparaat-id), oudere dagen en 'Nieuw' uit het volledige overzicht", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");
  const full = {
    deviceMap: { id1: "iPad", id2: "iPad 2" }, insights: { since: now - 20 * 86_400_000 },
    groups: [
      { d: "2026-10-17", dev: "iPad 2", site: "tocaboca.com", last: 1, isNew: true, main: true, n: 3, bl: 0, ss: [] },
      { d: "2026-10-16", dev: "iPad", site: "npo.nl", last: 0, main: true, n: 3, bl: 0, ss: [] },
      { d: "2026-10-17", dev: "iPad", site: "oud.nl", last: 0, main: true, n: 1, bl: 0, ss: [] },
    ],
    followers: { "iPad|x.elb.amazonaws.com": "tocaboca.com" },
  };
  // In de laatste uren kwam alleen het tweede iPad voor: daar heet het "iPad".
  const recent = {
    deviceMap: { id2: "iPad" },
    groups: [
      { d: "2026-10-17", dev: "iPad", site: "tocaboca.com", last: 5, main: true, n: 9, bl: 0, ss: [{ s: 1, e: 5 }] },
      { d: "2026-10-17", dev: "iPad", site: "nieuw-spel.nl", last: 4, main: true, n: 2, bl: 0, ss: [] },
    ],
  };
  const m = mergeRecent(full, recent, now);
  const toca = m.groups.find((g: { site: string }) => g.site === "tocaboca.com");
  assert.equal(toca.dev, "iPad 2");
  assert.equal(toca.n, 9);
  assert.equal(toca.isNew, true);
  assert.equal(m.groups.find((g: { site: string }) => g.site === "nieuw-spel.nl").isNew, true);
  assert.ok(m.groups.some((g: { site: string }) => g.site === "npo.nl"), "gisteren blijft staan");
  assert.ok(!m.groups.some((g: { site: string }) => g.site === "oud.nl"), "vandaag komt alleen uit de verse berekening");
  assert.equal(m.followers["iPad|x.elb.amazonaws.com"], "tocaboca.com");
});

test("download aanvullen: stuurt de server toch alles, dan blijft het zonder dubbele regels", () => {
  const rows = [line("2026-10-17T09:05:00.000Z", "b.nl"), line("2026-10-17T09:00:00.000Z", "a.nl"), line("2026-10-16T20:00:00.000Z", "z.nl")];
  const old = [H, ...rows].join("\n") + "\n";
  const fresh = [H, line("2026-10-17T09:10:00.000Z", "c.nl"), ...rows].join("\n") + "\n";
  const out = mergeDownload(old, fresh, Date.parse("2026-10-17T08:58:00.000Z"))!.trim().split("\n");
  assert.deepEqual(out.map((l) => l.split("\t")[1]), ["domain", "c.nl", "b.nl", "a.nl", "z.nl"]);
});

test("download aanvullen: een kapotte regel zonder tijd wordt weggelaten en stopt het aanvullen niet", () => {
  const old = [H, line("2026-10-17T08:50:00.000Z", "a.nl")].join("\n") + "\n";
  const since = Date.parse("2026-10-17T08:58:00.000Z");
  const fresh = [H, line("2026-10-17T09:10:00.000Z", "c.nl"), "7T09:07:00.000Z\tgraph.facebook.com\t", line("2026-10-17T09:05:00.000Z", "b.nl")].join("\n") + "\n";
  const out = mergeDownload(old, fresh, since)!.trim().split("\n");
  assert.deepEqual(out.map((l) => l.split("\t")[1]), ["domain", "c.nl", "b.nl", "a.nl"]);
});

test("live en herberekening samen: de herberekende (echte) sessie blijft, live verlengt hem alleen met de nieuwste minuten", () => {
  const m = 60_000;
  const full: { last: number; ss: { s: number; e: number; n?: number; pv?: 1 }[] } = { last: 10 * m, ss: [{ s: 0, e: 10 * m, n: 4, pv: 1 }] };
  const live = { last: 14 * m, ss: [{ s: 0, e: 14 * m, n: 6 }] }; // live is nieuwer, maar weet niet dat het een echt bezoek is
  const out = mergeLiveGroup(full, live);
  assert.equal(out.last, 14 * m);
  assert.equal(out.ss!.length, 1);
  assert.equal((out.ss![0] as { pv?: 1 }).pv, 1);
  assert.equal(out.ss![0].e, 14 * m);
  // live met een losse nieuwe opvraging later: komt er als eigen stukje bij
  const out2 = mergeLiveGroup(full, { last: 40 * m, ss: [{ s: 0, e: 10 * m }, { s: 40 * m, e: 40 * m, n: 1 }] });
  assert.equal(out2.ss!.length, 2);
  // herberekening even nieuw of nieuwer: die geldt helemaal
  assert.equal(mergeLiveGroup(full, { last: 5 * m, ss: [] }), full);
});

test("live en herberekening: wat live vóór de horizon bij deze site kwam en de herberekening niet heeft, valt weg (29 okt Instagram/Facebook)", () => {
  const m = 60_000;
  const full = { last: 5 * m, ss: [{ s: 4 * m, e: 5 * m, n: 2 }] }; // Facebook eerder op de ochtend
  const live = { last: 30 * m, ss: [{ s: 4 * m, e: 5 * m }, { s: 20 * m, e: 30 * m, n: 9 }] }; // live: Instagram-verkeer op Facebook-adressen
  assert.equal(mergeLiveGroup(full, live, 40 * m), full);
  // na de horizon: nog niet herberekend, live mag het tonen
  assert.equal(mergeLiveGroup(full, live, 25 * m).ss!.at(-1)!.e, 30 * m);
});

test("snel herberekenen: onderweg (ander netwerk) komt ook vers mee, oudere stukjes uit het volledige overzicht", () => {
  const now = Date.parse("2026-10-30T07:35:00Z");
  const old = { s: Date.parse("2026-10-28T10:00:00Z"), e: Date.parse("2026-10-28T10:30:00Z") };
  const full = { deviceMap: { id1: "iPhone" }, insights: { until: Date.parse("2026-10-30T07:00:00Z") }, groups: [], devices: [{ name: "iPhone", away: { now: false, since: 0, runs: [old] } }] };
  const fresh = { s: Date.parse("2026-10-30T07:15:00Z"), e: Date.parse("2026-10-30T07:34:00Z"), ip: "x" };
  const recent = { deviceMap: { id1: "iPhone" }, groups: [], devices: [{ name: "iPhone", away: { now: true, since: fresh.s, runs: [fresh] } }] };
  const m = mergeRecent(full, recent, now);
  const a = m.devices[0].away;
  assert.equal(a.now, true);
  assert.deepEqual(a.runs.map((r: { s: number }) => r.s), [fresh.s, old.s]);
  // vóór het volledige overzicht: niet uit de verse berekening (die ziet met minder regels soms losse seconden onderweg)
  const blip = { s: Date.parse("2026-10-29T23:30:00Z"), e: Date.parse("2026-10-29T23:30:02Z") };
  const m2 = mergeRecent(full, { ...recent, devices: [{ name: "iPhone", away: { now: true, since: fresh.s, runs: [fresh, blip] } }] }, now);
  assert.deepEqual(m2.devices[0].away.runs.map((r: { s: number }) => r.s), [fresh.s, old.s]);
});
