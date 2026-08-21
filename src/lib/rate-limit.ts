// ---------------------------------------------------------------------------
// Fixed-window request counting, held in this process's memory.
//
// Why this exists: /api/subtitles/search and /api/subtitles/download are
// unauthenticated GETs on a public deployment, and both spend something that
// isn't ours to spend — the server's OpenSubtitles API key, and the account's
// *daily download quota*. Without a limiter, a trivial loop against the public
// URL exhausts that quota and can get the account flagged. That's a third
// party's terms, not just our uptime.
//
// What this is NOT — stated plainly, because overstating it would be worse than
// not having it:
//
//   * Not distributed. The counters live in one Node process. Amplify can run
//     several concurrent Lambda instances, and each keeps its own map, so the
//     effective ceiling is (limit x instances) rather than `limit`. Cold starts
//     reset counters to zero.
//   * Not spoof-proof. The key is derived from proxy headers (see
//     `clientKeyFrom`), which a determined caller can rotate.
//   * Not a substitute for authentication or for an upstream WAF rule.
//
// It raises the cost of casual and accidental abuse — a stuck retry loop, a
// scraper, someone curling in a `while true` — which is the realistic threat to
// a small public deployment. The documented scale-out path if this ever needs
// to be real is a shared store keyed by `REDIS_URL` (see docs/phase-2.md).
//
// Design notes: the clock is a parameter rather than a module-level
// `Date.now()`, so the whole thing is deterministic under Vitest without fake
// timers, and the module stays pure enough to unit test in the existing
// node environment.
// ---------------------------------------------------------------------------

/** How many requests are allowed per key, and over what span. */
export type RateLimitRule = {
  /** Requests permitted inside one window. Must be >= 1. */
  limit: number;
  /** Window length in milliseconds. Must be >= 1. */
  windowMs: number;
};

export type RateLimitResult = {
  /** False when the caller has exhausted its window. */
  allowed: boolean;
  /** Requests left in the current window, never negative. */
  remaining: number;
  /**
   * Whole seconds until the window resets, rounded up, minimum 1 when the
   * caller is blocked. Zero while the caller is still allowed — there is
   * nothing to wait for.
   */
  retryAfterSeconds: number;
};

/**
 * Cap on tracked keys, so a caller rotating its key can't turn the limiter
 * itself into the memory leak. Expired entries are swept first; if that isn't
 * enough the map is cleared outright, which fails *open* (everyone gets a fresh
 * window) rather than locking real visitors out.
 */
const MAX_TRACKED_KEYS = 10_000;

export type RateLimiter = {
  /**
   * Records one request against `key` and reports whether it may proceed.
   * `now` is milliseconds since the epoch — callers in a route pass `Date.now()`.
   */
  check(key: string, now: number): RateLimitResult;
  /** Tracked-key count. Exposed for tests and for reasoning about memory. */
  size(): number;
  /** Drops all state. Test helper; not used by application code. */
  reset(): void;
};

export function createRateLimiter(rule: RateLimitRule): RateLimiter {
  const limit = Math.max(1, Math.floor(rule.limit));
  const windowMs = Math.max(1, Math.floor(rule.windowMs));
  const windows = new Map<string, { count: number; resetAt: number }>();

  function sweep(now: number) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(key);
    }
    // Still over the cap after dropping everything expired: the map is being
    // filled with live keys faster than they age out. Clearing is the safe
    // direction — it forgets counters instead of denying requests.
    if (windows.size > MAX_TRACKED_KEYS) windows.clear();
  }

  return {
    check(key, now) {
      const existing = windows.get(key);

      // No window, or the previous one has elapsed: start a fresh one. The
      // window is anchored to this request, not to a global clock boundary.
      if (!existing || existing.resetAt <= now) {
        if (windows.size >= MAX_TRACKED_KEYS) sweep(now);
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }

      if (existing.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((existing.resetAt - now) / 1000)
          ),
        };
      }

      existing.count += 1;
      return {
        allowed: true,
        remaining: limit - existing.count,
        retryAfterSeconds: 0,
      };
    },
    size() {
      return windows.size;
    },
    reset() {
      windows.clear();
    },
  };
}

/** Minimal shape both `Request.headers` and a plain test object satisfy. */
type HeaderReader = { get(name: string): string | null };

/**
 * The key a request is counted against.
 *
 * `x-forwarded-for` is a list, and which end of it to trust depends on the
 * proxy. CloudFront (which fronts Amplify) *appends* the address it actually
 * observed, so the **last** entry is the one a caller cannot forge, while the
 * leftmost is whatever the caller claimed. Reading from the right therefore
 * costs nothing and removes the one-line bypass of sending your own
 * `X-Forwarded-For:` header.
 *
 * Everything unattributable collapses onto the single key `"unknown"`. That is
 * deliberate: it means local development (no proxy, so no header) shares one
 * bucket, and it means a request we cannot attribute is still counted rather
 * than waved through.
 */
export function clientKeyFrom(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
