import { describe, expect, it } from "vitest";
import {
  buildTrackingNotifications,
  daysUntil,
  episodeWhen,
  followingGroupFor,
  trackedTmdbIds,
  type TrackedEpisodeInfo,
  type TrackedShowStatus,
} from "@/lib/tracking";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// Following (tracking) rules: calendar matching, timeline grouping and the
// derived notification copy. These are pure, so they pin the behavior that the
// calendar, navbar badge and notification page all share.
// ---------------------------------------------------------------------------

const show: MediaSummary = {
  id: "tv-1399",
  tmdbId: 1399,
  type: "tv",
  title: "Severance",
  genres: ["Drama"],
};

const anime: MediaSummary = {
  id: "anime-21",
  tmdbId: 21,
  type: "anime",
  title: "One Piece",
  genres: ["Action"],
  resolvedTmdbId: 37854,
};

const unresolvedAnime: MediaSummary = {
  ...anime,
  id: "anime-999",
  tmdbId: 999,
  resolvedTmdbId: undefined,
};

const movie: MediaSummary = {
  id: "movie-550",
  tmdbId: 550,
  type: "movie",
  title: "Fight Club",
  genres: ["Drama"],
};

function status(overrides: Partial<TrackedShowStatus> = {}): TrackedShowStatus {
  return {
    tmdbId: 1399,
    name: "Severance",
    status: "Returning Series",
    nextEpisode: null,
    lastEpisode: null,
    monthEpisodes: [],
    ...overrides,
  };
}

describe("trackedTmdbIds", () => {
  it("matches series by tmdbId and anime by its resolved TMDB twin", () => {
    expect(trackedTmdbIds([{ media: show }, { media: anime }])).toEqual([
      1399, 37854,
    ]);
  });

  it("excludes movies, unresolved anime and duplicate ids", () => {
    expect(
      trackedTmdbIds([
        { media: movie },
        { media: unresolvedAnime },
        { media: show },
        { media: { ...show, id: "tv-other" } },
      ])
    ).toEqual([1399]);
  });

  it("caps the list at the request budget", () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      media: { ...show, id: `tv-${index}`, tmdbId: index + 1 },
    }));
    expect(trackedTmdbIds(entries, 2)).toEqual([1, 2]);
  });
});

describe("following timeline grouping", () => {
  const today = "2026-11-24";

  it("labels the near dates relative to today", () => {
    expect(followingGroupFor({ date: "2026-11-24", month: "2026-11", today })).toBe(
      "today"
    );
    expect(followingGroupFor({ date: "2026-11-25", month: "2026-11", today })).toBe(
      "tomorrow"
    );
    expect(followingGroupFor({ date: "2026-11-27", month: "2026-11", today })).toBe(
      "week"
    );
    expect(followingGroupFor({ date: "2026-11-30", month: "2026-11", today })).toBe(
      "week"
    );
    expect(followingGroupFor({ date: "2026-12-02", month: "2026-12", today })).toBe(
      "month"
    );
    expect(followingGroupFor({ date: "2027-01-05", month: "2026-11", today })).toBe(
      "later"
    );
    expect(followingGroupFor({ date: null, month: "2026-11", today })).toBe(
      "inactive"
    );
  });

  it("formats dates and countdowns", () => {
    expect(daysUntil("2026-11-27", "2026-11-24")).toBe(3);
    expect(episodeWhen("2026-11-24", "2026-11-24")).toBe("Today");
    expect(episodeWhen("2026-11-25", "2026-11-24")).toBe("Tomorrow");
    expect(episodeWhen("2026-11-27", "2026-11-24")).toBe("Friday");
  });
});

describe("following notifications", () => {
  const today = "2026-11-24";

  const episode = (
    overrides: Partial<TrackedEpisodeInfo> = {}
  ): TrackedEpisodeInfo => ({
    seasonNumber: 2,
    episodeNumber: 5,
    name: "The Long Room",
    airDate: today,
    ...overrides,
  });

  it("announces an episode released today, but not future or later episodes", () => {
    const items = buildTrackingNotifications({
      entries: [{ media: show }],
      shows: [
        status({
          lastEpisode: episode(),
          nextEpisode: episode({
            episodeNumber: 7,
            name: "Next Week",
            airDate: "2026-12-01",
          }),
          monthEpisodes: [
            episode(),
            episode({ episodeNumber: 6, name: "Later Today" }),
          ],
        }),
      ],
      progress: [],
      today,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "new",
      date: today,
      title: "New episode of Severance is out now",
      body: "S2 · E5 · The Long Room",
    });
  });

  it("does not announce a future episode before it airs", () => {
    const items = buildTrackingNotifications({
      entries: [{ media: show }],
      shows: [
        status({
          nextEpisode: episode({
            airDate: "2026-11-25",
            name: "Tomorrow",
          }),
        }),
      ],
      progress: [],
      today,
    });

    expect(items).toEqual([]);
  });

  it("does not announce a same-day episode TMDB has not marked as aired", () => {
    const items = buildTrackingNotifications({
      entries: [{ media: show }],
      shows: [
        status({
          lastEpisode: episode({ airDate: "2026-11-23" }),
          nextEpisode: episode(),
          monthEpisodes: [episode()],
        }),
      ],
      progress: [],
      today,
    });

    expect(items).toEqual([]);
  });

  it("does not keep an older release in the feed", () => {
    const items = buildTrackingNotifications({
      entries: [{ media: show }],
      shows: [
        status({
          lastEpisode: episode({
            airDate: "2026-11-23",
            name: "Yesterday",
          }),
        }),
      ],
      progress: [],
      today,
    });

    expect(items).toEqual([]);
  });

  it("honors the per-show alert preference on release day", () => {
    const shows = [status({ lastEpisode: episode() })];

    expect(
      buildTrackingNotifications({
        entries: [{ media: show, notify: "off" }],
        shows,
        progress: [],
        today,
      })
    ).toEqual([]);

    expect(
      buildTrackingNotifications({
        entries: [{ media: show, notify: "premieres" }],
        shows,
        progress: [],
        today,
      })
    ).toEqual([]);

    expect(
      buildTrackingNotifications({
        entries: [{ media: show, notify: "premieres" }],
        shows: [
          status({
            lastEpisode: episode({
              seasonNumber: 3,
              episodeNumber: 1,
              name: "Premiere",
            }),
          }),
        ],
        progress: [],
        today,
      })
    ).toHaveLength(1);
  });

  it("removes the released episode once it is in watch history", () => {
    const items = buildTrackingNotifications({
      entries: [{ media: show }],
      shows: [status({ lastEpisode: episode() })],
      progress: [
        {
          mediaId: show.id,
          updatedAt: new Date(2026, 10, 24, 14).getTime(),
          episode: { seasonNumber: 2, episodeNumber: 5 },
        },
      ],
      today,
    });

    expect(items).toEqual([]);
  });

  it("only removes the exact episode that was watched", () => {
    const items = buildTrackingNotifications({
      entries: [{ media: show }],
      shows: [
        status({
          lastEpisode: episode(),
          monthEpisodes: [
            episode({ episodeNumber: 4, name: "Earlier" }),
            episode(),
          ],
        }),
      ],
      progress: [
        {
          mediaId: show.id,
          updatedAt: new Date(2026, 10, 24, 13).getTime(),
          episode: { seasonNumber: 2, episodeNumber: 4 },
        },
      ],
      today,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      body: "S2 · E5 · The Long Room",
    });
  });
});
