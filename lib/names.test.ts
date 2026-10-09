import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceType, labelDevices } from "./names.ts";

test("deviceType toont alleen het soort apparaat", () => {
  assert.equal(deviceType("iPhone van Anna"), "iPhone");
  assert.equal(deviceType("Anna's iPad"), "iPad");
  assert.equal(deviceType("MacBook Pro van Piet"), "MacBook");
  assert.equal(deviceType("Samsung TV woonkamer"), "TV");
  assert.equal(deviceType("Galaxy S23 Piet"), "Android-telefoon");
  assert.equal(deviceType("Anna"), "Apparaat");
  assert.equal(deviceType("", ""), "Onbekend");
  assert.equal(deviceType("Anna", "iPhone15,2"), "iPhone");
});

test("labelDevices nummert gelijke soorten", () => {
  const m = labelDevices([{ id: "b", type: "iPhone" }, { id: "a", type: "iPhone" }, { id: "c", type: "iPad" }]);
  assert.deepEqual(m, { a: "iPhone 1", b: "iPhone 2", c: "iPad" });
});
