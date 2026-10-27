import { describe, expect, it } from "vitest";
import { orderByClassification } from "@/lib/f1-classification";

type Row = { acronym: string; best: number | null; position?: number | null };

const fp1Rows: Row[] = [
  // The lap feed gives VER a 1:35.860 that official timing deleted; the
  // classification still places him second behind LEC.
  { acronym: "LEC", best: 96.052, position: 1 },
  { acronym: "VER", best: 95.86, position: 2 },
  { acronym: "NOR", best: 96.297, position: 3 },
  { acronym: "HER", best: null, position: 22 },
];

describe("orderByClassification", () => {
  it("keeps the official position even when a lap time is faster", () => {
    expect(orderByClassification(fp1Rows).map((r) => r.acronym)).toEqual([
      "LEC",
      "VER",
      "NOR",
      "HER",
    ]);
  });

  it("falls back to best lap when the session has no positions", () => {
    const rows: Row[] = [
      { acronym: "LEC", best: 96.052 },
      { acronym: "VER", best: 95.86 },
      { acronym: "NOR", best: 96.297 },
      { acronym: "HER", best: null },
    ];
    expect(orderByClassification(rows).map((r) => r.acronym)).toEqual([
      "VER",
      "LEC",
      "NOR",
      "HER",
    ]);
  });

  it("puts rows without a position after classified ones", () => {
    const rows: Row[] = [
      { acronym: "NOR", best: 96.3, position: null },
      { acronym: "LEC", best: 96.052, position: 1 },
    ];
    expect(orderByClassification(rows).map((r) => r.acronym)).toEqual(["LEC", "NOR"]);
  });

  it("does not mutate the caller's array", () => {
    const copy = [...fp1Rows];
    orderByClassification(fp1Rows);
    expect(fp1Rows).toEqual(copy);
  });
});
