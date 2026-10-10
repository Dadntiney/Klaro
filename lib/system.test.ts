import { test } from "node:test";
import assert from "node:assert/strict";
import { isSystemSite } from "./system.ts";

test("systeem- en infrastructuurdomeinen", () => {
  for (const s of ["apple.com", "aaplimg.com", "google.nl", "conviva.com", "akamaiedge.net"]) assert.equal(isSystemSite(s), true, s);
  for (const s of ["buienradar.nl", "waze.com", "efteling.com"]) assert.equal(isSystemSite(s), false, s);
});
