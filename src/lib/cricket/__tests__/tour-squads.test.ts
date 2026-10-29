import { describe, expect, it } from "vitest";
import {
  parseTourSquads,
  squadTeamName,
  tourSeason,
} from "@/lib/cricket/providers/wikipedia-squads";

const WIKITEXT = `==Squads==
{| class="wikitable" style="text-align:center; margin:auto"
|-
!colspan=3|{{cr|NZ}}
!colspan=3|{{cr|IND}}
|-
! Tests
! ODIs<ref>NZC announcement</ref>
! T20Is
! Tests<ref>ICC announcement</ref>
! ODIs
! T20Is
|- style="vertical-align:top"
|
*
|
* [[Mitchell Santner]] ([[captain (cricket)|c]])
* [[Finn Allen]]{{Efn|name=ODI4&5|Only for 4th and 5th ODIs}}
* <s>[[Mark Chapman (cricketer)|Mark Chapman]]</s>
|
* [[Mitchell Santner]] ([[captain (cricket)|c]])
* [[Michael Bracewell (cricketer)|Michael Bracewell]]
* [[Devon Conway]] ([[Wicket-keeper|wk]])
|
*
|
* [[Shreyas Iyer]] ([[Captain (cricket)|c]])
|
* [[Rohit Sharma]] ([[captain (cricket)|c]])
* [[Shubman Gill]] ([[Captain (cricket)#Vice-captain|vc]])
* [[Rishabh Pant]] ([[Wicket-keeper|wk]])
|}

==Tour matches==
`;

describe("parseTourSquads", () => {
  it("reads only the populated format columns for both teams", () => {
    const squads = parseTourSquads(WIKITEXT);
    expect(squads.map((squad) => `${squad.teamCode}:${squad.format}:${squad.players.length}`)).toEqual([
      "NZ:ODI:2",
      "NZ:T20I:3",
      "IND:ODI:1",
      "IND:T20I:3",
    ]);
  });

  it("cleans links, templates and withdrawals", () => {
    const t20 = parseTourSquads(WIKITEXT).find(
      (squad) => squad.teamCode === "NZ" && squad.format === "T20I"
    );
    expect(t20?.players.map((player) => player.name)).toEqual([
      "Mitchell Santner",
      "Michael Bracewell",
      "Devon Conway",
    ]);
  });

  it("keeps captain and wicketkeeper flags", () => {
    const t20 = parseTourSquads(WIKITEXT).find(
      (squad) => squad.teamCode === "NZ" && squad.format === "T20I"
    );
    expect(t20?.players.filter((player) => player.captain).map((player) => player.name)).toEqual([
      "Mitchell Santner",
    ]);
    expect(t20?.players.filter((player) => player.wicketkeeper).map((player) => player.name)).toEqual([
      "Devon Conway",
    ]);
  });

  it("does not read a vice-captain as the captain", () => {
    const t20 = parseTourSquads(WIKITEXT).find(
      (squad) => squad.teamCode === "IND" && squad.format === "T20I"
    );
    expect(t20?.players.find((player) => player.name === "Rohit Sharma")?.captain).toBe(true);
    const gill = t20?.players.find((player) => player.name === "Shubman Gill");
    expect(gill?.captain).toBe(false);
    expect(gill?.viceCaptain).toBe(true);
  });

  it("returns nothing when the article has no squads table", () => {
    expect(parseTourSquads("==Tour matches==\nNo table here")).toEqual([]);
  });
});

describe("tourSeason", () => {
  it("starts the season in July", () => {
    expect(tourSeason("2026-10-30T07:00:00Z")).toBe("2026\u201327");
    expect(tourSeason("2027-03-01T00:00:00Z")).toBe("2026\u201327");
    expect(tourSeason("2026-06-30T00:00:00Z")).toBe("2025\u201326");
  });
});

describe("squadTeamName", () => {
  it("maps ICC member codes to the names the page renders", () => {
    expect(squadTeamName("IND")).toBe("India");
    expect(squadTeamName("nz")).toBe("New Zealand");
    expect(squadTeamName("XXX")).toBeNull();
  });
});
