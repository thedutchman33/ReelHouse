import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRedirectUrl,
  configuredSiteOrigin,
  resolvePublicOrigin,
} from "@/lib/site-url";

// The origin half of /auth/callback's redirects.
//
// Background (PROGRESS.md → "Auth redirect origin"): a Route Handler's
// `request.url` carries the address the SERVER is bound to, not the public
// origin, so behind AWS Amplify it reads `https://localhost:3000…`. These suites
// pin the replacement: the origin comes from validated configuration, the path
// still goes through safeRedirectPath, and the two together can never point off
// -origin. The hostile inputs are the point — this is a password-reset route, so
// an open redirect here is a phishing primitive.

const PROD_ORIGIN = "https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com";

/** Stands in for a NextRequest; only `nextUrl.origin` is ever read. */
const requestFrom = (origin: string) => ({ nextUrl: { origin } });

/** What Amplify actually produces today: the Lambda's own bind address. */
const amplifyRequest = requestFrom("https://localhost:3000");
const devRequest = requestFrom("http://localhost:3000");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuredSiteOrigin", () => {
  it("accepts the production origin and keeps only the origin", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    expect(configuredSiteOrigin()).toBe(PROD_ORIGIN);
  });

  it("normalises a trailing slash, a path, a query and a fragment away", () => {
    for (const raw of [
      `${PROD_ORIGIN}/`,
      `${PROD_ORIGIN}/some/path`,
      `${PROD_ORIGIN}/?a=b`,
      `${PROD_ORIGIN}#frag`,
      `  ${PROD_ORIGIN}  `,
    ]) {
      vi.stubEnv("SITE_URL", raw);
      expect(configuredSiteOrigin(), raw).toBe(PROD_ORIGIN);
    }
  });

  it("is null when unset or blank, so callers fall back", () => {
    vi.stubEnv("SITE_URL", "");
    expect(configuredSiteOrigin()).toBeNull();
    vi.stubEnv("SITE_URL", "   ");
    expect(configuredSiteOrigin()).toBeNull();
    vi.stubEnv("SITE_URL", undefined);
    expect(configuredSiteOrigin()).toBeNull();
  });

  it("rejects a value that is not an absolute http(s) URL", () => {
    for (const raw of [
      "reelhouse.d14f2cs6k7jhfn.amplifyapp.com",
      "//reelhouse.d14f2cs6k7jhfn.amplifyapp.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://reelhouse.example",
      "/reset-password",
      "not a url",
    ]) {
      vi.stubEnv("SITE_URL", raw);
      expect(configuredSiteOrigin(), raw).toBeNull();
    }
  });

  it("rejects userinfo, which disguises the real host", () => {
    // A human reads the left-hand side; the browser resolves the right-hand one.
    vi.stubEnv("SITE_URL", "https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com@evil.example");
    expect(configuredSiteOrigin()).toBeNull();
    vi.stubEnv("SITE_URL", "https://user:pass@evil.example");
    expect(configuredSiteOrigin()).toBeNull();
  });

  it("refuses plaintext http on a public host, but allows it on loopback", () => {
    vi.stubEnv("SITE_URL", "http://reelhouse.d14f2cs6k7jhfn.amplifyapp.com");
    expect(configuredSiteOrigin()).toBeNull();

    vi.stubEnv("SITE_URL", "http://localhost:3000");
    expect(configuredSiteOrigin()).toBe("http://localhost:3000");
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
    expect(configuredSiteOrigin()).toBe("http://127.0.0.1:3000");
    vi.stubEnv("SITE_URL", "http://[::1]:3000");
    expect(configuredSiteOrigin()).toBe("http://[::1]:3000");
  });
});

describe("resolvePublicOrigin", () => {
  it("prefers the configured origin over the request's own", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    // This is the regression: the request says localhost, config says otherwise.
    expect(resolvePublicOrigin(amplifyRequest)).toBe(PROD_ORIGIN);
  });

  it("falls back to the request origin when unconfigured (local dev)", () => {
    vi.stubEnv("SITE_URL", undefined);
    expect(resolvePublicOrigin(devRequest)).toBe("http://localhost:3000");
  });

  it("ignores an invalid configured value rather than trusting it", () => {
    vi.stubEnv("SITE_URL", "javascript:alert(1)");
    expect(resolvePublicOrigin(devRequest)).toBe("http://localhost:3000");
  });
});

describe("buildRedirectUrl", () => {
  it("targets the production origin for the reset-password path", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    expect(buildRedirectUrl("/reset-password", amplifyRequest).href).toBe(
      `${PROD_ORIGIN}/reset-password`
    );
  });

  it("targets the production origin for the site root", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    expect(buildRedirectUrl("/", amplifyRequest).href).toBe(`${PROD_ORIGIN}/`);
  });

  it("builds the two failure destinations on the production origin", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    for (const target of ["/forgot-password", "/login"]) {
      const url = buildRedirectUrl(target, amplifyRequest);
      url.searchParams.set("error", "link_invalid");
      expect(url.href).toBe(`${PROD_ORIGIN}${target}?error=link_invalid`);
    }
  });

  it("cannot be pointed off-origin by a hostile path", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    for (const hostile of [
      "https://evil.example/steal",
      "//evil.example",
      "//evil.example/steal",
      "/\\evil.example/steal",
      "javascript:alert(1)",
      "/reset-password\r\nSet-Cookie: a=b",
    ]) {
      const url = buildRedirectUrl(hostile, amplifyRequest);
      // safeRedirectPath collapses all of these to the fallback "/".
      expect(url.href, hostile).toBe(`${PROD_ORIGIN}/`);
      expect(url.origin, hostile).toBe(PROD_ORIGIN);
    }
  });

  it("stays on the request origin, and on-origin, when unconfigured", () => {
    vi.stubEnv("SITE_URL", undefined);
    expect(buildRedirectUrl("/reset-password", devRequest).href).toBe(
      "http://localhost:3000/reset-password"
    );
    expect(buildRedirectUrl("https://evil.example", devRequest).href).toBe(
      "http://localhost:3000/"
    );
  });

  it("keeps a query string on an otherwise safe path", () => {
    vi.stubEnv("SITE_URL", PROD_ORIGIN);
    expect(buildRedirectUrl("/movie/550?s=2", amplifyRequest).href).toBe(
      `${PROD_ORIGIN}/movie/550?s=2`
    );
  });
});
