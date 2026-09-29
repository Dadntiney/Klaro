import { describe, expect, it } from "vitest";
import { formatWhen, fromDateTimeLocal, zonedTimeToUtc } from "./time";

describe("zonedTimeToUtc", () => {
  it("converts a summer afternoon in Amsterdam to UTC", () => {
    expect(zonedTimeToUtc(2026, 9, 30, 9, 0).toISOString()).toBe(
      "2026-09-30T07:00:00.000Z",
    );
  });

  it("converts a winter morning in Amsterdam to UTC", () => {
    expect(zonedTimeToUtc(2026, 1, 16, 9, 30).toISOString()).toBe(
      "2026-01-16T08:30:00.000Z",
    );
  });
});

describe("fromDateTimeLocal", () => {
  it("reads a datetime-local value as Amsterdam wall time", () => {
    expect(fromDateTimeLocal("2026-09-30T09:00")).toBe("2026-09-30T07:00:00.000Z");
  });

  it("rejects incomplete values", () => {
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("morgen")).toBeNull();
  });
});

describe("formatWhen", () => {
  it("labels today and tomorrow in Dutch", () => {
    const now = new Date("2026-09-29T10:00:00.000Z");
    expect(formatWhen("2026-09-29T07:00:00.000Z", now)).toBe("vandaag 09:00");
    expect(formatWhen("2026-09-30T07:00:00.000Z", now)).toBe("morgen 09:00");
  });
});
