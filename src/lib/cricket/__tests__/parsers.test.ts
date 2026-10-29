import { describe, expect, it } from "vitest";
import {
  isBcciGid,
  normalizeBcciImageUrl,
  normalizeBcciMatch,
  normalizeBcciPlayer,
  parseBcciPlayerFacts,
  type BffMatch,
  type BffPlayer,
} from "@/lib/cricket/providers/bcci";
import { parseIccPlayerDirectory } from "@/lib/cricket/providers/icc-players";
import { decodeIccFlight, iccPlayerImage, parseIccRankings } from "@/lib/cricket/providers/icc-rankings";

function match(overrides: Partial<BffMatch> = {}): BffMatch {
  return {
    id: "242111",
    gid: "f88ed94d-d276-4c4d-81b9-c8c8c8fa10ef",
    competitionName: "India in New Zealand",
    name: "New Zealand v India at Auckland, 4th T20I, 30 Oct 2026",
    title: "4th T20I",
    status: "fixtures",
    statusLabel: "Fixture",
    resultString: "",
    startDateTimeUtc: "2026-10-30T07:00:00Z",
    endDate: "2026-10-30",
    groundName: "Eden Park, Auckland",
    groundLocation: "Auckland",
    formatLabel: "T20I",
    teams: [
      {
        id: "5",
        name: "New Zealand",
        shortName: "New Zealand",
        abbreviation: "NZL",
        primaryColor: "141134",
        secondaryColor: "FCFCFC",
      },
      {
        id: "6",
        name: "India",
        shortName: "India",
        abbreviation: "IND",
        primaryColor: "28C2F5",
        secondaryColor: "28C2F5",
      },
    ],
    ...overrides,
  };
}

function player(overrides: Partial<BffPlayer> = {}): BffPlayer {
  return {
    playerGid: "352688d9-2f4c-4f66-a8fd-5538d4facaba",
    name: "Jasprit Bumrah",
    slug: "jasprit-bumrah",
    role: "Bowler",
    gender: "men",
    grade: "Grade A",
    style: "RHB",
    status: "active",
    imageUrl: "https://example.test/bumrah.png",
    ...overrides,
  };
}

describe("normalizeBcciMatch", () => {
  it("maps a men's fixture and its team colours", () => {
    const result = normalizeBcciMatch(match(), "men");
    expect(result).toMatchObject({
      gid: "f88ed94d-d276-4c4d-81b9-c8c8c8fa10ef",
      format: "T20I",
      status: "upcoming",
      venue: "Eden Park, Auckland",
      city: "Auckland",
      title: "4th T20I",
    });
    expect(result?.teams[1]).toMatchObject({ name: "India", primary: "#28C2F5" });
  });

  it("marks a match live only when the live feed names it", () => {
    const result = normalizeBcciMatch(
      match({ status: "live", statusLabel: "Live", resultString: "India are 141 for 3" }),
      "men",
      new Set(["f88ed94d-d276-4c4d-81b9-c8c8c8fa10ef"])
    );
    expect(result?.status).toBe("live");
    expect(result?.live).toBe(true);
    expect(result?.result).toBe("India are 141 for 3");
  });

  it("accepts a women's format label and rejects a match without the India side", () => {
    const women = normalizeBcciMatch(
      match({
        formatLabel: "Women's ODI",
        teams: [
          { ...match().teams[0], name: "India Women", shortName: "India W", abbreviation: "IND-W" },
          { ...match().teams[1], name: "Zimbabwe Women", shortName: "Zimbabwe W", abbreviation: "ZIM-W" },
        ],
      }),
      "women"
    );
    expect(women?.format).toBe("ODI");

    const elsewhere = normalizeBcciMatch(
      match({
        teams: [
          { ...match().teams[0], name: "Australia" },
          { ...match().teams[1], name: "England" },
        ],
      }),
      "men"
    );
    expect(elsewhere).toBeNull();
  });

  it("falls back to the competition name when BCCI has no match title", () => {
    const result = normalizeBcciMatch(
      match({ title: undefined, competitionName: "ICC Men's Cricket World Cup" }),
      "men"
    );
    expect(result?.title).toBe("ICC Men's Cricket World Cup");
  });
});

describe("BCCI player parsing", () => {
  it("normalises role, grade and gender", () => {
    expect(normalizeBcciPlayer(player())).toMatchObject({
      id: "352688d9-2f4c-4f66-a8fd-5538d4facaba",
      name: "Jasprit Bumrah",
      role: "Bowler",
      grade: "A",
      gender: "men",
      active: true,
    });
    expect(normalizeBcciPlayer(player({ role: "Wicket Keeper", gender: "women" }))?.role).toBe(
      "Wicketkeeper Batter"
    );
    expect(normalizeBcciPlayer(player({ role: "All Rounder" }))?.role).toBe("All-rounder");
    expect(
      normalizeBcciPlayer(player({ imageUrlSet: { small: "https://example.test/small.png" } }))?.imageUrl
    ).toBe("https://example.test/small.png");
  });

  it("unwraps BCCI's broken Next image URLs to the original portrait endpoint", () => {
    const wrapped =
      "https://www.bcci.tv/_next/image?url=%2Fapi%2Fteam-assets%3Fpathname%3Dsquad%252F65346.png%26brand%3Dbcci&w=384&q=75";
    expect(normalizeBcciImageUrl(wrapped)).toBe(
      "https://www.bcci.tv/_next/image?url=%2Fapi%2Fteam-assets%3Fpathname%3Dsquad%252F65346.png%26brand%3Dbcci&w=384&q=75"
    );
    expect(normalizeBcciImageUrl(null)).toBeNull();
  });

  it("reads the profile fact list from the public page", () => {
    const html = `
      <dl class="facts" data-testid="player-profile-facts">
        <div><dt>Role</dt><dd>Bowler</dd></div>
        <div><dt>Born</dt><dd>6 Dec 1993</dd></div>
        <div><dt>Bowling Style</dt><dd>Right Arm Fast Medium</dd></div>
        <div><dt>Batting Style</dt><dd>Right Handed</dd></div>
        <div><dt>National Debut</dt><dd>Test: 2018 &middot; ODI: 2016</dd></div>
      </dl>`;
    expect(parseBcciPlayerFacts(html)).toEqual({
      born: "6 Dec 1993",
      battingStyle: "Right Handed",
      bowlingStyle: "Right Arm Fast Medium",
      debut: "Test: 2018 · ODI: 2016",
    });
    expect(parseBcciPlayerFacts("<html></html>")).toBeNull();
  });

  it("validates BCCI identifiers used by the routes", () => {
    expect(isBcciGid("352688d9-2f4c-4f66-a8fd-5538d4facaba")).toBe(true);
    expect(isBcciGid("not a gid")).toBe(false);
  });
});

describe("ICC rankings parsing", () => {
  const items = [
    {
      compType: "odi",
      data: {
        team: {
          "rank-type": "odi-team",
          rank_date: "2026-10-27",
          rank: [
            { no: "1", team_name: "India", shortname: "IND", Rating: "125", Points: "3000", change: "(+2)" },
            { no: "2", team_name: "Australia", shortname: "AUS", Rating: "119", Points: "2800", change: "(-1)" },
          ],
        },
        batting: {
          "rank-type": "odi-batting",
          rank_date: "2026-10-27",
          rank: [
            {
              no: "1",
              "Player-name": "Shubman Gill",
              Player_id: "66818",
              Country: "IND",
              team_name: "India",
              Points: "830",
            },
          ],
        },
      },
    },
    {
      compType: "odiw",
      data: {
        batting: {
          "rank-type": "odiw-batting",
          rank_date: "2026-10-27",
          rank: [
            { no: "1", "Player-name": "Smriti Mandhana", Country: "IND", team_name: "India Women", Points: "800" },
          ],
        },
      },
    },
  ];

  const flight = `18:["$","div",null,{"items":${JSON.stringify(items)}}]`;
  const html = `<html><body><script>self.__next_f.push(${JSON.stringify([1, flight])})</script></body></html>`;

  it("decodes the RSC flight payload", () => {
    expect(decodeIccFlight(html)).toContain('"items"');
  });

  it("builds men's team and batting tables", () => {
    const sets = parseIccRankings(html);
    const men = sets.find((set) => set.gender === "men" && set.format === "ODI");
    expect(men?.asOf).toBe("2026-10-27");
    expect(men?.team[0]).toMatchObject({
      position: 1,
      name: "India",
      code: "IND",
      rating: 125,
      points: 3000,
      change: 2,
    });
    expect(men?.team[1].change).toBe(-1);
    expect(men?.batting[0]).toMatchObject({
      position: 1,
      name: "Shubman Gill",
      teamCode: "IND",
      rating: 830,
      imageUrl:
        "https://images.icc-cricket.com/image/upload/t_player-face/prd/assets/players/generic/colored/66818.png",
    });
  });

  it("only builds ICC portraits for numeric player ids", () => {
    expect(iccPlayerImage("66818")).toContain("/66818.png");
    expect(iccPlayerImage("")).toBeNull();
    expect(iccPlayerImage("not-an-id")).toBeNull();
  });

  it("keeps women's tables separate and names the side", () => {
    const sets = parseIccRankings(html);
    const women = sets.find((set) => set.gender === "women" && set.format === "ODI");
    expect(women?.batting[0]).toMatchObject({
      name: "Smriti Mandhana",
      team: "India Women",
      rating: 800,
    });
    expect(women?.team).toEqual([]);
  });

  it("returns an empty list for an unrecognised page", () => {
    expect(parseIccRankings("<html></html>")).toEqual([]);
  });
});

describe("ICC player directory", () => {
  it("builds portraits from unambiguous ICC player ids", () => {
    const photos = parseIccPlayerDirectory([
      { id: "64511", name: "Avesh Khan" },
      { id: "70723", name: "Minnu Mani" },
      { id: "not-an-id", name: "Ignored Player" },
      { name: "No Id" },
    ]);

    expect(photos.get("avesh khan")).toContain("/64511.png");
    expect(photos.get("minnu mani")).toContain("/70723.png");
    expect(photos.has("ignored player")).toBe(false);
  });

  it("does not guess when two players share a name", () => {
    const photos = parseIccPlayerDirectory([
      { id: "2704", name: "Chetan Sharma" },
      { id: "126954", name: "Chetan Sharma" },
      { id: "84308", name: "Anushka Sharma" },
    ]);

    expect(photos.has("chetan sharma")).toBe(false);
    expect(photos.has("anushka sharma")).toBe(true);
  });

  it("falls back to the full name when the display name is absent", () => {
    const photos = parseIccPlayerDirectory([{ id: "112786", full_name: "Prema Rawat" }]);
    expect(photos.get("prema rawat")).toContain("/112786.png");
  });
});
