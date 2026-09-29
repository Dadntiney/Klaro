import { describe, expect, it } from "vitest";

import type { KlaroItem } from "@/lib/domain";
import { buildNotices } from "./notices";

const NOW = new Date("2026-09-29T10:00:00.000Z");

function item(patch: Partial<KlaroItem>): KlaroItem {
  return {
    id: "item-1",
    captureId: null,
    kind: "herinnering",
    title: "Factuur Vattenfall betalen",
    notes: null,
    dueAt: null,
    remindAt: "2026-10-04T07:00:00.000Z",
    status: "open",
    createdAt: "2026-09-29T10:00:00.000Z",
    ...patch,
  };
}

describe("buildNotices", () => {
  it("skips a document reminder when that bill already has one", () => {
    const notices = buildNotices({
      now: NOW,
      items: [item({})],
      documents: [{ id: "doc-1", title: "Factuur Vattenfall", dueOn: "2026-10-04", amountCents: 14632 }],
      states: [],
      notifications: true,
      proactive: true,
    });
    expect(notices.some((notice) => notice.sourceKey.startsWith("document:"))).toBe(false);
  });

  it("offers a reminder when a dated document has none yet", () => {
    const notices = buildNotices({
      now: NOW,
      items: [],
      documents: [{ id: "doc-1", title: "Factuur Vattenfall", dueOn: "2026-10-04", amountCents: 14632 }],
      states: [],
      notifications: true,
      proactive: true,
    });
    expect(notices[0]?.body).toContain("4 oktober");
    expect(notices[0]?.documentId).toBe("doc-1");
  });
});
