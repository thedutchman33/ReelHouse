import { describe, expect, it } from "vitest";
import {
  castOverlap,
  moctaleContentUrl,
  moctaleSimilarVibesUrl,
  moctaleSlug,
  moctaleTitleTokens,
  parseMoctalePage,
} from "@/lib/moctale";

describe("moctaleSlug", () => {
  it("builds the title-year path Moctale uses", () => {
    expect(moctaleSlug("Chainsaw Man: Reze Arc", "2025-10-24")).toBe(
      "chainsaw-man-reze-arc-2025"
    );
    expect(moctaleSlug("TVF Pitchers", "2015-06-10")).toBe("tvf-pitchers-2015");
  });

  it("normalizes punctuation and diacritics", () => {
    expect(moctaleSlug("Amélie", "2001-04-25")).toBe("amelie-2001");
    expect(moctaleSlug("Schindler's List", "1993-12-15")).toBe(
      "schindlers-list-1993"
    );
    expect(moctaleSlug("Fast & Furious", "2009-04-03")).toBe(
      "fast-and-furious-2009"
    );
  });

  it("links to the content and similar-vibes pages", () => {
    const media = { title: "Chhorii", releaseDate: "2021-11-26" };
    expect(moctaleContentUrl(media)).toBe(
      "https://www.moctale.in/content/chhorii-2021"
    );
    expect(moctaleSimilarVibesUrl(media)).toBe(
      "https://www.moctale.in/content/chhorii-2021/similar-vibe"
    );
  });
});

const MEDIA = {
  title: "Spider-Man: Brand New Day",
  releaseDate: "2026-07-31",
  type: "movie" as const,
};

function reviewMarkup({
  name,
  username,
  age = "2 days ago",
  verdict,
  color,
  likes,
  comments,
  text,
  avatar = "https://media.moctale.in/images/reviewer-1.jpg",
}: {
  name: string;
  username: string;
  age?: string;
  verdict: string;
  color: string;
  likes: number;
  comments: number;
  text: string;
  avatar?: string;
}) {
  return `<div class="flex flex-col gap-2 pb-3 border-b border-white/5">
    <div class="flex items-start gap-3">
      <div class="h-8 w-8 overflow-hidden rounded-full">
        <img src="${avatar}" alt="" class="w-full h-full object-cover"/>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-[#E2E2E2]">${name}</span>
          <span class="text-[10px] text-[#8A8A93]">@${username}<!-- --> • <!-- -->${age}</span>
        </div>
        <div>
          <div class="inline-flex items-center gap-1 rounded-full text-black font-bold px-2 py-0.5 text-xs " style="background-color:${color}">${verdict}</div>
        </div>
        <p class="text-xs text-[#CCCCCC] leading-relaxed line-clamp-2">${text}</p>
        <div class="flex items-center gap-3 text-[10px] text-[#8A8A93]">
          <span>❤️ <!-- -->${likes}<!-- --> Likes</span>
          <span>💬 <!-- -->${comments}<!-- --> Comments</span>
        </div>
      </div>
    </div>
  </div>`;
}

function pageHtml(overrides: Record<string, unknown> = {}) {
  const payload = {
    name: "Spider-Man: Brand New Day",
    year: 2026,
    is_show: false,
    banner: "https://media.moctale.in/images/hero.jpg",
    genre_list: [
      { name: "Action", slug: "action", color: "#bd0010", percentage: 35 },
      { name: "Drama", slug: "drama", color: "#7a503e", percentage: 20 },
      { name: "Romance", slug: "romance", color: "#fe486a", percentage: 10 },
      { name: "Sci-Fi", slug: "sci-fi", color: "#00b1b8", percentage: 10 },
      { name: "Mystery", slug: "mystery", color: "#5017ab", percentage: 10 },
      { name: "Thriller", slug: "thriller", color: "#0041a8", percentage: 10 },
      { name: "Comedy", slug: "comedy", color: "#ffc600", percentage: 5 },
    ],
    actor_list: [],
    count_total_review: 32479,
    count_perfect_review: 12321,
    count_positive_review: 19423,
    count_neutral_review: 664,
    count_negative_review: 71,
    percent_perfect_review: 37.94,
    percent_positive_review: 59.8,
    percent_neutral_review: 2.04,
    percent_negative_review: 0.22,
    ...overrides,
  };
  const flight = JSON.stringify(payload).replace(/"/g, '\\"');
  const reviews = [
    reviewMarkup({
      name: "Kavya Singh",
      username: "kavya_s",
      verdict: "Skip",
      color: "#fe647e",
      likes: 7,
      comments: 0,
      text: "A fourth review that must not displace the top three.",
      avatar: "https://media.moctale.in/images/reviewer-4.jpg",
    }),
    reviewMarkup({
      name: "Priya Patel",
      username: "priya_reviews",
      age: "5 days ago",
      verdict: "Go For It",
      color: "#00d391",
      likes: 29,
      comments: 3,
      text: "The chemistry is the whole movie &amp; it works.",
      avatar: "https://media.moctale.in/images/reviewer-2.jpg",
    }),
    reviewMarkup({
      name: "Aarav Sharma",
      username: "aarav_cinema",
      verdict: "Perfection",
      color: "#B048FF",
      likes: 42,
      comments: 8,
      text: "A web-swinging crowd pleaser.",
      avatar: "https://media.moctale.in/images/reviewer-1.jpg",
    }),
    reviewMarkup({
      name: "Rohan Mehta",
      username: "rohan_m",
      age: "1 week ago",
      verdict: "Timepass",
      color: "#fcb700",
      likes: 14,
      comments: 1,
      text: "Fun while it lasts.",
      avatar: "https://media.moctale.in/images/reviewer-3.jpg",
    }),
  ].join("");

  return `<script>self.__next_f.push([1,"\\"initialContent\\":${flight}"])</script>${reviews}`;
}

describe("parseMoctalePage", () => {
  it("reads the exact public vibe and meter payload", () => {
    const snapshot = parseMoctalePage(pageHtml(), MEDIA);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.title).toBe("Spider-Man: Brand New Day");
    expect(snapshot?.year).toBe(2026);
    expect(snapshot?.bannerUrl).toBe(
      "https://media.moctale.in/images/hero.jpg"
    );
    expect(snapshot?.vibes).toHaveLength(7);
    expect(snapshot?.vibes[0]).toEqual({
      label: "Action",
      slug: "action",
      percent: 35,
      color: "#bd0010",
    });
    expect(snapshot?.meter.score).toBe(60);
    expect(snapshot?.meter.top.key).toBe("go-for-it");
    expect(snapshot?.meter.totalVotes).toBe(32479);
    expect(
      snapshot?.meter.buckets.map((bucket) => [
        bucket.key,
        bucket.percent,
        bucket.votes,
      ])
    ).toEqual([
      ["skip", 0.22, 71],
      ["timepass", 2.04, 664],
      ["go-for-it", 59.8, 19423],
      ["perfection", 37.94, 12321],
    ]);
    expect(snapshot?.similarUrl).toBe(
      "https://www.moctale.in/content/spider-man-brand-new-day-2026/similar-vibe"
    );
  });

  it("keeps meter and review data on pages with no vibe genres", () => {
    const snapshot = parseMoctalePage(pageHtml({ genre_list: [] }), MEDIA);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.vibes).toEqual([]);
    expect(snapshot?.meter.totalVotes).toBe(32479);
    expect(snapshot?.bannerUrl).toBe(
      "https://media.moctale.in/images/hero.jpg"
    );
  });

  it("keeps only the three most-liked reviews, in order", () => {
    const snapshot = parseMoctalePage(pageHtml(), MEDIA);

    expect(snapshot?.reviews.map((review) => review.name)).toEqual([
      "Aarav Sharma",
      "Priya Patel",
      "Rohan Mehta",
    ]);
    expect(snapshot?.reviews[0]).toMatchObject({
      username: "aarav_cinema",
      likes: 42,
      comments: 8,
      verdict: "Perfection",
      verdictColor: "#B048FF",
      age: "2 days ago",
      avatarUrl: "https://media.moctale.in/images/reviewer-1.jpg",
    });
    expect(snapshot?.reviews[1]?.text).toBe(
      "The chemistry is the whole movie & it works."
    );
  });

  it("drops Moctale's signed-out demo reviews instead of showing them", () => {
    const locked = `${pageHtml()}<div>Create an account to see reviews for Spider-Man</div>`;
    const snapshot = parseMoctalePage(locked, MEDIA);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.reviewsLocked).toBe(true);
    expect(snapshot?.reviews).toEqual([]);
    expect(parseMoctalePage(pageHtml(), MEDIA)?.reviewsLocked).toBe(false);
  });

  it("recognizes a renamed Moctale title by its cast", () => {
    const renamed = pageHtml({
      name: "Ramayana: Part One",
      actor_list: [
        { name: "Ranbir Kapoor", character: "Prince Ram" },
        { name: "Sai Pallavi", character: "Sita" },
        { name: "Yash", character: "Raavan" },
      ],
    });
    const media = {
      title: "Ramayana: Rise of a Legend",
      releaseDate: "2026-10-29",
      type: "movie" as const,
    };

    // Without cast proof a different name is still rejected.
    expect(parseMoctalePage(renamed, media)).toBeNull();
    expect(castOverlap(["Ranbir Kapoor", "Sai Pallavi", "Someone Else"], ["Ranbir Kapoor", "Sai Pallavi"])).toBe(2);

    const snapshot = parseMoctalePage(renamed, media, moctaleContentUrl(media), {
      castNames: ["Ranbir Kapoor", "Sai Pallavi", "Lara Dutta"],
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.title).toBe("Ramayana: Part One");

    // A single shared name, or a distant year, is not enough.
    expect(
      parseMoctalePage(renamed, media, moctaleContentUrl(media), {
        castNames: ["Ranbir Kapoor", "Lara Dutta"],
      })
    ).toBeNull();
    expect(
      parseMoctalePage(
        renamed,
        { ...media, releaseDate: "2029-10-29" },
        moctaleContentUrl(media),
        { castNames: ["Ranbir Kapoor", "Sai Pallavi"] }
      )
    ).toBeNull();
  });

  it("tokenizes titles for sitemap matching", () => {
    expect(moctaleTitleTokens("Ramayana: Rise of a Legend")).toEqual([
      "ramayana",
      "rise",
      "legend",
    ]);
    expect(moctaleTitleTokens("The Odyssey")).toEqual(["odyssey"]);
  });

  it("fails closed for absent, challenged, mismatched and empty pages", () => {
    expect(parseMoctalePage("", MEDIA)).toBeNull();
    expect(parseMoctalePage("<title>Just a moment...</title>", MEDIA)).toBeNull();
    expect(parseMoctalePage("<html>not found</html>", MEDIA)).toBeNull();
    expect(
      parseMoctalePage(pageHtml(), { ...MEDIA, title: "Another Film" })
    ).toBeNull();
    expect(
      parseMoctalePage(pageHtml(), { ...MEDIA, releaseDate: "2027-01-01" })
    ).toBeNull();
    expect(
      parseMoctalePage(
        pageHtml({ count_total_review: 0, count_positive_review: 0 }),
        MEDIA
      )
    ).toBeNull();
  });

  it("reads Moctale's ordered video list and drops malformed or duplicate keys", () => {
    const video_list = [
      { video_id: "Wb8Tq_HD4E8", caption: "Final Trailer" },
      { video_id: "X1aFkAkFASk", caption: "Special Look" },
      { video_id: "Wb8Tq_HD4E8", caption: "Duplicate" },
      { video_id: "short", caption: "Broken" },
    ];

    const snapshot = parseMoctalePage(pageHtml({ video_list }), MEDIA);

    expect(snapshot?.videos).toEqual([
      { key: "Wb8Tq_HD4E8", caption: "Final Trailer" },
      { key: "X1aFkAkFASk", caption: "Special Look" },
    ]);

    const videoOnly = parseMoctalePage(
      pageHtml({
        count_total_review: 0,
        count_perfect_review: 0,
        count_positive_review: 0,
        count_neutral_review: 0,
        count_negative_review: 0,
        video_list,
      }),
      MEDIA
    );
    expect(videoOnly?.videos).toHaveLength(2);
    expect(videoOnly?.meter.totalVotes).toBe(0);
  });

  it("parses release events, including pages with interest but no reviews yet", () => {
    const event_list = [
      {
        event_type: "MOVIE",
        release_type: "NEW_MOVIE_THEATRE",
        start_date: "2026-12-17",
        to_be_confirmed: false,
        event_interested_count: 63103,
      },
    ];
    const snapshot = parseMoctalePage(pageHtml({ event_list }), MEDIA);

    expect(snapshot?.events).toEqual([
      {
        type: "MOVIE",
        releaseType: "NEW_MOVIE_THEATRE",
        date: "2026-12-17",
        interested: 63103,
        toBeConfirmed: false,
      },
    ]);

    const releaseOnly = parseMoctalePage(
      pageHtml({
        count_total_review: 0,
        count_perfect_review: 0,
        count_positive_review: 0,
        count_neutral_review: 0,
        count_negative_review: 0,
        event_list,
      }),
      MEDIA
    );
    expect(releaseOnly).not.toBeNull();
    expect(releaseOnly?.meter.totalVotes).toBe(0);
    expect(releaseOnly?.events).toHaveLength(1);
  });
});
