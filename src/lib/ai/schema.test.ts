import { describe, expect, it } from "vitest";
import { parseModelResponse } from "./schema";

describe("parseModelResponse", () => {
  it("normalizes snake_case instants from the model", () => {
    const parsed = parseModelResponse({
      summary: "Twee dingen klaargezet.",
      items: [
        {
          kind: "herinnering",
          title: "Verzekering bellen",
          notes: null,
          remind_at: "2026-09-30T09:00:00+02:00",
          due_at: null,
        },
      ],
    });

    expect(parsed.items[0].remindAt).toBe("2026-09-30T07:00:00.000Z");
    expect(parsed.items[0].dueAt).toBeNull();
  });

  it("rejects an empty item list", () => {
    expect(() => parseModelResponse({ summary: "Niets", items: [] })).toThrow();
  });
});
