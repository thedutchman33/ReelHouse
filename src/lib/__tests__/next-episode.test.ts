import { describe, expect, it } from "vitest";
import { nextAiredEpisode } from "@/lib/next-episode";
import type { Episode, Season } from "@/types";

const ep = (
  seasonNumber: number,
  episodeNumber: number,
  airDate?: string,
  extra: Partial<Episode> = {}
): Episode => ({
  id: `s${seasonNumber}e${episodeNumber}`,
  seasonNumber,
  episodeNumber,
  title: `Episode ${episodeNumber}`,
  ...(airDate ? { airDate } : {}),
  ...extra,
});

const season = (seasonNumber: number, episodes: Episode[]): Season => ({
  seasonNumber,
  name: `Season ${seasonNumber}`,
  episodeCount: episodes.length,
  episodes,
});

const TODAY = "2026-11-16";

describe("nextAiredEpisode", () => {
  it("returns the next episode in the same season when it has aired", () => {
    const seasons = [
      season(1, [ep(1, 1, "2026-01-01"), ep(1, 2, "2026-01-08")]),
    ];
    expect(nextAiredEpisode(seasons, 1, 1, { today: TODAY })).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
      title: "Episode 2",
      airDate: "2026-01-08",
    });
  });

  it("does not skip an unaired episode to reach the next season", () => {
    const seasons = [
      season(1, [ep(1, 1, "2026-01-01"), ep(1, 2, "2026-12-01")]),
      season(2, [ep(2, 1, "2026-01-01")]),
    ];
    expect(nextAiredEpisode(seasons, 1, 1, { today: TODAY })).toBeNull();
  });

  it("rolls a finished finale into the next season's first episode", () => {
    const seasons = [
      season(1, [ep(1, 1, "2026-01-01")]),
      season(2, [ep(2, 1, "2026-02-01", { stillUrl: "still.jpg" })]),
    ];
    expect(nextAiredEpisode(seasons, 1, 1, { today: TODAY })).toMatchObject({
      seasonNumber: 2,
      episodeNumber: 1,
      stillUrl: "still.jpg",
    });
  });

  it("stays put when the next season has not started", () => {
    const seasons = [
      season(1, [ep(1, 1, "2026-01-01")]),
      season(2, [ep(2, 1, "2027-01-01")]),
    ];
    expect(nextAiredEpisode(seasons, 1, 1, { today: TODAY })).toBeNull();
  });

  it("requires an air date for TV episodes", () => {
    const seasons = [season(1, [ep(1, 1, "2026-01-01"), ep(1, 2)])];
    expect(nextAiredEpisode(seasons, 1, 1, { today: TODAY })).toBeNull();
  });

  it("treats an undated episode as available for AniList anime", () => {
    const seasons = [season(1, [ep(1, 1), ep(1, 2)])];
    expect(
      nextAiredEpisode(seasons, 1, 1, { today: TODAY, allowUndated: true })
    ).toMatchObject({ seasonNumber: 1, episodeNumber: 2 });
  });

  it("returns null when the episode itself is not in the season", () => {
    const seasons = [season(1, [ep(1, 1, "2026-01-01")])];
    expect(nextAiredEpisode(seasons, 1, 9, { today: TODAY })).toBeNull();
    expect(nextAiredEpisode(seasons, 2, 1, { today: TODAY })).toBeNull();
  });

  it("returns null at the end of the last season", () => {
    const seasons = [season(1, [ep(1, 1, "2026-01-01")])];
    expect(nextAiredEpisode(seasons, 1, 1, { today: TODAY })).toBeNull();
  });
});
