import { describe, expect, it } from "vitest";
import {
  buildCalendarDays,
  episodeBadge,
  episodeSubtitle,
  filterFromType,
  kindForFilter,
  monthForOffset,
  monthKey,
  parseMonthOffset,
  resolveSelectedDate,
  shiftMonthKey,
  sortCalendarItems,
  todayKey,
  typeParamForFilter,
  type CalendarRelease,
} from "@/lib/calendar";

function release(
  overrides: Partial<CalendarRelease> & Pick<CalendarRelease, "date">
): CalendarRelease {
  return {
    id: overrides.id ?? `movie-${overrides.date}`,
    tmdbId: overrides.tmdbId ?? 1,
    type: overrides.type ?? "movie",
    kind: overrides.kind ?? "movie",
    title: overrides.title ?? "Title",
    ...overrides,
    date: overrides.date,
  };
}

describe("calendar month window", () => {
  it("clamps past offsets and accepts future ones", () => {
    expect(parseMonthOffset(undefined)).toBe(0);
    expect(parseMonthOffset("-2")).toBe(0);
    expect(parseMonthOffset("0")).toBe(0);
    expect(parseMonthOffset("3")).toBe(3);
    expect(parseMonthOffset("2.9")).toBe(2);
    expect(parseMonthOffset("nope")).toBe(0);
  });

  it("resolves m as an offset from the current month", () => {
    expect(monthForOffset(0)).toBe(monthKey());
    expect(monthForOffset(1)).toBe(shiftMonthKey(monthKey(), 1));
    expect(monthForOffset(12)).toBe(shiftMonthKey(monthKey(), 12));
  });
});

describe("calendar selected day", () => {
  it("defaults the current month to today and future months to day one", () => {
    expect(resolveSelectedDate(monthKey())).toBe(todayKey());
    expect(resolveSelectedDate("2099-04")).toBe("2099-04-01");
  });

  it("keeps a valid d inside the shown month only", () => {
    expect(resolveSelectedDate("2099-04", "2099-04-12")).toBe("2099-04-12");
    expect(resolveSelectedDate("2099-04", "2099-05-12")).toBe("2099-04-01");
    expect(resolveSelectedDate("2099-04", "not-a-date")).toBe("2099-04-01");
  });
});

describe("calendar grid", () => {
  it("is always a Monday-first six-row month", () => {
    const days = buildCalendarDays("2026-11", []);
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-10-26");
    expect(days[0].inMonth).toBe(false);
    expect(days.find((day) => day.date === "2026-11-01")?.inMonth).toBe(true);
    expect(days[41].date).toBe("2026-12-06");
  });

  it("places releases on their day", () => {
    const item = release({ date: "2026-11-03", title: "A" });
    const days = buildCalendarDays("2026-11", [item]);
    expect(days.find((day) => day.date === "2026-11-03")?.items).toEqual([item]);
    expect(days.find((day) => day.date === "2026-11-04")?.items).toEqual([]);
  });
});

describe("calendar filters", () => {
  const movie = release({ date: "2026-11-03", kind: "movie" });
  const series = release({ date: "2026-11-03", kind: "series", type: "tv" });
  const episode = release({ date: "2026-11-03", kind: "episode", type: "tv" });

  it("maps URL types to filters and back", () => {
    expect(filterFromType("movie")).toBe("movies");
    expect(filterFromType("tv")).toBe("series");
    expect(filterFromType("episode")).toBe("episodes");
    expect(filterFromType("tracking")).toBe("tracking");
    expect(filterFromType(null)).toBe("all");
    expect(typeParamForFilter("movies")).toBe("movie");
    expect(typeParamForFilter("series")).toBe("tv");
    expect(typeParamForFilter("episodes")).toBe("episode");
    expect(typeParamForFilter("all")).toBeNull();
  });

  it("matches kinds per filter", () => {
    expect(kindForFilter("all", movie)).toBe(true);
    expect(kindForFilter("movies", movie)).toBe(true);
    expect(kindForFilter("movies", series)).toBe(false);
    expect(kindForFilter("series", episode)).toBe(false);
    expect(kindForFilter("episodes", episode)).toBe(true);
  });

  it("shows only tracked episodes under the tracking filter", () => {
    const trackedEpisode = { ...episode, tracked: true };
    const trackedSeries = { ...series, tracked: true };
    expect(kindForFilter("tracking", trackedEpisode)).toBe(true);
    expect(kindForFilter("tracking", episode)).toBe(false);
    expect(kindForFilter("tracking", trackedSeries)).toBe(false);
    expect(kindForFilter("tracking", movie)).toBe(false);
  });
});

describe("calendar ordering", () => {
  it("orders by date, cards before episodes, then popularity", () => {
    const items = [
      release({ id: "late", date: "2026-11-04", popularity: 1 }),
      release({ id: "episode", date: "2026-11-03", kind: "episode", popularity: 100 }),
      release({ id: "movie-low", date: "2026-11-03", popularity: 1 }),
      release({ id: "movie-high", date: "2026-11-03", popularity: 50 }),
    ];
    expect(sortCalendarItems(items).map((item) => item.id)).toEqual([
      "movie-high",
      "movie-low",
      "episode",
      "late",
    ]);
  });
});

describe("episode groups", () => {
  const single = {
    seasonNumber: 1,
    episodeNumber: 7,
    lastEpisodeNumber: 7,
    count: 1,
    title: "Immolation",
  };
  const batch = {
    seasonNumber: 1,
    episodeNumber: 1,
    lastEpisodeNumber: 4,
    count: 4,
    title: "4 episodes",
  };

  it("labels single episodes and same-day ranges", () => {
    expect(episodeBadge(single)).toBe("S1 · E7");
    expect(episodeBadge(batch)).toBe("S1 · E1–4");
  });

  it("uses the title for one episode and the count for a batch", () => {
    expect(episodeSubtitle(single)).toBe("Immolation");
    expect(episodeSubtitle(batch)).toBe("4 episodes");
  });
});
