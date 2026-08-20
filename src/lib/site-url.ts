import "server-only";

import { safeRedirectPath } from "@/lib/auth";

// ---------------------------------------------------------------------------
// The PUBLIC origin of this deployment — the base for any absolute URL the
// server hands back to a browser (today: /auth/callback's redirects).
//
// Why this module has to exist: a Route Handler cannot learn its public origin
// from `request.url`. Next builds that URL from the address the server process
// is BOUND to, not the address the visitor typed
// (next/dist/server/next-server.js → attachRequestMeta):
//
//     initUrl = `${protocol}://${this.fetchHostname}:${this.port}${req.url}`
//
// `fetchHostname`/`port` are the server's own listener (base-server.js:352,
// `formatHostname(this.hostname)`), while `protocol` comes from
// `x-forwarded-proto`. Behind AWS Amplify — CloudFront in front of a Node server
// inside a Lambda listening on localhost:3000 — those compose to
// `https://localhost:3000…`, which is what a Location header built from
// `request.url` then carries. (NextURL's parseURL also rewrites 127.0.0.1/::1 to
// the literal "localhost", so a numeric bind still reads as localhost.) On a dev
// machine the same expression is right by coincidence, because there the server
// really IS the public origin — which is why this bug is invisible locally.
//
// Why NOT derive it from Host / X-Forwarded-Host: those are request headers, so
// unless the CDN is *proven* to strip them they are visitor-controlled. And
// safeRedirectPath() guards only the PATH of a redirect — an attacker-chosen
// HOST sails straight past it and turns the mailed-link callback into an open
// redirect. The origin therefore comes from server-side configuration, which no
// request can influence.
//
// Server-only: the browser never needs this (it has window.location.origin,
// which is correct there), and keeping it off NEXT_PUBLIC_ means nothing new is
// inlined into the client bundle.
// ---------------------------------------------------------------------------

/** Hosts for which plaintext http:// is legitimate rather than a downgrade. */
const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Validates a configured site URL down to a bare origin, or null if it is
 * missing or unusable. Rejections are deliberate, not incidental:
 *
 *   • unparseable, or a non-http(s) scheme (`javascript:`, `data:`, a bare host)
 *   • carrying userinfo — `https://reelhouse.example@evil.example` reads as the
 *     real host to a human and as `evil.example` to a browser
 *   • plaintext http:// on a non-loopback host, which would silently downgrade
 *     production (losing HSTS and Secure-cookie guarantees) on a typo
 *
 * Only `.origin` survives, so any path, query or fragment in the value is
 * discarded and the port is normalised.
 */
function parseOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;
  if (url.protocol === "http:" && !LOOPBACK_HOST.test(url.hostname)) return null;

  return url.origin;
}

/**
 * This deployment's canonical public origin (e.g.
 * `https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com`), or null when `SITE_URL`
 * is unset or fails validation. Read at call time so a test can vary the env.
 */
export function configuredSiteOrigin(): string | null {
  return parseOrigin(process.env.SITE_URL);
}

/** Only `nextUrl.origin` is ever read, so a NextRequest satisfies this. */
type RequestOrigin = { nextUrl: { origin: string } };

let warnedAboutMissingSiteUrl = false;

/**
 * The origin to build absolute redirects against: the validated `SITE_URL` when
 * configured, else the request's own origin.
 *
 * That fallback is correct on a dev machine (server === public origin) and keeps
 * the blank-env graceful-degradation invariant, but in production it is the bind
 * address — the very bug described above. So say so once per server instance,
 * with no env value in the message.
 */
export function resolvePublicOrigin(request: RequestOrigin): string {
  const configured = configuredSiteOrigin();
  if (configured) return configured;

  if (IS_PRODUCTION && !warnedAboutMissingSiteUrl) {
    warnedAboutMissingSiteUrl = true;
    console.warn(
      "[auth] SITE_URL is not set: absolute redirects fall back to this " +
        "server's bind address, which behind a CDN/proxy is not the public " +
        "origin. Set SITE_URL to the site's public origin. See docs/deployment.md."
    );
  }

  return request.nextUrl.origin;
}

/**
 * An absolute URL for a redirect back into this app.
 *
 * Both halves are constrained: the origin comes from validated configuration
 * (never a request header), and the path goes through the same
 * `safeRedirectPath` allow-list the callback uses — so this helper cannot
 * produce an off-origin target no matter what a caller passes in.
 */
export function buildRedirectUrl(path: string, request: RequestOrigin): URL {
  return new URL(safeRedirectPath(path), resolvePublicOrigin(request));
}
