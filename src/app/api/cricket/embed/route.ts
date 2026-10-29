import { NextResponse } from "next/server";
import {
  parseAllowedCricketUrl,
  sanitizeCricketHtml,
} from "@/lib/cricket-embed";
import { getCricketEmbedAllowlist } from "@/lib/cricket-playback";
import {
  buildCricketEmbedDocument,
  renderCricketPlayerPage,
  type CricketStreamConfig,
} from "@/lib/cricket-stream";

// ---------------------------------------------------------------------------
// GET /api/cricket/embed?url=<encoded source URL>
//
// Same-origin iframe target for every configured cricket server. It is the
// server-side half of the "no Telegram popup" fix:
//
//   • only origins from the cricket env slots (plus the known nested player
//     origins) may be fetched — this route is a proxy, not an open SSRF relay;
//   • a page that carries a player config is replaced wholesale by our own
//     player document (src/lib/cricket-stream.ts). This is required, not
//     cosmetic: the streams are ClearKey-encrypted, and Chrome refuses EME on a
//     unique origin, which is exactly what a sandboxed proxy produces. Our own
//     document never runs source JavaScript, so it needs no sandbox;
//   • a shell page (dekhobhai/HIN) becomes a first-party frame around the
//     nested player, so the nested page is not trapped in the shell's sandbox;
//   • anything else is passed through sanitizeCricketHtml() and served with
//     `sandbox allow-scripts`, so the third-party document cannot open popups,
//     submit forms, download files or navigate this tab.
//
// The watch page frames this route with sandbox="allow-scripts allow-same-origin"
// because EME also rejects a unique origin set by the iframe attribute alone.
// The sanitized third-party document stays isolated by its own header policy;
// the first-party documents are this app's own markup.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

/** A source page is small HTML; refuse anything that looks like a payload. */
const MAX_HTML_BYTES = 2_000_000;
const UPSTREAM_TIMEOUT_MS = 15_000;
const TOKEN_ORIGINS = new Set([
  "https://sonujson-v4.pages.dev",
  "https://allrounder2-0.pages.dev",
]);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Third-party page: the only policy that is therefore allowed to run the source
 * JavaScript. `sandbox` keeps it on an opaque origin.
 */
const RESPONSE_HEADERS = {
  ...BASE_HEADERS,
  // `sandbox` makes the document an opaque origin. The source's player scripts
  // and its CDN/stream hosts are allowed inside that sandbox; the app's own
  // report-only policy is overridden for this path in next.config.mjs.
  "Content-Security-Policy": [
    "sandbox allow-scripts",
    "frame-ancestors 'self'",
    "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  ].join("; "),
} as const;

/**
 * Our own player page. Deliberately NO `sandbox`: an opaque origin cannot use
 * EME, which is what the ClearKey streams need. Only Shaka's CDN script and the
 * stream hosts are reachable, and nothing third-party is ever parsed.
 */
const PLAYER_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src data: blob:",
  "media-src https: blob:",
  "connect-src https:",
  // Shaka's controls.css pulls Roboto; without this the UI falls back silently.
  "font-src https://fonts.gstatic.com",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Our own shell page: one nested frame, back through this same route. */
const FRAME_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function errorPage(status: number, message: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Cricket stream unavailable</title>
<style>
html,body{height:100%;margin:0;background:#000;color:#e5e5e5;
font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
body{display:grid;place-items:center;text-align:center;padding:24px}
p{max-width:34rem;margin:0}
</style></head><body><p>${message}</p></body></html>`;

  return new NextResponse(html, {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      // An error must never be framed as a working player by a later retry.
      "Content-Security-Policy":
        "sandbox allow-scripts; frame-ancestors 'self'; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

/** Read a response body without ever buffering more than `max` bytes. */
async function readCapped(
  response: Response,
  max: number
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let total = 0;
  let out = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}

/** Fetch the short-lived CDN token without exposing a cross-origin JSON fetch
 * to the opaque/sandboxed source document. */
async function resolveCricketToken(
  config: CricketStreamConfig
): Promise<string | null> {
  if (!config.cookieUrl) return null;
  let url: URL;
  try {
    url = new URL(config.cookieUrl);
  } catch {
    return null;
  }
  if (!TOKEN_ORIGINS.has(url.origin)) return null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": BROWSER_UA, accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      cookie?: unknown;
      channels?: Array<{ id?: unknown; cookie?: unknown }>;
    };
    if (typeof data.cookie === "string" && data.cookie.trim()) {
      return data.cookie.trim();
    }
    const wanted = config.channelId?.trim().toLowerCase();
    const channel = data.channels?.find(
      (item) =>
        wanted && String(item.id ?? "").trim().toLowerCase() === wanted
    );
    return typeof channel?.cookie === "string" && channel.cookie.trim()
      ? channel.cookie.trim()
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return errorPage(400, "No cricket stream URL was supplied.");
  }

  const allowlist = getCricketEmbedAllowlist();
  const target = parseAllowedCricketUrl(raw, allowlist);
  if (!target) {
    return errorPage(403, "That cricket stream is not configured on this site.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        referer: `${target.origin}/`,
      },
    });
  } catch {
    return errorPage(502, "The cricket source did not respond.");
  } finally {
    clearTimeout(timer);
  }

  // A redirect may not leave the configured set. Check the FINAL URL, not the
  // one the visitor passed in.
  let finalUrl: URL;
  try {
    finalUrl = new URL(upstream.url || target.href);
  } catch {
    return errorPage(502, "The cricket source returned an invalid redirect.");
  }
  if (!allowlist.has(finalUrl.origin)) {
    return errorPage(502, "The cricket source redirected to an unconfigured host.");
  }

  if (!upstream.ok) {
    return errorPage(502, "The cricket source is currently unavailable.");
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return errorPage(502, "The cricket source did not return a playable page.");
  }

  const html = await readCapped(upstream, MAX_HTML_BYTES);
  if (html === null) {
    return errorPage(502, "The cricket source page was too large to process.");
  }

  // A page with a player config is replaced by our own document — the only way
  // the ClearKey streams can use EME. See src/lib/cricket-stream.ts.
  const document = buildCricketEmbedDocument(html, {
    sourceUrl: finalUrl.href,
    allowedOrigins: allowlist,
  });
  if (document) {
    if (document.kind === "player") {
      document.config.token = await resolveCricketToken(document.config);
      // Re-render after resolving the token. The browser no longer needs a
      // cross-origin token fetch.
      document.html = renderCricketPlayerPage(document.config);
    }
    return new NextResponse(document.html, {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        "Content-Security-Policy":
          document.kind === "player" ? PLAYER_CSP : FRAME_CSP,
      },
    });
  }

  let sanitized: string;
  try {
    sanitized = sanitizeCricketHtml(html, {
      sourceUrl: finalUrl.href,
      allowedOrigins: allowlist,
    });
  } catch {
    return errorPage(502, "The cricket source page could not be processed.");
  }

  return new NextResponse(sanitized, {
    status: 200,
    headers: RESPONSE_HEADERS,
  });
}
