// ---------------------------------------------------------------------------
// Resume-by-URL for hosted players.
//
// Progress lives in Reelhouse's own library, but the picture belongs to the
// provider's player inside the frame. A provider that accepts a starting position
// in its URL can be resumed without any postMessage command: Reelhouse appends
// the saved position while building the embed URL, so the very first frame the
// provider loads already begins where the viewer stopped.
//
// Only DOCUMENTED parameters are used. A provider absent from this table gets
// nothing appended — an unknown query parameter could change its behaviour or
// leak a position to an unrelated service.
// ---------------------------------------------------------------------------

/**
 * Host → query parameter carrying a start position in SECONDS.
 *
 * Videasy reads `?progress=<seconds>` and treats it as the initial playhead (and
 * gives it precedence over its own local history). It is not a percentage in the
 * URL, even though its postMessage `progress` field is one.
 */
const RESUME_QUERY_PARAM: Record<string, string> = {
  "vidy.st": "progress",
  "www.vidy.st": "progress",
};

/** The resume parameter this URL's player understands, or null. */
export function resumeQueryParam(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url, "https://reelhouse.invalid").hostname.toLowerCase();
    return RESUME_QUERY_PARAM[host] ?? null;
  } catch {
    return null;
  }
}

/**
 * Append the saved position to an embed URL when its provider documents one.
 * Returns the URL unchanged for an unknown host or a position that is not worth
 * resuming (absent, zero, negative, or not finite).
 */
export function withResumePosition(
  url: string,
  seconds: number | null | undefined
): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return url;
  const param = resumeQueryParam(url);
  if (!param) return url;
  try {
    const out = new URL(url, "https://reelhouse.invalid");
    out.searchParams.set(param, String(Math.floor(seconds)));
    return out.toString();
  } catch {
    return url;
  }
}
