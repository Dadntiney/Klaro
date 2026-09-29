import { describe, expect, it } from "vitest";
import { narrateDay } from "./narrate";
import { composeAnswer, searchRecords, type SearchRecord } from "./search";

const records: SearchRecord[] = [
  {
    id: "1",
    kind: "document",
    title: "Polisblad auto 2026",
    body: "Autoverzekering Nationale Nederlanden",
    href: "/documenten/1",
    category: "verzekering",
    amountCents: 4200,
  },
  {
    id: "2",
    kind: "document",
    title: "Energiefactuur",
    body: "Vervaldatum 4 oktober",
    href: "/documenten/2",
    category: "factuur",
    amountCents: 14632,
    dueOn: "2026-10-04",
  },
];

describe("searchRecords", () => {
  it("finds a car policy without the exact title", () => {
    const hits = searchRecords("Waar staat mijn autoverzekering?", records);
    expect(hits[0]?.title).toBe("Polisblad auto 2026");
  });

  it("does not invent an answer when nothing matches", () => {
    expect(composeAnswer("Waar staat mijn gitaarles?", [], null)).toBe(
      "Ik kan dit niet terugvinden in je gegevens.",
    );
  });

  it("names the source of a found bill", () => {
    const hits = searchRecords("Waar staat mijn energiefactuur?", records);
    expect(composeAnswer("Waar staat mijn energiefactuur?", hits)).toContain("Energiefactuur");
  });
});

describe("narrateDay", () => {
  it("describes an empty day without adding plans", () => {
    expect(narrateDay([], new Date("2026-09-29T10:00:00.000Z"))).toBe("Je hebt vandaag niets gepland.");
  });
});
