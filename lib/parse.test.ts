import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, extractHost, baseDomain, detectColumns, aggregate } from "./parse.ts";

test("parseCsv handles quotes and semicolons", () => {
  assert.deepEqual(parseCsv('a;b\n"x;1";"he said ""hi"""\n'), [["a", "b"], ["x;1", 'he said "hi"']]);
});

test("extractHost", () => {
  assert.equal(extractHost("https://www.Lego.com/nl-nl/x?y=1"), "www.lego.com");
  assert.equal(extractHost("api.steampowered.com."), "api.steampowered.com");
  assert.equal(extractHost("hello"), null);
});

test("baseDomain", () => {
  assert.equal(baseDomain("www.lego.com"), "lego.com");
  assert.equal(baseDomain("a.b.example.co.uk"), "example.co.uk");
});

test("detect + aggregate", () => {
  const rows = parseCsv("time,query,count\n1,www.lego.com,3\n2,shop.lego.com,2\n3,roblox.com,1\n");
  const [h, ...body] = rows;
  const det = detectColumns(h, body)!;
  assert.deepEqual(det, { hostCol: 1, countCol: 2 });
  const { domains } = aggregate(body, det);
  assert.deepEqual(domains.map((d) => [d.domain, d.visits]), [["lego.com", 5], ["roblox.com", 1]]);
});
