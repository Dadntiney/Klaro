import { describe, expect, it } from "vitest";
import { interpretLocally } from "./local";

const TUESDAY_NOON = new Date("2026-09-29T10:00:00.000Z");

describe("interpretLocally", () => {
  it("keeps a single errand as a task", () => {
    const result = interpretLocally("Koop melk en brood", TUESDAY_NOON);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "taak",
      title: "Koop melk en brood",
      dueAt: null,
      remindAt: null,
    });
  });

  it("reads a reminder with morgen and a clock time", () => {
    const result = interpretLocally(
      "Herinner me morgen om 9 uur om de verzekering te bellen",
      TUESDAY_NOON,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("herinnering");
    expect(result.items[0].title.toLowerCase()).toContain("verzekering");
    expect(result.items[0].remindAt).toBe("2026-09-30T07:00:00.000Z");
    expect(result.items[0].dueAt).toBeNull();
  });

  it("understands Dutch half hours", () => {
    const result = interpretLocally(
      "Herinner me morgen om half 10 om de vergadering",
      TUESDAY_NOON,
    );
    expect(result.items[0].kind).toBe("herinnering");
    expect(result.items[0].remindAt).toBe("2026-09-30T07:30:00.000Z");
  });

  it("splits two errands joined by en", () => {
    const result = interpretLocally("Bel de verzekering en koop melk", TUESDAY_NOON);
    expect(result.items.map((item) => item.title)).toEqual([
      "Bel de verzekering",
      "Koop melk",
    ]);
    expect(result.items.every((item) => item.kind === "taak")).toBe(true);
  });

  it("does not split the word morgen and still separates a second errand", () => {
    const result = interpretLocally(
      "Herinner me morgen om 9 uur om de verzekering te bellen. En koop melk.",
      TUESDAY_NOON,
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0].kind).toBe("herinnering");
    expect(result.items[0].title).toBe("De verzekering te bellen");
    expect(result.items[0].remindAt).toBe("2026-09-30T07:00:00.000Z");
    expect(result.items[1]).toMatchObject({ kind: "taak", title: "Koop melk" });
  });

  it("places a weekday appointment on the next matching day", () => {
    const result = interpretLocally("Vrijdag tandarts om 14:30", TUESDAY_NOON);
    expect(result.items[0].kind).toBe("herinnering");
    expect(result.items[0].title.toLowerCase()).toContain("tandarts");
    expect(result.items[0].remindAt).toBe("2026-10-02T12:30:00.000Z");
  });

  it("rolls an unspecified clock that already passed to tomorrow", () => {
    const result = interpretLocally("Om 9 uur bellen", TUESDAY_NOON);
    expect(result.items[0].kind).toBe("taak");
    expect(result.items[0].dueAt).toBe("2026-09-30T07:00:00.000Z");
  });
});
