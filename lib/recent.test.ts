import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDownload } from "./rawsource.ts";
import { mergeRecent } from "./recent.ts";

const H = "timestamp\tdomain\tstatus";
const line = (iso: string, host: string) => `${iso}\t${host}\t`;

test("download aanvullen: nieuwe regels bovenaan, bewaarde regels vanaf het overlap-moment eronder, niets dubbel", () => {
  const old = [H, line("2026-10-17T09:05:00.000Z", "b.nl"), line("2026-10-17T09:00:00.000Z", "a.nl"), line("2026-10-16T20:00:00.000Z", "z.nl")].join("\n") + "\n";
  const since = Date.parse("2026-10-17T08:58:00.000Z");
  const fresh = [H, line("2026-10-17T09:10:00.000Z", "c.nl"), line("2026-10-17T09:05:00.000Z", "b.nl"), line("2026-10-17T09:00:00.000Z", "a.nl")].join("\n") + "\n";
  const out = mergeDownload(old, fresh, since).trim().split("\n");
  assert.deepEqual(out.map((l) => l.split("\t")[1]), ["domain", "c.nl", "b.nl", "a.nl", "z.nl"]);
});

test("download aanvullen: andere kolommen bij NextDNS = alleen het nieuwe gebruiken", () => {
  const old = [H, line("2026-10-17T09:00:00.000Z", "a.nl")].join("\n") + "\n";
  const fresh = ["timestamp\tdomain\tstatus\textra", "2026-10-17T09:10:00.000Z\tc.nl\t\t"].join("\n") + "\n";
  assert.equal(mergeDownload(old, fresh, 0), fresh);
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
  const out = mergeDownload(old, fresh, Date.parse("2026-10-17T08:58:00.000Z")).trim().split("\n");
  assert.deepEqual(out.map((l) => l.split("\t")[1]), ["domain", "c.nl", "b.nl", "a.nl", "z.nl"]);
});
