import { test } from "node:test";
import assert from "node:assert/strict";
import { geldig } from "./geleerd.ts";

test("geleerd blijft gelden na het legen van het logboek, tot 90 dagen na de laatste bevestiging", () => {
  const lijst = [{ k: "iPhone|widget.nl", laatst: "2026-10-16" }, { k: "MacBook|oud.nl", laatst: "2026-06-01" }];
  assert.deepEqual(geldig(lijst, Date.parse("2026-10-20T12:00:00Z")), ["iPhone|widget.nl"]);
  assert.deepEqual(geldig(lijst, Date.parse("2027-02-01T12:00:00Z")), []);
});
