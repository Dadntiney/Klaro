import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./sites.ts";

test("apps worden samengevoegd", () => {
  assert.equal(classify("i.ytimg.com").name, "YouTube");
  assert.equal(classify("rr3---sn.googlevideo.com").site, "youtube.com");
  assert.equal(classify("www.roblox.com").name, "Roblox");
});

test("achtergrondverkeer", () => {
  assert.equal(classify("www.gstatic.com").bg, true);
  assert.equal(classify("telemetry.example.com").bg, true);
  assert.equal(classify("1.0.0.10.in-addr.arpa").bg, true);
  assert.equal(classify("www.nu.nl").bg, false);
  assert.equal(classify("www.lego.com").bg, false);
});
