import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeNetwork, netKey } from "./network.ts";

const T = 1_700_000_000_000, M = 60_000;

test("netKey", () => {
  assert.equal(netKey("2001:1c00:ad87:ab00:4437:8be8:b47d:1bdd"), "2001:1c00:ad87:ab00");
  assert.equal(netKey("109.36.148.203"), "109.36.148.203");
});

test("thuis en onderweg", () => {
  const rows = [];
  // thuis: IPv6 en daarnaast IPv4 (zelfde minuut), veel verkeer
  for (let i = 0; i < 200; i++) {
    rows.push({ dev: "iPhone", t: T + i * M, ip: `2001:db8:1:1:${i}:aaaa:bbbb:cccc` });
    if (i % 5 === 0) rows.push({ dev: "iPhone", t: T + i * M + 10_000, ip: "109.1.1.1" });
  }
  // later onderweg: ander IPv4-adres, 10 verzoeken
  for (let i = 0; i < 10; i++) rows.push({ dev: "iPhone", t: T + 300 * M + i * M, ip: "212.5.5.5" });
  const r = analyzeNetwork(rows).get("iPhone")!;
  assert.equal(r.now, true);
  assert.equal(r.since, T + 300 * M);
  assert.equal(r.runs.length, 1);
  // een iPhone die gewoon thuis is
  const home = analyzeNetwork(rows.filter((x) => x.ip !== "212.5.5.5")).get("iPhone")!;
  assert.equal(home.now, false);
  assert.equal(home.runs.length, 0);
});

test("apparaat zonder bekend thuisnetwerk: geen onderweg-meldingen", () => {
  const rows = [];
  for (let i = 0; i < 100; i++) rows.push({ dev: "iPhone", t: T + i * M, ip: `2001:db8:1:1:${i}:1:2:3` });
  for (let i = 0; i < 50; i++) rows.push({ dev: "MacBook", t: T + i * M, ip: "212.5.5.5" });
  const r = analyzeNetwork(rows).get("MacBook")!;
  assert.equal(r.now, null);
  assert.equal(r.runs.length, 0);
});
