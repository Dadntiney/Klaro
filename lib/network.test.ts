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

test("periode buiten het thuisnetwerk onthoudt het adres dat toen het meest gebruikt werd (voor mobiel of andere wifi)", () => {
  const m = 60_000;
  const rows = [
    ...[0, 1, 2, 3].map((i) => ({ dev: "iPhone", t: i * m, ip: "2001:db8:1:2::" + (i + 1) })), // thuis
    ...[10, 11, 12, 13].map((i) => ({ dev: "iPhone", t: i * m, ip: i === 13 ? "203.0.113.9" : "203.0.113.5" })), // onderweg
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ dev: "Apple TV", t: i * m, ip: "2001:db8:1:2::99" })),
  ];
  const a = analyzeNetwork(rows).get("iPhone")!;
  assert.equal(a.runs.length, 1);
  assert.equal(a.runs[0].ip, "203.0.113.5");
});

test("telefoon thuis die een deel via mobiel internet stuurt is thuis; alleen mobiel (geen wifi in 5 min) is weg; wisselen splitst", () => {
  const m = 60_000;
  const rows: { dev: string; t: number; ip: string }[] = [];
  // thuis: wifi (IPv6) en tussendoor mobiel (IPv4 van de provider), een uur lang
  for (let i = 0; i < 60; i++) rows.push({ dev: "iPhone", t: i * m, ip: "2001:db8:1:2::" + (i + 1) }, { dev: "iPhone", t: i * m + 2_000, ip: "198.51.100.7" });
  for (let i = 0; i < 120; i++) rows.push({ dev: "Apple TV", t: i * m, ip: "2001:db8:1:2::99" }, { dev: "Apple TV", t: i * m + 500, ip: "192.0.2.1" });
  for (let i = 0; i < 60; i++) rows.push({ dev: "iPhone", t: i * m + 1_000, ip: "192.0.2.1" }); // thuis-IPv4 (ook van de tv)
  // daarna 20 min alleen mobiel, dan 20 min een andere wifi
  for (let i = 70; i < 90; i++) rows.push({ dev: "iPhone", t: i * m, ip: "198.51.100.7" });
  for (let i = 90; i < 110; i++) rows.push({ dev: "iPhone", t: i * m, ip: "203.0.113.5" });
  const a = analyzeNetwork(rows).get("iPhone")!;
  assert.equal(a.runs.length, 2, JSON.stringify(a.runs));
  const [wifi, mob] = a.runs; // nieuwste eerst
  assert.equal(mob.ip, "198.51.100.7");
  assert.ok(mob.s >= 70 * m && mob.e < 90 * m, "het uur thuis telt niet als weg");
  assert.equal(wifi.ip, "203.0.113.5");
  assert.equal(analyzeNetwork(rows).get("Apple TV")!.runs.length, 0);
});

test("hotspot: laptop buiten de deur op hetzelfde adres als de telefoon op hetzelfde moment", () => {
  const m = 60_000;
  const rows: { dev: string; t: number; ip: string }[] = [];
  for (let i = 0; i < 30; i++) rows.push({ dev: "Apple TV", t: i * m, ip: "2001:db8:1:2::99" }, { dev: "iPhone", t: i * m, ip: "2001:db8:1:2::5" }, { dev: "MacBook", t: i * m, ip: "2001:db8:1:2::7" });
  for (let i = 40; i < 60; i++) rows.push({ dev: "iPhone", t: i * m, ip: "198.51.100.7" }, { dev: "MacBook", t: i * m + 5_000, ip: "198.51.100.7" });
  const net = analyzeNetwork(rows);
  assert.equal(net.get("MacBook")!.runs[0].hotspot, "iPhone");
  assert.equal(net.get("iPhone")!.runs[0].hotspot, undefined); // de telefoon zelf niet
});
