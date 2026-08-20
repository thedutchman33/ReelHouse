import { hostname, networkInterfaces } from "node:os";

/**
 * Origins allowed to request Next.js dev-only resources (`/_next/*`, `/__nextjs*`).
 *
 * `next dev` allowlists `localhost` only and answers 403 to every other origin —
 * including the `Network: http://<lan-ip>:3000` URL it prints itself, which is
 * the only address a phone on the same Wi-Fi can use. The failure is silent and
 * very misleading: the HTML and CSS still stream, so the page looks completely
 * correct, but every client chunk 403s, React never hydrates, and every
 * onClick/onSubmit control is dead while plain <a href> links keep working.
 * (Next's own check: server/lib/router-utils/block-cross-site-dev.js.)
 *
 * Only this machine's own addresses are listed — loopback literals, the
 * addresses its network interfaces actually answer on, and its hostname — so
 * on-device testing works without opening the dev server to arbitrary hosts.
 * Development only: production builds never consult this.
 */
function selfOrigins() {
  const hosts = new Set(["127.0.0.1", "::1", "[::1]", hostname(), `${hostname()}.local`]);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal) continue;
      // Interface addresses can carry a zone id (fe80::1%eth0); Origin never does.
      const host = address.address.split("%")[0];
      hosts.add(host);
      if (address.family === "IPv6") hosts.add(`[${host}]`);
    }
  }
  return [...hosts].filter(Boolean);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: selfOrigins(),
  // Poster/backdrop art is loaded as plain <img> in V1 so the app renders
  // with zero server-side image fetching (works fully offline with mock data).
  // When you move to live TMDB + an image CDN, switch <PosterImage> to
  // next/image and add the remotePatterns below.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
  // Security response headers, applied to every route (Phase 4 / M5–M6). All
  // are additive and app-safe. HSTS omits `preload` on purpose — `preload` is a
  // standing commitment to the browser preload list that should be an explicit
  // deployment decision, not a framework default. The Content-Security-Policy is
  // shipped REPORT-ONLY (M6): see the note inside headers() and PROGRESS.md → M6.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // Content-Security-Policy — shipped as REPORT-ONLY (M6). It never blocks;
    // the browser reports violations to the console so the policy can be
    // validated in a real browser before it is enforced. To ENFORCE: rename the
    // header key below to "Content-Security-Policy" (a one-line change) after
    // confirming a clean console on every page. 'unsafe-eval' is dev-only (React
    // uses eval for its dev error overlay; it is not needed in production). No
    // external scripts, fonts, or iframes are used; the browser only reaches
    // TMDB/YouTube images (img-src) and Supabase (connect-src). A stricter
    // nonce-based alternative is documented in docs/deployment.md.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://image.tmdb.org https://img.youtube.com",
      "font-src 'self'",
      "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      { key: "Content-Security-Policy-Report-Only", value: csp },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
