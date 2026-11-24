import { describe, expect, it } from "vitest";
import { parseMoctaleReviewPayload } from "@/lib/moctale";

const DAY = 86_400_000;

const API_REVIEW = {
  user: {
    first_name: "Aarav",
    last_name: "Sharma",
    username: "aarav_cinema",
    photo_thumbnail: "/media/aarav.webp",
  },
  verdict: "PERFECT",
  text: "An absolute masterpiece!",
  like_count: 42,
  comment_count: 8,
  created_at: new Date(Date.now() - 2 * DAY).toISOString(),
};

describe("parseMoctaleReviewPayload", () => {
  it("maps the member API shape and keeps the three most-liked reviews", () => {
    const reviews = parseMoctaleReviewPayload({
      data: [
        API_REVIEW,
        {
          id: "priya-2",
          user: {
            first_name: "Priya",
            last_name: "Patel",
            username: "priya_reviews",
          },
          verdict: "GO_FOR_IT",
          text: "The chemistry is the whole movie.",
          like_count: 29,
          comment_count: 3,
          created_at: new Date(Date.now() - 5 * DAY).toISOString(),
        },
        {
          id: "rohan-3",
          user: {
            first_name: "Rohan",
            last_name: "Mehta",
            username: "rohan_m",
          },
          verdict: "TIMEPASS",
          text: "Fun while it lasts.",
          like_count: 14,
          comment_count: 1,
          created_at: new Date(Date.now() - 7 * DAY).toISOString(),
        },
        {
          id: "kavya-4",
          user: {
            first_name: "Kavya",
            last_name: "Singh",
            username: "kavya_reviews",
          },
          verdict: "SKIP",
          text: "Disappointing execution.",
          like_count: 7,
          comment_count: 0,
          created_at: new Date(Date.now() - 14 * DAY).toISOString(),
        },
      ],
    });

    expect(reviews).toHaveLength(3);
    expect(reviews.map((review) => review.likes)).toEqual([42, 29, 14]);
    expect(reviews[0]).toMatchObject({
      id: "aarav_cinema-0",
      name: "Aarav Sharma",
      username: "aarav_cinema",
      verdict: "Perfection",
      verdictColor: "#B048FF",
      likes: 42,
      comments: 8,
      avatarUrl: "https://www.moctale.in/media/aarav.webp",
    });
    expect(reviews[0].age).toBe("2 days ago");
    expect(reviews[1].verdictColor).toBe("#00d391");
    expect(reviews[2].verdictColor).toBe("#fcb700");
  });

  it("reads the reviews-summary fallback shape", () => {
    const reviews = parseMoctaleReviewPayload({
      top_10_reviews: [
        {
          user: {
            first_name: "Maya",
            last_name: "Rao",
            username: "maya",
          },
          verdict: "Go for it",
          text: "Loved it.",
          like_count: "1,204",
          comment_count: 16,
        },
      ],
    });

    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      name: "Maya Rao",
      verdict: "Go for it",
      likes: 1204,
      comments: 16,
    });
  });

  it("drops malformed records and Moctale's signed-out demo text", () => {
    expect(parseMoctaleReviewPayload(null)).toEqual([]);
    expect(
      parseMoctaleReviewPayload({
        data: [
          { user: {}, text: "" },
          {
            user: { first_name: "Demo", username: "demo" },
            text: "Create an account to see reviews for this title",
            like_count: 99,
          },
        ],
      })
    ).toEqual([]);
  });
});
