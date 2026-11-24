import type { TrailerFeed, TrailerFeedItem, TrailerKind } from "@/types";
import { TRAILERS_PER_PAGE } from "@/lib/trailers";

// Moctale's trailer space is a member post feed, not a TMDB list. Its order is
// the post's published_at (newest first), which can differ from the YouTube
// video's publish date. These types mirror only the fields we read from the
// page's embedded initialData payload.

export interface MoctaleSpacePost {
  id?: string;
  post_type?: string;
  published_at?: string;
  author_name?: string;
  category?: string;
  data?: {
    title?: string;
    description?: string;
    youtube_id?: string;
  };
}

export interface MoctaleSpacesPayload {
  current_page?: number;
  next_page?: number | null;
  previous_page?: number | null;
  data?: MoctaleSpacePost[];
}

const CONTENT_LINK = /\[([^\]]+)\]\(content:([^)]+)\)/;
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;

function cleanSuffix(value: string): string {
  return value
    .replace(/^[\s|:–—-]+/, "")
    .replace(/\.\s*$/, "")
    .trim();
}

function inferType(value: string): "movie" | "tv" {
  // Moctale's content payload does not expose movie/series. Season labels and
  // episode/show wording are the reliable signals available in the post.
  return /\b(?:season|series|episode|limited series|tv show)\b/i.test(value)
    ? "tv"
    : "movie";
}

/**
 * Convert one Moctale Spaces post into the feed shape used by Reelhouse.
 * Returns null for non-YouTube posts and malformed keys.
 */
export function parseMoctaleTrailerPost(
  post: MoctaleSpacePost
): TrailerFeedItem | null {
  if (post.post_type && post.post_type !== "YOUTUBE") return null;

  const youtubeKey = post.data?.youtube_id?.trim() ?? "";
  if (!YOUTUBE_KEY.test(youtubeKey)) return null;

  const description = post.data?.description?.trim() ?? "";
  const postTitle = post.data?.title?.trim() ?? "";
  const link = CONTENT_LINK.exec(description);
  const title = (link?.[1] ?? postTitle).trim();
  if (!title) return null;

  const slug = link?.[2]?.trim();
  const suffix = cleanSuffix(
    link ? description.slice(link.index + link[0].length) : ""
  );
  const remainder = postTitle.toLowerCase().startsWith(title.toLowerCase())
    ? cleanSuffix(postTitle.slice(title.length))
    : "";
  const trailerName =
    suffix && !/^(?:has been|is|was|were|will be)\b/i.test(suffix)
      ? suffix
      : remainder || suffix || "Trailer";

  const year =
    slug?.match(/-(\d{4})$/)?.[1] ??
    post.published_at?.slice(0, 4) ??
    undefined;

  const official = !/\b(?:teaser|announcement|promo|clip|featurette)\b/i.test(
    trailerName
  );

  return {
    id: post.id?.trim() || `moctale-${youtubeKey}`,
    tmdbId: 0,
    type: inferType(`${postTitle} ${trailerName} ${description}`),
    title,
    year,
    genres: [],
    youtubeKey,
    trailerName,
    official,
    ...(post.published_at ? { publishedAt: post.published_at } : {}),
  };
}

/**
 * Map one Moctale Spaces page to the trailer feed. The post array is already
 * newest-first and is deliberately kept in source order. `next_page` is used
 * as the immediate next page, so the existing Previous/Next control can walk
 * the feed without inventing a total page count Moctale does not expose.
 */
export function parseMoctaleSpacesFeed(
  payload: MoctaleSpacesPayload,
  kind: TrailerKind,
  requestedPage = 1
): TrailerFeed | null {
  const currentPage = Number(payload.current_page);
  const page =
    Number.isFinite(currentPage) && currentPage > 0
      ? Math.floor(currentPage)
      : Math.max(1, Math.floor(requestedPage));

  const seen = new Set<string>();
  const items = (payload.data ?? [])
    .map(parseMoctaleTrailerPost)
    .filter((item): item is TrailerFeedItem => item !== null)
    .filter((item) => {
      if (kind !== "all" && item.type !== kind) return false;
      if (seen.has(item.youtubeKey)) return false;
      seen.add(item.youtubeKey);
      return true;
    })
    .slice(0, TRAILERS_PER_PAGE);

  if (items.length === 0) return null;

  const nextPage = Number(payload.next_page);
  const totalPages =
    Number.isFinite(nextPage) && nextPage > page ? Math.floor(nextPage) : page;

  return { items, page, totalPages, kind };
}

/**
 * The Spaces page embeds its first page as a React flight string:
 *
 *   ...{"initialData":{"current_page":1,...}}
 *
 * The quotes are backslash-escaped inside the surrounding JS string. Walk the
 * escaped object, ignoring braces inside strings, then try both the escaped
 * and unescaped forms. Returns null for login/challenge pages and broken data.
 */
export function extractMoctaleSpacesPayload(
  html: string
): MoctaleSpacesPayload | null {
  let from = 0;

  while (from < html.length) {
    const keyAt = html.indexOf("initialData", from);
    if (keyAt < 0) return null;

    const braceAt = html.indexOf("{", keyAt);
    if (braceAt < 0) return null;

    let depth = 0;
    let inString = false;
    let end = -1;

    for (let index = braceAt; index < html.length; index += 1) {
      const char = html[index];
      // Every structural quote is escaped in the flight string; toggling on
      // each quote is enough to skip braces in the post titles/descriptions.
      if (char === '"') inString = !inString;
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end < 0) return null;
    const raw = html.slice(braceAt, end);
    const attempts = [
      () => JSON.parse(raw) as unknown,
      () => JSON.parse(raw.replace(/\\"/g, '"')) as unknown,
      () => JSON.parse(JSON.parse(`"${raw}"`) as string) as unknown,
    ];

    for (const attempt of attempts) {
      try {
        const parsed = attempt();
        if (
          parsed &&
          typeof parsed === "object" &&
          "current_page" in parsed &&
          Array.isArray((parsed as MoctaleSpacesPayload).data)
        ) {
          return parsed as MoctaleSpacesPayload;
        }
      } catch {
        // Try the next unescape strategy.
      }
    }

    from = keyAt + "initialData".length;
  }

  return null;
}
