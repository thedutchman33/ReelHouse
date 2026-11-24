import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Media } from "@/types";
import {
  moctaleContentUrl,
  moctaleTitleTokens,
  moctaleUrlForSlug,
  parseMoctalePage,
  parseMoctaleReviewPayload,
  type MoctaleReview,
} from "./moctale";

const execFileAsync = promisify(execFile);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const HTML_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const REVIEW_CACHE_TTL_MS = 60 * 60 * 1000;
const REVIEW_FAILURE_TTL_MS = 5 * 60 * 1000;
const SITEMAP_URL = "https://www.moctale.in/sitemap-content.xml";
const SITEMAP_TTL_MS = 12 * 60 * 60 * 1000;
/** Renamed titles are checked against at most this many sitemap candidates. */
const MAX_SLUG_CANDIDATES = 4;

type FetchedMedia = Pick<Media, "title" | "releaseDate" | "type"> & {
  cast?: Media["cast"];
};

type Snapshot = Awaited<ReturnType<typeof parseMoctalePage>>;

type CachedSnapshot = {
  expiresAt: number;
  value: Snapshot;
};

const snapshotCache = new Map<string, CachedSnapshot>();
const inflight = new Map<string, Promise<CachedSnapshot["value"]>>();

const reviewCache = new Map<
  string,
  { expiresAt: number; reviews: MoctaleReview[] }
>();
const reviewInflight = new Map<string, Promise<MoctaleReview[]>>();

let slugCache: { expiresAt: number; slugs: string[] } | null = null;
let slugInflight: Promise<string[]> | null = null;

function looksLikeMoctalePage(html: string): boolean {
  return (
    html.includes("initialContent") &&
    html.includes("genre_list") &&
    !/Just a moment\.\.\./i.test(html.slice(0, 1200))
  );
}

async function fetchTextWithNode(
  url: string,
  accept: string
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept,
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Cloudflare rejects Node's TLS fingerprint on Moctale even when the page is
 * public. curl is available on the app's supported local/server environments
 * and fetches the exact same public HTML. This is only a transport fallback:
 * the parser still rejects challenges, 404s, mismatched titles, and empty data.
 */
async function fetchTextWithCurl(url: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--silent",
        "--show-error",
        "--location",
        "--compressed",
        "--max-time",
        "7",
        "--user-agent",
        USER_AGENT,
        // Deliberately leave Accept at curl's default `*/*`. Sending Chrome's
        // full HTML Accept header makes Cloudflare serve its managed challenge
        // to this request, even though the public page is otherwise available.
        url,
      ],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 9000,
        windowsHide: true,
      }
    );
    return stdout;
  } catch {
    return null;
  }
}

async function fetchMoctaleHtml(url: string): Promise<string | null> {
  const nodeHtml = await fetchTextWithNode(url, HTML_ACCEPT);
  if (nodeHtml && looksLikeMoctalePage(nodeHtml)) return nodeHtml;
  const curlHtml = await fetchTextWithCurl(url);
  return curlHtml && looksLikeMoctalePage(curlHtml) ? curlHtml : null;
}

/** JSON request carrying the operator's Moctale session cookie. */
async function fetchMoctaleJson(
  url: string,
  cookie: string,
  referer: string
): Promise<unknown | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--silent",
        "--show-error",
        "--location",
        "--compressed",
        "--max-time",
        "10",
        "--user-agent",
        USER_AGENT,
        "--cookie",
        cookie,
        "--header",
        "Accept: application/json",
        "--header",
        `Referer: ${referer}`,
        url,
      ],
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 12000,
        windowsHide: true,
      }
    );
    const body = stdout.trim();
    if (!body.startsWith("{") && !body.startsWith("[")) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/**
 * The three most-liked reviews, read through the operator's signed-in Moctale
 * session. Moctale's password login is Turnstile-protected, so server-side
 * sign-in is not possible; MOCTALE_COOKIE carries the session instead. The
 * cookie is server-only (this module is `server-only`), never sent to clients,
 * and is read at request time. Without it — or when the session expires — this
 * returns [] and the card shows its no-reviews state.
 */
async function loadAuthenticatedReviews(
  url: string
): Promise<MoctaleReview[]> {
  const cookie = process.env.MOCTALE_COOKIE?.trim();
  if (!cookie) return [];

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const slug = parsed.pathname.split("/").filter(Boolean).pop();
  if (!slug) return [];

  const cached = reviewCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.reviews;

  const pending = reviewInflight.get(slug);
  if (pending) return pending;

  const request = (async () => {
    const endpoints = [
      `${parsed.origin}/api/activity/content/${slug}/reviews?page=1&sort_by=likes`,
      `${parsed.origin}/api/activity/content/${slug}/reviews-summary`,
    ];
    let reviews: MoctaleReview[] = [];
    for (const endpoint of endpoints) {
      const payload = await fetchMoctaleJson(endpoint, cookie, url);
      if (!payload) continue;
      reviews = parseMoctaleReviewPayload(payload);
      if (reviews.length > 0) break;
    }

    reviewCache.set(slug, {
      expiresAt:
        Date.now() +
        (reviews.length > 0 ? REVIEW_CACHE_TTL_MS : REVIEW_FAILURE_TTL_MS),
      reviews,
    });
    return reviews;
  })().finally(() => {
    reviewInflight.delete(slug);
  });

  reviewInflight.set(slug, request);
  return request;
}

/** Every public title slug Moctale publishes (sitemap is public and cached). */
async function getContentSlugs(): Promise<string[]> {
  if (slugCache && slugCache.expiresAt > Date.now()) return slugCache.slugs;
  if (slugInflight) return slugInflight;

  slugInflight = (async () => {
    const xml =
      (await fetchTextWithNode(SITEMAP_URL, "application/xml,text/xml,*/*")) ??
      (await fetchTextWithCurl(SITEMAP_URL)) ??
      "";
    const slugs = Array.from(
      xml.matchAll(/<loc>https?:\/\/[^<]*\/content\/([^<]+)<\/loc>/g)
    ).map((match) => match[1].trim());
    slugCache = { expiresAt: Date.now() + SITEMAP_TTL_MS, slugs };
    return slugs;
  })().finally(() => {
    slugInflight = null;
  });

  return slugInflight;
}

function slugYear(slug: string): number | undefined {
  const match = slug.match(/-(\d{4})$/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Sitemap slugs worth checking for a title Moctale filed under another name
 * (TMDB's "Ramayana: Rise of a Legend" is Moctale's "Ramayana: Part One").
 * Only same-era slugs sharing a meaningful title word qualify; the caller
 * still verifies each page by cast before accepting it.
 */
function candidateSlugs(slugs: string[], media: FetchedMedia): string[] {
  const releaseYear = Number(media.releaseDate?.match(/^\d{4}/)?.[0]);
  if (!Number.isFinite(releaseYear)) return [];
  const years = new Set([releaseYear - 1, releaseYear, releaseYear + 1]);
  const titleTokens = moctaleTitleTokens(media.title);
  if (titleTokens.length === 0) return [];

  const scored: { slug: string; score: number }[] = [];
  for (const slug of slugs) {
    const year = slugYear(slug);
    if (year === undefined || !years.has(year)) continue;
    const slugTokens = new Set(slug.split("-"));
    const shared = titleTokens.filter((token) => slugTokens.has(token)).length;
    // At least a third of the title's words must appear in the slug.
    if (shared === 0 || shared * 3 < titleTokens.length) continue;
    scored.push({
      slug,
      score: shared / titleTokens.length + shared / Math.max(1, slugTokens.size),
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, MAX_SLUG_CANDIDATES)
    .map((entry) => entry.slug);
}

async function fetchSnapshot(
  url: string,
  media: FetchedMedia,
  castNames: readonly string[]
): Promise<Snapshot> {
  const html = await fetchMoctaleHtml(url);
  if (!html) return null;
  return parseMoctalePage(html, media, url, { castNames });
}

async function loadSnapshot(
  key: string,
  media: FetchedMedia
): Promise<Snapshot> {
  const castNames = media.cast?.map((member) => member.name) ?? [];

  // The common case: Moctale's slug is the title-year path we would build.
  let snapshot = await fetchSnapshot(
    moctaleContentUrl(media),
    media,
    castNames
  );

  // Renamed titles only: shortlist sitemap slugs, then let the cast on each
  // page prove it is the same production. Without cast data there is nothing
  // safe to match on, so the Moctale block stays hidden.
  if (!snapshot && castNames.length >= 2) {
    const slugs = await getContentSlugs();
    for (const slug of candidateSlugs(slugs, media)) {
      snapshot = await fetchSnapshot(
        moctaleUrlForSlug(slug),
        media,
        castNames
      );
      if (snapshot) break;
    }
  }

  // The public page hides member reviews behind a sign-in card. When a
  // session cookie is configured, replace that locked state with the real
  // most-liked reviews from the member API.
  if (snapshot) {
    const reviews = await loadAuthenticatedReviews(snapshot.url);
    if (reviews.length > 0) {
      snapshot = { ...snapshot, reviews, reviewsLocked: false };
    }
  }

  const cacheEntry: CachedSnapshot = {
    expiresAt: Date.now() + (snapshot ? CACHE_TTL_MS : FAILURE_TTL_MS),
    value: snapshot,
  };
  snapshotCache.set(key, cacheEntry);
  return snapshot;
}

/**
 * Server-only Moctale snapshot loader. It never fabricates a snapshot: any
 * failure results in null, and callers render no Moctale cards.
 */
export async function getMoctaleSnapshot(
  media: FetchedMedia
): Promise<Snapshot> {
  if (!media.title) return null;

  const key = moctaleContentUrl(media);
  const cached = snapshotCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = loadSnapshot(key, media).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, request);
  return request;
}
