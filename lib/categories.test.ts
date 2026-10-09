import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryOf } from "./categories.ts";

test("categorieën", () => {
  assert.equal(categoryOf("roblox.com"), "Games");
  assert.equal(categoryOf("youtube.com"), "Video");
  assert.equal(categoryOf("instagram.com"), "Sociale media");
  assert.equal(categoryOf("wikipedia.org"), "School");
  assert.equal(categoryOf("intertoys.nl"), "Winkelen");
  assert.equal(categoryOf("onbekende-site.nl"), "Overig");
});
