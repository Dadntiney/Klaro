import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLists, parseList } from "./lijsten.ts";

test("lijsten: een nieuwe 18+-site uit een bron komt erbij; niets verdwijnt; grote platforms nooit", () => {
  const bron = parseList("# kop\n0.0.0.0 nieuwe-xxx-site.example\n||ander.example^\nwww.google.com\ngoogle.com\nsub.oud.example\nxxx-blog.tumblr.com\ntumblr.com\n");
  const { next, added } = mergeLists(new Set(["oud.example"]), [bron]);
  assert.ok(next.has("nieuwe-xxx-site.example"));
  assert.ok(next.has("ander.example"));
  assert.ok(next.has("oud.example")); // blijft
  assert.ok(!next.has("sub.oud.example")); // al gedekt door het ouderdomein
  assert.ok(!next.has("google.com"));
  assert.ok(!next.has("www.google.com") && !next.has("tumblr.com")); // het platform zelf nooit
  assert.ok(next.has("xxx-blog.tumblr.com")); // een 18+-blog op dat platform wel
  assert.deepEqual(added, ["ander.example", "nieuwe-xxx-site.example", "xxx-blog.tumblr.com"]);
});

test("lijsten: een bron die niets of rommel geeft, haalt niets weg", () => {
  const { next, added } = mergeLists(new Set(["oud.example", "nog-een.example"]), [parseList("<html>fout</html>\n")]);
  assert.equal(next.size, 2);
  assert.equal(added.length, 0);
});
