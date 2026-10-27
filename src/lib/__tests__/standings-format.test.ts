import { describe, expect, it } from "vitest";
import { gapFmt, pctFmt, pointsFmt, signedFmt, surname, teamCode } from "@/components/f1/standings/parts";

// The standings UI formats official points and gaps; these guards protect the
// half-point case (Spa 2021), the minus sign and the constructor labels.

describe("standings formatting", () => {
  it("prints whole and half points without trailing zeros", () => {
    expect(pointsFmt(365)).toBe("365");
    expect(pointsFmt(0)).toBe("0");
    expect(pointsFmt(0.5)).toBe("0.5");
    expect(pointsFmt(12.34)).toBe("12.3");
    expect(pointsFmt(Number.NaN)).toBe("—");
  });

  it("formats gaps behind the leader and keeps ties at zero", () => {
    expect(gapFmt(-123)).toBe("−123");
    expect(gapFmt(0)).toBe("0");
    expect(gapFmt(7)).toBe("+7");
    expect(gapFmt(-0.5)).toBe("−0.5");
    expect(gapFmt(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("signs positive changes and percentages", () => {
    expect(signedFmt(3)).toBe("+3");
    expect(signedFmt(-3)).toBe("-3");
    expect(signedFmt(0)).toBe("0");
    expect(pctFmt(88.888)).toBe("89%");
    expect(pctFmt(5.555)).toBe("5.6%");
  });

  it("shows surnames in the standings table", () => {
    expect(surname("Andrea Kimi Antonelli")).toBe("Antonelli");
    expect(surname("Max Verstappen")).toBe("Verstappen");
    expect(surname("Verstappen")).toBe("Verstappen");
  });

  it("maps known constructors to stable three-letter codes", () => {
    expect(teamCode("Mercedes")).toBe("MER");
    expect(teamCode("Red Bull Racing")).toBe("RBR");
    expect(teamCode("Racing Bulls")).toBe("VRB");
    expect(teamCode("Haas F1 Team")).toBe("HAA");
    expect(teamCode("Brawn GP")).toBe("BRA");
  });
});
