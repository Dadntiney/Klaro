import { test } from "node:test";
import assert from "node:assert/strict";
import { WINDOW_DAYS, mergeDownload, rawSource } from "./rawsource.ts";

const HEAD = "timestamp\tdomain\n";
const res = (t: string) => ({ ok: true, status: 200, text: async () => t, json: async () => ({}) });

test("na inloggen alleen de laatste 30 dagen; 'oudere dagen laden' haalt alles", async () => {
  (globalThis as { indexedDB?: unknown }).indexedDB = undefined; // in de test geen opslag
  const asked: string[] = [];
  const now = Date.now();
  const base = {
    logs: async () => res("{}"),
    download: async () => { asked.push("alles"); return res(HEAD + new Date(now - 60_000).toISOString() + "\twww.a.nl\n" + new Date(now - 40 * 86_400_000).toISOString() + "\twww.oud.nl\n"); },
    since: async (since: number) => { asked.push("sinds:" + Math.round((now - since) / 86_400_000)); return res(HEAD + new Date(now - 60_000).toISOString() + "\twww.a.nl\n"); },
  };
  const src = rawSource(base as never);
  const t1 = await (await src.client.download(1000)).text();
  assert.equal(asked[0], `sinds:${WINDOW_DAYS}`);
  assert.ok(!t1.includes("www.oud.nl"));
  assert.ok(src.windowFrom() > 0);
  src.expand();
  const t2 = await (await src.client.download(1000)).text();
  assert.equal(asked[1], "alles");
  assert.ok(t2.includes("www.oud.nl"));
  assert.equal(src.windowFrom(), 0);
});

test("aanvullen houdt de bestaande regels (mergeDownload)", () => {
  const old = HEAD + "2026-10-20T10:00:00.000Z\twww.b.nl\n2026-10-20T09:00:00.000Z\twww.a.nl\n";
  const fresh = HEAD + "2026-10-20T11:00:00.000Z\twww.c.nl\n2026-10-20T10:00:00.000Z\twww.b.nl\n";
  assert.equal(mergeDownload(old, fresh, Date.parse("2026-10-20T09:55:00Z")), HEAD + "2026-10-20T11:00:00.000Z\twww.c.nl\n2026-10-20T10:00:00.000Z\twww.b.nl\n2026-10-20T09:00:00.000Z\twww.a.nl\n");
});
