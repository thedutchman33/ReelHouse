import type { Media } from "@/types";

// Moctale publishes title pages at /content/<title-slug>-<year>. The cards on
// Reelhouse use only numbers and reviews that are present in that public page
// payload. There is no local preview or inferred rating here: if the page is
// missing, the parser returns null and every Moctale surface stays hidden.

export type MoctaleMeterKey = "skip" | "timepass" | "go-for-it" | "perfection";

export interface MoctaleVibeSlice {
  label: string;
  slug: string;
  percent: number;
  color: string;
}

export interface MoctaleMeterBucket {
  key: MoctaleMeterKey;
  label: string;
  /** Exact percentage used to draw the arc. */
  percent: number;
  color: string;
  votes: number;
}

export interface MoctaleReview {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  age: string;
  verdict: string;
  verdictColor: string;
  text: string;
  likes: number;
  comments: number;
}

export interface MoctaleEvent {
  /** Moctale's event type, e.g. MOVIE. */
  type?: string;
  /** Moctale's release type, e.g. NEW_MOVIE_THEATRE. */
  releaseType?: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  interested: number;
  toBeConfirmed: boolean;
}

export interface MoctaleVideo {
  /** YouTube video key from Moctale's `video_list`. */
  key: string;
  /** Moctale's caption, e.g. "Final Trailer" or "Teaser 1". */
  caption: string;
}

export interface MoctaleSnapshot {
  url: string;
  similarUrl: string;
  /** Moctale's landscape hero banner for the title, when the page exposes one. */
  bannerUrl?: string;
  title: string;
  year?: number;
  /** Release events Moctale lists on the title page (theatrical dates, interest). */
  events?: MoctaleEvent[];
  /** Moctale's ordered video list, newest first (trailers, teasers, promos). */
  videos?: MoctaleVideo[];
  vibes: MoctaleVibeSlice[];
  meter: {
    /** The winning bucket's rounded percentage. */
    score: number;
    top: MoctaleMeterBucket;
    buckets: MoctaleMeterBucket[];
    totalVotes: number;
  };
  /** The three most-liked reviews published on the title page. */
  reviews: MoctaleReview[];
  /**
   * True when Moctale only served its signed-out review placeholder (a blurred
   * block of demo reviewers plus a "Create an account" overlay). Those demo
   * cards are Moctale's own, carry the same names and templated text on every
   * title, and must never be shown as real community reviews.
   */
  reviewsLocked: boolean;
}

const MOCTALE_ORIGIN = "https://www.moctale.in";

/** Build the same slug shape Moctale uses for a title page. */
export function moctaleSlug(title: string, releaseDate?: string): string {
  const year = releaseDate?.match(/^\d{4}/)?.[0];
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Apostrophes are dropped rather than turned into word breaks.
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return [slug || "content", year].filter(Boolean).join("-");
}

export function moctaleContentUrl(
  media: Pick<Media, "title" | "releaseDate">
): string {
  return `${MOCTALE_ORIGIN}/content/${moctaleSlug(media.title, media.releaseDate)}`;
}

export function moctaleSimilarVibesUrl(
  media: Pick<Media, "title" | "releaseDate">
): string {
  return `${moctaleContentUrl(media)}/similar-vibe`;
}

/** Build a content URL from a slug discovered in Moctale's public sitemap. */
export function moctaleUrlForSlug(slug: string): string {
  return `${MOCTALE_ORIGIN}/content/${slug}`;
}

const METER_META: ReadonlyArray<{
  key: MoctaleMeterKey;
  label: string;
  color: string;
}> = [
  { key: "skip", label: "Skip", color: "#fe647e" },
  { key: "timepass", label: "Timepass", color: "#fcb700" },
  { key: "go-for-it", label: "Go for it", color: "#00d391" },
  { key: "perfection", label: "Perfection", color: "#B048FF" },
];

function decodeHtml(value: string): string {
  return value
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<!-- -->/g, "");
}

function normalizedTitle(value: string): string {  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Read a string out of the escaped `initialContent` RSC payload. The page is
 * a Next.js flight stream, so strings arrive as `\"key\":\"value\"`.
 */
function flightString(segment: string, key: string): string | null {
  const token = `\\"${key}\\":\\"`;
  const at = segment.indexOf(token);
  if (at < 0) return null;
  const start = at + token.length;
  let end = start;
  while (end < segment.length) {
    if (segment[end] === "\\" && segment[end + 1] === '"') break;
    end += 1;
  }
  if (end >= segment.length) return null;
  return decodeHtml(segment.slice(start, end));
}

function flightNumber(segment: string, key: string): number | null {
  const token = `\\"${key}\\":`;
  const at = segment.indexOf(token);
  if (at < 0) return null;
  const value = segment
    .slice(at + token.length)
    .match(/^-?\d+(?:\.\d+)?/)?.[0];
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flightBoolean(segment: string, key: string): boolean | null {
  const token = `\\"${key}\\":`;
  const at = segment.indexOf(token);
  if (at < 0) return null;
  const value = segment.slice(at + token.length, at + token.length + 5);
  if (value.startsWith("true")) return true;
  if (value.startsWith("false")) return false;
  return null;
}

/** Release events inside `initialContent` — dates and Moctale's interest counts. */
function parseEvents(segment: string): MoctaleEvent[] {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  return extractJsonArray(segment, "event_list")
    .map((item): MoctaleEvent | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const raw = item as Record<string, unknown>;
      const date = typeof raw.start_date === "string" ? raw.start_date : "";
      if (!dateRe.test(date)) return null;
      const interested = Number(raw.event_interested_count);
      return {
        date,
        interested:
          Number.isFinite(interested) && interested > 0
            ? Math.round(interested)
            : 0,
        toBeConfirmed: raw.to_be_confirmed === true,
        ...(typeof raw.event_type === "string" ? { type: raw.event_type } : {}),
        ...(typeof raw.release_type === "string"
          ? { releaseType: raw.release_type }
          : {}),
      };
    })
    .filter((event): event is MoctaleEvent => event !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Moctale's ordered trailer/teaser list. Preserve its newest-first order. */
function parseVideos(segment: string): MoctaleVideo[] {
  const seen = new Set<string>();
  const videos: MoctaleVideo[] = [];

  for (const item of extractJsonArray(segment, "video_list")) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const key = typeof raw.video_id === "string" ? raw.video_id.trim() : "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(key) || seen.has(key)) continue;

    const caption =
      typeof raw.caption === "string" && raw.caption.trim()
        ? decodeHtml(raw.caption.trim())
        : "Trailer";
    seen.add(key);
    videos.push({ key, caption });
  }

  return videos;
}

/**
 * Read one JSON array out of the escaped flight payload by balancing brackets.
 * The payload escapes every quote, so a regex cannot find the array's end.
 */
function extractJsonArray(segment: string, key: string): unknown[] {
  const token = `\\"${key}\\":`;
  const at = segment.indexOf(token);
  if (at < 0) return [];
  const start = segment.indexOf("[", at + token.length);
  if (start < 0) return [];
  let depth = 0;
  for (let i = start; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const raw = JSON.parse(segment.slice(start, i + 1).replace(/\\"/g, '"'));
          return Array.isArray(raw) ? raw : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

/** Cast names Moctale lists on the page (used to recognize renamed titles). */
function parseActors(segment: string): string[] {
  return extractJsonArray(segment, "actor_list")
    .map((item) =>
      item && typeof item === "object"
        ? (item as { name?: unknown }).name
        : undefined
    )
    .filter((name): name is string => typeof name === "string")
    .map((name) => decodeHtml(name).trim())
    .filter(Boolean);
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** How many names in `a` also appear in `b` (normalized). */
export function castOverlap(
  a: readonly string[],
  b: readonly string[]
): number {
  const other = new Set(b.map(normalizedName).filter(Boolean));
  return a.filter((name) => {
    const key = normalizedName(name);
    return key.length > 0 && other.has(key);
  }).length;
}

/**
 * Moctale's signed-out reviews block is a blurred demo list with the same
 * names and templated text on every title. Treat it as "locked", never as
 * community reviews.
 */
const LOCKED_REVIEWS_PATTERN =
  /create an account to see reviews|sign in to see reviews|log in to see reviews|\/avatars\/avatar\d+\.webp/i;

export function hasLockedReviews(html: string): boolean {
  return LOCKED_REVIEWS_PATTERN.test(html);
}

/** Word tokens used to shortlist Moctale sitemap slugs for a title. */
export function moctaleTitleTokens(title: string): string[] {
  const stop = new Set(["the", "a", "an", "and", "of", "in", "on"]);
  return Array.from(
    new Set(
      title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((token) => token.length > 1 && !stop.has(token))
    )
  );
}

interface MoctaleGenre {
  name: string;
  slug: string;
  color: string;
  percentage: number;
}

function parseGenres(segment: string): MoctaleGenre[] {
  const match = segment.match(/\\"genre_list\\":(\[.*?\]),\\"actor_list\\"/s);
  if (!match) return [];
  try {
    const json = match[1].replace(/\\"/g, '"');
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is MoctaleGenre =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as MoctaleGenre).name === "string" &&
          typeof (item as MoctaleGenre).color === "string" &&
          Number.isFinite((item as MoctaleGenre).percentage)
      )
      .map((item) => ({
        name: decodeHtml(item.name),
        slug: item.slug,
        color: item.color,
        percentage: item.percentage,
      }))
      .filter((item) => item.percentage > 0);
  } catch {
    return [];
  }
}

function parseReviews(html: string): MoctaleReview[] {
  // Every review card on the public page starts with this exact wrapper. The
  // data is blurred for signed-out readers but still present in the HTML.
  const marker =
    '<div class="flex flex-col gap-2 pb-3 border-b border-white/5">';
  const pieces = html.split(marker).slice(1);
  const reviews: MoctaleReview[] = [];

  for (const [index, piece] of pieces.entries()) {
    const name = piece.match(
      /<span class="text-xs font-semibold text-\[#E2E2E2\]">([^<]+)<\/span>/
    )?.[1];
    const meta = piece.match(
      /<span class="text-\[10px\] text-\[#8A8A93\]">@([^<]+)<!-- --> • <!-- -->([^<]+)<\/span>/
    );
    const verdict = piece.match(
      /style="background-color:([^"]+)"[^>]*>([^<]+)<\/div>/
    );
    const body = piece.match(
      /<p class="text-xs text-\[#CCCCCC\] leading-relaxed line-clamp-2">([\s\S]*?)<\/p>/
    )?.[1];
    const avatar = piece.match(
      /<img src="([^"]+)" alt="" class="w-full h-full object-cover"\/>/
    )?.[1];
    const likes = piece.match(
      /<span>❤️ <!-- -->([\d,]+)<!-- --> Likes<\/span>/
    )?.[1];
    const comments = piece.match(
      /<span>💬 <!-- -->([\d,]+)<!-- --> Comments<\/span>/
    )?.[1];

    if (!name || !meta || !verdict || !body) continue;

    const username = decodeHtml(meta[1]).trim();
    const avatarUrl = avatar
      ? avatar.startsWith("http")
        ? avatar
        : `${MOCTALE_ORIGIN}${avatar}`
      : undefined;

    reviews.push({
      id: `${username}-${index}`,
      name: decodeHtml(name).trim(),
      username,
      avatarUrl,
      age: decodeHtml(meta[2]).trim(),
      verdict: decodeHtml(verdict[2]).trim(),
      verdictColor: verdict[1],
      text: decodeHtml(body.replace(/<[^>]+>/g, "")).trim(),
      likes: Number((likes ?? "0").replace(/,/g, "")),
      comments: Number((comments ?? "0").replace(/,/g, "")),
    });
  }

  return reviews.sort((a, b) => b.likes - a.likes).slice(0, 3);
}

/** Normalize an API verdict (`GO_FOR_IT`, `go-for-it`, …) to its display form. */
function verdictMeta(raw: string): { label: string; color: string } {
  const key = raw
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const meta: Record<string, { label: string; color: string }> = {
    skip: { label: "Skip", color: "#fe647e" },
    negative: { label: "Skip", color: "#fe647e" },
    timepass: { label: "Timepass", color: "#fcb700" },
    "time-pass": { label: "Timepass", color: "#fcb700" },
    neutral: { label: "Timepass", color: "#fcb700" },
    "go-for-it": { label: "Go for it", color: "#00d391" },
    positive: { label: "Go for it", color: "#00d391" },
    perfection: { label: "Perfection", color: "#B048FF" },
    perfect: { label: "Perfection", color: "#B048FF" },
  };
  return meta[key] ?? { label: raw, color: "#C6C6C6" };
}

function reviewText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? decodeHtml(value).trim()
    : undefined;
}

function reviewCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return 0;
}

/** Human relative time for an API `created_at`; passes labels through. */
function reviewAge(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value.trim();
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reviewRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["data", "reviews", "top_10_reviews", "results"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.reviews))
      return value.reviews.filter(isRecord);
  }
  return [];
}

/**
 * Map Moctale's member-only review API payload to the three most-liked
 * reviews the card shows. The endpoint returns `{ data }` (or
 * `{ top_10_reviews }` from the summary fallback); field names are read
 * tolerantly because the API is internal.
 */
export function parseMoctaleReviewPayload(payload: unknown): MoctaleReview[] {
  const reviews: MoctaleReview[] = [];

  reviewRecords(payload).forEach((record, index) => {
    const user = isRecord(record.user) ? record.user : {};
    const username =
      reviewText(user.username) ?? reviewText(record.username) ?? "";
    const name =
      [reviewText(user.first_name), reviewText(user.last_name)]
        .filter(Boolean)
        .join(" ") ||
      reviewText(user.name) ||
      reviewText(record.name) ||
      username;
    const body =
      reviewText(record.text) ??
      reviewText(record.review_text) ??
      reviewText(record.content) ??
      reviewText(record.body);
    if (!name || !body) return;
    if (/create an account to see reviews/i.test(body)) return;

    const verdictRaw =
      reviewText(record.verdict) ??
      reviewText(record.verdict_label) ??
      "Timepass";
    const verdict = verdictMeta(verdictRaw);
    const avatarRaw =
      reviewText(user.photo_thumbnail) ??
      reviewText(user.avatar) ??
      reviewText(user.avatar_url) ??
      reviewText(user.photo_url);
    const id = record.id ?? record.review_id ?? record.uuid;

    reviews.push({
      id: String(id ?? `${username || name}-${index}`),
      name,
      username: username || name.toLowerCase().replace(/\s+/g, ""),
      avatarUrl: avatarRaw
        ? avatarRaw.startsWith("http")
          ? avatarRaw
          : `${MOCTALE_ORIGIN}${
              avatarRaw.startsWith("/") ? "" : "/"
            }${avatarRaw}`
        : undefined,
      age: reviewAge(
        record.created_at ?? record.createdAt ?? record.time ?? record.age
      ),
      verdict: verdict.label,
      verdictColor: verdict.color,
      text: body.replace(/<[^>]+>/g, "").trim(),
      likes: reviewCount(
        record.like_count ?? record.likes_count ?? record.likes ?? record.total_likes
      ),
      comments: reviewCount(
        record.comment_count ??
          record.comments_count ??
          record.comments ??
          record.total_comments
      ),
    });
  });

  return reviews.sort((a, b) => b.likes - a.likes).slice(0, 3);
}

/**
 * Parse one public Moctale title page. Returns null when the page is absent,
 * belongs to a different title/year, or has no community votes to show.
 */
export function parseMoctalePage(
  html: string,
  media: Pick<Media, "title" | "releaseDate" | "type">,
  url = moctaleContentUrl(media),
  options: { castNames?: readonly string[] } = {}
): MoctaleSnapshot | null {
  if (!html || /Just a moment\.\.\./i.test(html.slice(0, 1200))) return null;

  const anchor = html.indexOf("initialContent");
  if (anchor < 0) return null;
  const segment = html.slice(anchor, anchor + 40_000);

  const title = flightString(segment, "name");
  if (!title) return null;

  const year = flightNumber(segment, "year") ?? undefined;
  const releaseYear = media.releaseDate?.match(/^\d{4}/)?.[0];

  if (normalizedTitle(title) !== normalizedTitle(media.title)) {
    // Moctale renames some titles: TMDB's "Ramayana: Rise of a Legend" is
    // Moctale's "Ramayana: Part One". Accept such a page only when the cast
    // proves it is the same production (at least two shared actors) and the
    // year is within one of TMDB's.
    const shared = castOverlap(options.castNames ?? [], parseActors(segment));
    const yearClose =
      !releaseYear || !year || Math.abs(Number(releaseYear) - year) <= 1;
    if (shared < 2 || !yearClose) return null;
  } else if (releaseYear && year && Number(releaseYear) !== year) {
    return null;
  }

  const isShow = flightBoolean(segment, "is_show");
  if (media.type === "movie" && isShow === true) return null;
  if (media.type === "tv" && isShow === false) return null;

  // Some titles (new releases especially) have meter votes but no genre
  // percentages yet. That is still a real Moctale page: keep the snapshot and
  // let the UI hide the Vibe Chart while showing the meter and reviews.
  const genres = parseGenres(segment);
  const events = parseEvents(segment);
  const videos = parseVideos(segment);

  // Moctale serves the same landscape banner its own hero uses. It is the
  // trailer still, not the portrait `image` poster.
  const bannerRaw = flightString(segment, "banner");
  const bannerUrl =
    bannerRaw && /^https:\/\//.test(bannerRaw) ? bannerRaw : undefined;

  // The total is Moctale's own count field. A page that reports zero has no
  // community meter yet, even when it still carries stale percentage fields.
  const totalVotes = flightNumber(segment, "count_total_review") ?? 0;
  const counts: Record<MoctaleMeterKey, number> = {
    skip: flightNumber(segment, "count_negative_review") ?? 0,
    timepass: flightNumber(segment, "count_neutral_review") ?? 0,
    "go-for-it": flightNumber(segment, "count_positive_review") ?? 0,
    perfection: flightNumber(segment, "count_perfect_review") ?? 0,
  };

  // Upcoming titles may have a release event (and an interest count) or just
  // their trailer list before anyone has reviewed them. Keep those pages for
  // the hero/release card, while the insights component hides its zero-vote
  // meter.
  if (totalVotes <= 0 && events.length === 0 && videos.length === 0) {
    return null;
  }

  const percentages: Record<MoctaleMeterKey, number> = {
    skip:
      flightNumber(segment, "percent_negative_review") ??
      (counts.skip / totalVotes) * 100,
    timepass:
      flightNumber(segment, "percent_neutral_review") ??
      (counts.timepass / totalVotes) * 100,
    "go-for-it":
      flightNumber(segment, "percent_positive_review") ??
      (counts["go-for-it"] / totalVotes) * 100,
    perfection:
      flightNumber(segment, "percent_perfect_review") ??
      (counts.perfection / totalVotes) * 100,
  };

  const buckets: MoctaleMeterBucket[] = METER_META.map((bucket) => ({
    ...bucket,
    percent: Math.max(0, percentages[bucket.key]),
    votes: counts[bucket.key],
  }));
  const top = buckets.reduce((winner, bucket) =>
    bucket.percent > winner.percent ? bucket : winner
  );

  const vibes: MoctaleVibeSlice[] = genres.map((genre) => ({
    label: genre.name,
    slug: genre.slug,
    percent: genre.percentage,
    color: genre.color,
  }));

  // Moctale only shows real reviews to signed-in members. Its public pages
  // carry a blurred demo list instead, so those cards are dropped rather than
  // presented as community reviews.
  const reviewsLocked = hasLockedReviews(html);

  return {
    url,
    similarUrl: `${url}/similar-vibe`,
    bannerUrl,
    title,
    year,
    events,
    videos,
    vibes,
    meter: {
      score: Math.round(top.percent),
      top,
      buckets,
      totalVotes,
    },
    reviews: reviewsLocked ? [] : parseReviews(html),
    reviewsLocked,
  };
}
