import { describe, expect, it } from "vitest";
import { clientKeyFrom, createRateLimiter } from "@/lib/rate-limit";

// The limiter in front of /api/subtitles/*. Those two routes are
// unauthenticated GETs that spend the server's OpenSubtitles key and the
// account's daily download quota, so what is pinned here is the counting itself
// — that a burst is actually stopped, that the window really reopens, that one
// caller can't starve another, and that the key can't be forged by sending your
// own X-Forwarded-For.
//
// The clock is a parameter throughout, so none of this needs fake timers.

const RULE = { limit: 3, windowMs: 60_000 };
const T0 = 1_700_000_000_000;

describe("createRateLimiter", () => {
  it("allows exactly `limit` requests, then blocks", () => {
    const limiter = createRateLimiter(RULE);
    expect(limiter.check("ip", T0)).toMatchObject({
      allowed: true,
      remaining: 2,
    });
    expect(limiter.check("ip", T0)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.check("ip", T0)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check("ip", T0)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it("keeps blocking for the rest of the window", () => {
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < RULE.limit; i += 1) limiter.check("ip", T0);
    // One millisecond before the window closes.
    expect(limiter.check("ip", T0 + RULE.windowMs - 1).allowed).toBe(false);
  });

  it("reopens once the window has elapsed", () => {
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < RULE.limit; i += 1) limiter.check("ip", T0);
    expect(limiter.check("ip", T0 + RULE.windowMs)).toMatchObject({
      allowed: true,
      remaining: RULE.limit - 1,
    });
  });

  it("counts each key independently — one caller cannot starve another", () => {
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < RULE.limit; i += 1) limiter.check("noisy", T0);
    expect(limiter.check("noisy", T0).allowed).toBe(false);
    expect(limiter.check("quiet", T0).allowed).toBe(true);
  });

  it("reports whole seconds to wait, rounded up and never below 1", () => {
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < RULE.limit; i += 1) limiter.check("ip", T0);

    // 30s left → 30. 1ms left → still 1, never 0, so a Retry-After built from
    // this can't tell a blocked caller to retry immediately.
    expect(limiter.check("ip", T0 + 30_000).retryAfterSeconds).toBe(30);
    expect(limiter.check("ip", T0 + 29_500).retryAfterSeconds).toBe(31);
    expect(limiter.check("ip", T0 + RULE.windowMs - 1).retryAfterSeconds).toBe(1);
  });

  it("reports no wait while the caller is still allowed", () => {
    const limiter = createRateLimiter(RULE);
    expect(limiter.check("ip", T0).retryAfterSeconds).toBe(0);
  });

  it("keeps a key for the life of its window, and reset clears everything", () => {
    // Stated as it actually behaves: entries are NOT reclaimed continuously.
    // Reclamation is triggered by the key cap, not by a timer or by each call,
    // so 50 live keys stay 50 live keys.
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < 50; i += 1) limiter.check(`ip-${i}`, T0);
    expect(limiter.size()).toBe(50);

    limiter.reset();
    expect(limiter.size()).toBe(0);
  });

  it("reclaims elapsed windows once the cap forces a sweep", () => {
    // The real eviction path. Fill past the cap so the next new key sweeps, and
    // do it at a time by which every existing window has closed: all of them are
    // expired, so they are dropped and only the newcomer survives.
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < 10_000; i += 1) limiter.check(`ip-${i}`, T0);
    const filled = limiter.size();
    expect(filled).toBe(10_000);

    limiter.check("late-arrival", T0 + RULE.windowMs);
    expect(limiter.size()).toBe(1);
  });

  it("never grows past the cap, even with every window still live", () => {
    // A caller rotating its key must not be able to make the limiter itself the
    // memory leak. Nothing is expired here, so the sweep falls back to clearing
    // — which fails open (fresh windows) rather than locking real visitors out.
    const limiter = createRateLimiter(RULE);
    for (let i = 0; i < 10_050; i += 1) limiter.check(`ip-${i}`, T0);
    expect(limiter.size()).toBeGreaterThan(0);
    expect(limiter.size()).toBeLessThanOrEqual(10_000);
  });

  it("clamps a nonsensical rule instead of dividing by zero or denying everyone", () => {
    const limiter = createRateLimiter({ limit: 0, windowMs: 0 });
    // limit floors to 1, so the first request is allowed and the second is not
    // (windowMs floors to 1ms, evaluated at the same instant).
    expect(limiter.check("ip", T0).allowed).toBe(true);
    expect(limiter.check("ip", T0).allowed).toBe(false);
  });

  it("treats a fractional rule as its floor", () => {
    const limiter = createRateLimiter({ limit: 2.9, windowMs: 60_000 });
    expect(limiter.check("ip", T0).allowed).toBe(true);
    expect(limiter.check("ip", T0).allowed).toBe(true);
    expect(limiter.check("ip", T0).allowed).toBe(false);
  });
});

/** Stands in for `Request.headers`; only `get` is ever read. */
const headers = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
});

describe("clientKeyFrom", () => {
  it("reads the last x-forwarded-for hop, which the caller cannot forge", () => {
    // CloudFront appends the address it observed, so a caller who sends
    // `X-Forwarded-For: 1.1.1.1` ends up as "1.1.1.1, <their real address>".
    // Reading from the right means rotating that header buys them nothing.
    expect(
      clientKeyFrom(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))
    ).toBe("203.0.113.7");
  });

  it("handles a single-hop header", () => {
    expect(clientKeyFrom(headers({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  it("ignores whitespace and empty hops", () => {
    expect(
      clientKeyFrom(headers({ "x-forwarded-for": " 1.1.1.1 , 203.0.113.7 , " }))
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded-for", () => {
    expect(clientKeyFrom(headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4"
    );
  });

  it("prefers forwarded-for over x-real-ip", () => {
    expect(
      clientKeyFrom(
        headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" })
      )
    ).toBe("203.0.113.7");
  });

  it("collapses an unattributable request onto one counted bucket", () => {
    // Not waved through: no header (local dev, or a stripped request) still
    // gets counted, it just shares a bucket.
    expect(clientKeyFrom(headers({}))).toBe("unknown");
    expect(clientKeyFrom(headers({ "x-forwarded-for": "  ,  " }))).toBe("unknown");
    expect(clientKeyFrom(headers({ "x-real-ip": "   " }))).toBe("unknown");
  });
});
