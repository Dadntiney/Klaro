import { test } from "node:test";
import assert from "node:assert/strict";
import { isVideoOnlyClip } from "./clip.ts";

test("clip in een andere app (alleen googlevideo, kort) is geen YouTube-gebruik", () => {
  assert.equal(isVideoOnlyClip(["rr5---sn-oj5hn5-5f.googlevideo.com", "rr4---sn-5hne6nzy.googlevideo.com"], 130_000, false), true);
});

test("geen vals alarm: echt YouTube blijft staan", () => {
  // De app zelf laadt plaatjes (ytimg) of de site.
  assert.equal(isVideoOnlyClip(["i.ytimg.com", "rr5---sn-oj5hn5-5f.googlevideo.com"], 130_000, false), false);
  assert.equal(isVideoOnlyClip(["www.youtube.com", "rr5---sn-oj5hn5-5f.googlevideo.com"], 60_000, false), false);
  // Langer dan 5 minuten kijken.
  assert.equal(isVideoOnlyClip(["rr5---sn-oj5hn5-5f.googlevideo.com"], 600_000, false), false);
  // Verder kijken kort na echt YouTube-gebruik: de app heeft alles al.
  assert.equal(isVideoOnlyClip(["rr5---sn-oj5hn5-5f.googlevideo.com"], 60_000, true), false);
});
