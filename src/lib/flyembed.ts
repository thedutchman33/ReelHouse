import "server-only";

// ---------------------------------------------------------------------------
// FlyEmbed resolver.
//
// FlyEmbed publishes one JSON feed for every sport it carries. The F1 entry is
// not stable (the feed usually has no F1 event at all), so framing the feed
// directly would show JSON. This module picks the current F1 event and returns
// its embed URL; /api/f1/flyembed then redirects the iframe to it.
//
// Only flyembed.cfd embed URLs are accepted. Anything else — another host, a
// non-HTTPS URL, a malformed entry — falls back to the local placeholder page.
// ---------------------------------------------------------------------------

export const FLYEMBED_FEED_URL =
  "https://ovogoal.pages.dev/api/v2/flyembed2.json";

/** Local page shown when FlyEmbed has no usable F1 event. */
export const F1_PLACEHOLDER_PATH = "/f1/live-placeholder.html";

const ALLOWED_HOSTS = new Set(["flyembed.cfd", "www.flyembed.cfd"]);
const REQUEST_TIMEOUT_MS = 4_500;
const FEED_REVALIDATE_SECONDS = 30;

/** Minimal fetch shape — Next extends RequestInit with `next`. */
type FetchLike = (
  input: string,
  init?: RequestInit & { next?: { revalidate?: number } }
) => Promise<Response>;

/** True for an HTTPS embed URL on the FlyEmbed host. */
export function isAllowedFlyEmbedUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/**
 * True when the feed entry describes Formula 1. Matches the sport, league and
 * team names, so a "Motorsport" entry with an "F1" league still qualifies.
 */
export function isF1Event(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const haystack = [entry.Sport, entry.League, entry.Team1, entry.Team2]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return /(formula\s*1|formula\s*one|\bf1\b)/i.test(haystack);
}

/**
 * Resolve the current FlyEmbed F1 embed URL, or the local placeholder path.
 * Never throws: a network error, a non-200 response, malformed JSON, or a feed
 * with no F1 event all produce the placeholder.
 */
export async function resolveFlyEmbedUrl(
  fetcher: FetchLike = fetch
): Promise<string> {
  try {
    const res = await fetcher(FLYEMBED_FEED_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: FEED_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return F1_PLACEHOLDER_PATH;

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return F1_PLACEHOLDER_PATH;

    for (const entry of data) {
      if (!isF1Event(entry)) continue;
      const url = (entry as Record<string, unknown>).IframeURL;
      if (isAllowedFlyEmbedUrl(url)) return url;
    }
    return F1_PLACEHOLDER_PATH;
  } catch {
    return F1_PLACEHOLDER_PATH;
  }
}
