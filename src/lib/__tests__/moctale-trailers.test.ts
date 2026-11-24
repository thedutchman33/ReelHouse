import { describe, expect, it } from "vitest";
import {
  extractMoctaleSpacesPayload,
  parseMoctaleSpacesFeed,
  parseMoctaleTrailerPost,
  type MoctaleSpacesPayload,
} from "@/lib/moctale-trailers";

const PAYLOAD: MoctaleSpacesPayload = {
  current_page: 1,
  next_page: 2,
  previous_page: null,
  data: [
    {
      id: "mr-irrelevant-post",
      post_type: "YOUTUBE",
      published_at: "2026-11-24T03:30:00",
      author_name: "Kshamik V",
      data: {
        title: "mr irrelevant new trailer",
        description:
          "[Mr. Irrelevant](content:mr-irrelevant-2026) | New Trailer",
        youtube_id: "5DddMUVQ5xQ",
      },
    },
    {
      id: "avengers-post",
      post_type: "YOUTUBE",
      published_at: "2026-11-23T19:30:00",
      author_name: "Moctale Official",
      data: {
        title: "Avengers: Doomsday Final Trailer",
        description:
          "The final trailer for [Avengers: Doomsday](content:avengers-doomsday-2026) has been released.",
        youtube_id: "Wb8Tq_HD4E8",
      },
    },
    {
      id: "panchayat-post",
      post_type: "YOUTUBE",
      published_at: "2026-11-23T17:42:00",
      author_name: "Moctale Official",
      data: {
        title: "Panchayat Season 5 - Official Trailer",
        description:
          "[Panchayat](content:panchayat-2020) Season 5 - Official Trailer",
        youtube_id: "36a-E7A35F8",
      },
    },
  ],
};

describe("Moctale trailer feed", () => {
  it("keeps Moctale's post order and parses titles from the linked content", () => {
    const feed = parseMoctaleSpacesFeed(PAYLOAD, "all");

    expect(feed).not.toBeNull();
    expect(feed?.items.map((item) => item.title)).toEqual([
      "Mr. Irrelevant",
      "Avengers: Doomsday",
      "Panchayat",
    ]);
    expect(feed?.items[0]?.trailerName).toBe("New Trailer");
    expect(feed?.items[0]?.youtubeKey).toBe("5DddMUVQ5xQ");
    expect(feed?.items[1]?.trailerName).toBe("Final Trailer");
    expect(feed?.items[2]?.type).toBe("tv");
    expect(feed?.items[2]?.year).toBe("2020");
    expect(feed?.items[0]?.publishedAt).toBe("2026-11-24T03:30:00");
    expect(feed?.page).toBe(1);
    expect(feed?.totalPages).toBe(2);
  });

  it("uses the requested kind to filter inferred series and movies", () => {
    const movies = parseMoctaleSpacesFeed(PAYLOAD, "movie");
    const series = parseMoctaleSpacesFeed(PAYLOAD, "tv");

    expect(movies?.items.map((item) => item.title)).toEqual([
      "Mr. Irrelevant",
      "Avengers: Doomsday",
    ]);
    expect(series?.items.map((item) => item.title)).toEqual(["Panchayat"]);
  });

  it("marks teasers and announcements as non-official trailers", () => {
    const teaser = parseMoctaleTrailerPost({
      post_type: "YOUTUBE",
      published_at: "2026-11-23T00:30:00",
      data: {
        title: "Jhimma 3 teaser",
        description: "[Jhimma 3](content:jhimma-3-2027) | Official Teaser",
        youtube_id: "Qg5fxOR4Qaw",
      },
    });
    const announcement = parseMoctaleTrailerPost({
      post_type: "YOUTUBE",
      data: {
        title: "Kaaliya announcement",
        description: "[Kaaliya](content:kaaliya-2028) | Announcement",
        youtube_id: "XZEHnZgfhjk",
      },
    });

    expect(teaser?.official).toBe(false);
    expect(announcement?.official).toBe(false);
  });

  it("extracts the escaped initialData payload from the Spaces page", () => {
    const escaped = JSON.stringify(PAYLOAD).replace(/"/g, '\\"');
    const html = `<!doctype html><script>self.__next_f.push([1,"18:{\\"initialData\\":${escaped}}"])</script>`;

    const parsed = extractMoctaleSpacesPayload(html);

    expect(parsed?.current_page).toBe(1);
    expect(parsed?.data).toHaveLength(3);
    expect(parsed?.data?.[0]?.data?.youtube_id).toBe("5DddMUVQ5xQ");
  });

  it("returns null for login pages and empty feeds", () => {
    expect(extractMoctaleSpacesPayload("<html>Login | Moctale</html>")).toBeNull();
    expect(
      parseMoctaleSpacesFeed({ current_page: 1, data: [] }, "all")
    ).toBeNull();
  });
});
