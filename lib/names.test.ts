import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDevice } from "./names.ts";

test("cleanDevice", () => {
  assert.equal(cleanDevice("iPhone van Anna", "Anna"), "iPhone");
  assert.equal(cleanDevice("Anna's iPad", "anna"), "iPad");
  assert.equal(cleanDevice("Anna", "Anna"), "Apparaat");
  assert.equal(cleanDevice("Laptop Pieter", "Anna"), "Laptop Pieter");
  assert.equal(cleanDevice("iPhone van Anna", ""), "iPhone van Anna");
});
