import { describe, expect, it } from "vitest";
import type { MoctaleEvent } from "@/lib/moctale";
import {
  buildReleaseNotice,
  formatInterestedCount,
  formatReleaseDate,
  type ReleaseNoticeMedia,
} from "@/lib/release-notice";

const TODAY = "2026-11-24";

const THEATRICAL_EVENT: MoctaleEvent = {
  type: "MOVIE",
  releaseType: "NEW_MOVIE_THEATRE",
  date: "2026-12-17",
  interested: 63103,
  toBeConfirmed: false,
};

function media(overrides: Partial<ReleaseNoticeMedia> = {}): ReleaseNoticeMedia {
  return {
    type: "movie",
    releaseDate: "2026-12-16",
    ...overrides,
  };
}

describe("buildReleaseNotice", () => {
  it("prefers Moctale's theatrical date and interest count for an upcoming film", () => {
    expect(buildReleaseNotice(media(), [THEATRICAL_EVENT], TODAY)).toEqual({
      kind: "theaters",
      label: "Coming to Theaters",
      date: "2026-12-17",
      interested: 63103,
    });
  });

  it("falls back to TMDB's release date when Moctale has no event", () => {
    expect(buildReleaseNotice(media(), [], TODAY)).toMatchObject({
      kind: "theaters",
      date: "2026-12-16",
    });
  });

  it("is gone on the theatrical release day", () => {
    expect(
      buildReleaseNotice(media({ releaseDate: "2026-11-24" }), [], TODAY)
    ).toBeNull();
    expect(
      buildReleaseNotice(
        media(),
        [{ ...THEATRICAL_EVENT, date: TODAY }],
        TODAY
      )
    ).toBeNull();
  });

  it("shows the next airing episode for a currently airing series", () => {
    const airing = media({
      type: "tv",
      releaseDate: "2026-11-12",
      nextEpisodeToAir: {
        seasonNumber: 1,
        episodeNumber: 4,
        title: "That's How You Make a Boy Baby",
        overview:
          "Jack and Paul zero in on the same informant. Paul has a tense run-in.",
        airDate: "2026-11-26",
      },
    });

    expect(buildReleaseNotice(airing, [], TODAY)).toMatchObject({
      kind: "episode",
      label: "Next Episode",
      date: "2026-11-26",
      seasonNumber: 1,
      episode: {
        seasonNumber: 1,
        episodeNumber: 4,
        title: "That's How You Make a Boy Baby",
      },
    });
  });

  it("hides the episode notice on its air date", () => {
    const airingAtBoundary = media({
      type: "tv",
      releaseDate: "2026-11-12",
      nextEpisodeToAir: {
        seasonNumber: 1,
        episodeNumber: 4,
        title: "That's How You Make a Boy Baby",
        airDate: TODAY,
      },
    });

    expect(buildReleaseNotice(airingAtBoundary, [], TODAY)).toBeNull();
  });

  it("uses Series Premiere for a future series with no scheduled episode", () => {
    expect(
      buildReleaseNotice(
        media({ type: "tv", releaseDate: "2026-12-01", seasons: [] }),
        [],
        TODAY
      )
    ).toEqual({
      kind: "premiere",
      label: "Series Premiere",
      date: "2026-12-01",
    });
  });

  it("uses Next Season when a returning series has an announced season date", () => {
    const returning = media({
      type: "tv",
      releaseDate: "2024-05-01",
      seasons: [
        { seasonNumber: 1, name: "Season 1", airDate: "2024-05-01" },
        { seasonNumber: 2, name: "Season 2", airDate: "2026-12-05" },
      ],
    });
    const events: MoctaleEvent[] = [
      {
        date: "2026-12-05",
        interested: 1200,
        toBeConfirmed: false,
        releaseType: "NEW_SEASON",
      },
    ];

    expect(buildReleaseNotice(returning, events, TODAY)).toMatchObject({
      kind: "season",
      label: "Next Season",
      date: "2026-12-05",
      seasonNumber: 2,
      seasonName: "Season 2",
      interested: 1200,
    });
  });

  it("returns nothing for released films and series with no upcoming event", () => {
    expect(
      buildReleaseNotice(media({ releaseDate: "2026-11-20" }), [], TODAY)
    ).toBeNull();
    expect(
      buildReleaseNotice(
        media({
          type: "tv",
          releaseDate: "2020-01-01",
          seasons: [{ seasonNumber: 1, name: "Season 1", airDate: "2020-01-01" }],
        }),
        [],
        TODAY
      )
    ).toBeNull();
  });

  it("formats dates and compact interest counts the way the card needs", () => {
    expect(formatReleaseDate("2026-12-17")).toBe("December 17, 2026");
    expect(formatInterestedCount(63103)).toBe("63.1k");
    expect(formatInterestedCount(999)).toBe("999");
  });
});
