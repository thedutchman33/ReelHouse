import { describe, expect, it } from "vitest";
import {
  GAME_ASSETS_LABEL,
  isPopularTitle,
  parseBitrunlogGames,
  parseBitrunlogUpdatedAt,
} from "@/lib/games";

// ---------------------------------------------------------------------------
// The games page mirrors bitrunlog.com game for game, and its catalogue is the
// embedded JSON array between the AUTO_GAMES markers. This parser is the
// boundary: only http(s) play links, no duplicates, no source rows without a
// title, and the directory's own relative art resolved against the screenshots
// repo.
// ---------------------------------------------------------------------------

const ENTRIES = [
  {
    id: "quake-iii-arena",
    name: "Quake III Arena (q3js)",
    image: "screenshots/quake-iii-arena.jpg",
    url: "https://q3js.com/",
    platform: "PC",
    facts: ["plays instantly", "multiplayer"],
    mark: "QIA",
    tag: "SHOOTER",
    sourceId: "submitgame-decomp",
  },
  {
    id: "gta-paris",
    name: "GTA Paris Online – Beta",
    image:
      "https://mindblown-prod-public.s3.us-east-1.amazonaws.com/game-art/gta-paris.jpg",
    url: "https://play.gtaonx.com/?mode=sandbox&low=1&fps=30&res=800x450&cores=2",
    platform: "Browser",
    facts: ["browser launch"],
    mark: "GTA",
    tag: "OPEN WORLD",
  },
  {
    id: "zelda-byo",
    name: "Zelda II: The Adventure of Link (z2rs)",
    image: "../../secrets.jpg",
    url: "https://www.z2rs.com/",
    platform: "NES",
    facts: ["needs your game files"],
    mark: "ZIT",
    tag: "CLASSIC",
    sourceId: "submitgame-decomp",
  },
  {
    id: "demo",
    name: "Half-Life and Counter-Strike 1.6 (WebXash)",
    image: null,
    url: "http://x8bitrain.github.io/webXash/",
    platform: "PC",
    facts: ["free demo, no game files needed"],
    mark: "HLX",
    tag: "FPS",
  },
  {
    id: "duplicate",
    name: "Quake III Arena duplicate",
    image: "screenshots/quake-iii-arena.jpg",
    url: "https://www.q3js.com",
    platform: "PC",
    facts: [],
    mark: "QIA",
    tag: "SHOOTER",
  },
  {
    id: "bad-url",
    name: "Bad URL",
    image: null,
    url: "javascript:alert(1)",
    platform: "PC",
    facts: [],
    mark: "BAD",
    tag: "BAD",
  },
  {
    id: "no-title",
    name: "   ",
    image: null,
    url: "https://example.test/",
    platform: "PC",
    facts: [],
    mark: "NOT",
    tag: "NONE",
  },
];

const PAGE = `<!doctype html><html><body>
<script>
const games=/* AUTO_GAMES_START */${JSON.stringify(ENTRIES)}/* AUTO_GAMES_END */;
const sourceGeneratedAt=/* AUTO_SOURCE_DATE_START */"2026-10-29T07:45:06.976Z"/* AUTO_SOURCE_DATE_END */;
</script>
</body></html>`;

describe("parseBitrunlogGames", () => {
  const games = parseBitrunlogGames(PAGE);

  it("reads the embedded catalogue and drops unusable rows", () => {
    expect(games.map((game) => game.title)).toEqual([
      "Quake III Arena (q3js)",
      "GTA Paris Online – Beta",
      "Zelda II: The Adventure of Link (z2rs)",
      "Half-Life and Counter-Strike 1.6 (WebXash)",
      "Quake III Arena duplicate",
    ]);
  });

  it("maps the decomp entry, its art and its tags", () => {
    const quake = games[0];
    expect(quake.platform).toBe("PC");
    expect(quake.url).toBe("https://q3js.com/");
    expect(quake.assets).toBe("instant");
    expect(quake.multiplayer).toBe(true);
    expect(quake.screenshotUrl).toBe(
      "https://raw.githubusercontent.com/SubmitGame/awesome-decomp-games/main/screenshots/quake-iii-arena.jpg"
    );
  });

  it("keeps the site's own extra picks and absolute art", () => {
    const gta = games[1];
    expect(gta.title).toBe("GTA Paris Online – Beta");
    expect(gta.url).toBe(
      "https://play.gtaonx.com/?mode=sandbox&low=1&fps=30&res=800x450&cores=2"
    );
    expect(gta.screenshotUrl).toBe(
      "https://mindblown-prod-public.s3.us-east-1.amazonaws.com/game-art/gta-paris.jpg"
    );
    expect(gta.multiplayer).toBe(false);
  });

  it("maps asset requirements", () => {
    expect(games[2].assets).toBe("byo");
    expect(games[3].assets).toBe("demo");
    expect(GAME_ASSETS_LABEL.instant).toBe("Plays instantly");
    expect(GAME_ASSETS_LABEL.byo).toBe("Needs your game files");
    expect(GAME_ASSETS_LABEL.demo).toBe("Free demo included");
    expect(GAME_ASSETS_LABEL.unknown).toBe("May need game files");
  });

  it("drops path traversal in art", () => {
    expect(games[2].screenshotUrl).toBeNull();
  });

  it("keeps every row the source lists, even two titles for one URL", () => {
    // bitrunlog shows mirrors/regional pages as separate cards; matching its
    // list game for game means keeping them, with unique React keys.
    const quake = games.filter((game) => /q3js\.com/.test(game.url));
    expect(quake).toHaveLength(2);
    expect(new Set(games.map((game) => game.id)).size).toBe(games.length);
  });

  it("returns nothing for a page without the catalogue", () => {
    expect(parseBitrunlogGames("<html><body>no catalogue</body></html>")).toEqual(
      []
    );
    expect(
      parseBitrunlogGames("/* AUTO_GAMES_START */not json/* AUTO_GAMES_END */")
    ).toEqual([]);
  });
});

describe("isPopularTitle", () => {
  it("marks the marquee franchises the page's default view shows", () => {
    expect(isPopularTitle("GTA Paris Online - Beta")).toBe(true);
    expect(isPopularTitle("Grand Theft Auto III")).toBe(true);
    expect(isPopularTitle("Call of Duty: Modern Warfare 2")).toBe(true);
    expect(isPopularTitle("Moon (Black Ops Zombies, vel.gg)")).toBe(true);
    expect(isPopularTitle("Minecraft 1.8.8 (EaglercraftX)")).toBe(true);
    expect(isPopularTitle("PES 6 Web Online Port")).toBe(true);
  });

  it("leaves the long tail out of it", () => {
    expect(isPopularTitle("Teleoperator")).toBe(false);
    expect(isPopularTitle("derby")).toBe(false);
    expect(isPopularTitle("d2o")).toBe(false);
  });

  it("labels entries while parsing", () => {
    const games = parseBitrunlogGames(PAGE);
    expect(games[1].popular).toBe(true);
    expect(games[4].popular).toBe(true);
  });
});

describe("parseBitrunlogUpdatedAt", () => {
  it("reads the catalogue timestamp", () => {
    expect(parseBitrunlogUpdatedAt(PAGE)).toBe("2026-10-29T07:45:06.976Z");
  });

  it("returns null when the page has no timestamp", () => {
    expect(parseBitrunlogUpdatedAt("<html></html>")).toBeNull();
  });
});
