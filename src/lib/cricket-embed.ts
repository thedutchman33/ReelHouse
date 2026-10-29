// ---------------------------------------------------------------------------
// Cricket embed sanitizer (pure string transform).
//
// The configured cricket pages are third-party HTML we are allowed to frame.
// They do three things Reelhouse does not want to show a visitor:
//
//   1. call window.confirm("Join our Telegram channel…") before playback, and
//      window.open a t.me tab when the visitor accepts;
//   2. detect that they are inside a sandbox (`isSandboxedEnv()`) and replace
//      the player with a "DISABLE SANDBOX" overlay;
//   3. load Monetag-style ad scripts (al5sm.com, 255md.com, my.rtmark.net).
//
// A browser userscript can fix this on ONE machine. This module fixes it for
// every visitor: /api/cricket/embed fetches the page server-side, runs it
// through here, and returns the result. The framed document is then sandboxed
// with `allow-scripts` only, so even a dialog that slips past the shim cannot
// open a popup, submit a form or navigate the Reelhouse tab.
//
// A player page is NOT served through here any more: ClearKey streams need EME,
// which a unique (sandboxed) origin can never use, so those pages are replaced
// by the first-party player in cricket-stream.ts. This path remains for pages
// without an extractable stream config (channel indexes, odd shells).
//
// This is deliberately NOT a general-purpose HTML sanitizer. It only ever runs
// on HTML fetched from an origin on the cricket allowlist, and it makes no
// attempt to parse arbitrary untrusted markup. Do not reuse it for user input.
// ---------------------------------------------------------------------------

/** Same-origin path that serves a sanitized source document. */
export const CRICKET_EMBED_PATH = "/api/cricket/embed";

/** A source page, expressed as the URL the browser should frame. */
export function cricketEmbedHref(sourceUrl: string): string {
  return `${CRICKET_EMBED_PATH}?url=${encodeURIComponent(sourceUrl)}`;
}

/**
 * True when `raw` is an absolute http(s) URL without embedded credentials.
 * The origin allowlist is checked separately — this only rejects URL shapes
 * that must never be fetched (javascript:, data:, file:, user:pass@…).
 */
export function isCricketSourceShape(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return true;
}

/** Parse `raw` only when its origin is on the allowlist. */
export function parseAllowedCricketUrl(
  raw: string,
  allowedOrigins: ReadonlySet<string>
): URL | null {
  if (!isCricketSourceShape(raw)) return null;
  const url = new URL(raw);
  return allowedOrigins.has(url.origin) ? url : null;
}

/**
 * Runs before any of the source page's own scripts. It answers every native
 * dialog with the "no thanks" branch, which is the branch the source already
 * uses to continue playback, and makes `document.domain` harmless in an
 * opaque-origin (sandboxed) frame.
 */
const DIALOG_SHIM = `<script data-reelhouse-cricket-shim>(function () {
  try {
    window.confirm = function () { return false; };
    window.alert = function () {};
    window.prompt = function () { return null; };
  } catch (e) {}
  try {
    Object.defineProperty(Document.prototype, "domain", {
      configurable: true,
      get: function () { return location.hostname; },
      set: function () {}
    });
  } catch (e) {}
})();</script>`;

/** Cosmetic removal of the Telegram funnel. The shim already stops its dialog. */
const CLEANUP_STYLE = `<style data-reelhouse-cricket-cleanup>
a[href*="t.me"], a[href*="telegram"], iframe[src*="t.me"],
.telegram-btn, .telegram-modal, [data-telegram],
[class*="telegram" i], [id*="telegram" i] { display: none !important; }
</style>`;

/** Ad/redirect hosts seen on the configured pages. */
const AD_HOST = /(?:al5sm\.com|255md\.com|my\.rtmark\.net)/i;

const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const IFRAME_TAG = /<iframe\b[^>]*>/gi;
const SRC_ATTRIBUTE =
  /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const HEAD_OPEN = /<head\b[^>]*>/i;
const HEAD_CLOSE = /<\/head>/i;
const BODY_CLOSE = /<\/body>/i;
const HTML_OPEN = /<html\b[^>]*>/i;

/** Decode the handful of entities a browser would decode inside an attribute. */
function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function injectAfterHeadOpen(html: string, snippet: string): string {
  if (HEAD_OPEN.test(html)) {
    return html.replace(HEAD_OPEN, (match) => `${match}\n${snippet}`);
  }
  if (HTML_OPEN.test(html)) {
    return html.replace(HTML_OPEN, (match) => `${match}\n<head>${snippet}</head>`);
  }
  return `${snippet}\n${html}`;
}

function injectBeforeHeadClose(html: string, snippet: string): string {
  if (HEAD_CLOSE.test(html)) {
    return html.replace(HEAD_CLOSE, `${snippet}\n</head>`);
  }
  if (BODY_CLOSE.test(html)) {
    return html.replace(BODY_CLOSE, `${snippet}\n</body>`);
  }
  return `${html}\n${snippet}`;
}

/**
 * Rewrite a nested iframe's `src` through this same route when it points at an
 * allowed cricket origin. dekhobhai/HIN is a shell around
 * newball/HIN1HD — without this, the inner page keeps its own Telegram prompt
 * and anti-sandbox overlay even though the outer page was cleaned.
 *
 * Anything else is left exactly as it was.
 */
function rewriteNestedIframes(
  html: string,
  base: URL,
  allowedOrigins: ReadonlySet<string>
): string {
  return html.replace(IFRAME_TAG, (tag) =>
    tag.replace(
      SRC_ATTRIBUTE,
      (attribute, doubleQuoted, singleQuoted, bare) => {
        const raw = decodeAttribute(
          doubleQuoted ?? singleQuoted ?? bare ?? ""
        ).trim();
        if (!raw) return attribute;

        let target: URL;
        try {
          target = new URL(raw, base);
        } catch {
          return attribute;
        }

        // Already proxied (or a deliberate non-network frame): leave it.
        if (target.pathname === CRICKET_EMBED_PATH) return attribute;
        if (
          target.protocol !== "https:" &&
          target.protocol !== "http:"
        ) {
          return attribute;
        }
        if (!allowedOrigins.has(target.origin)) return attribute;

        return ` src="${cricketEmbedHref(target.href)}"`;
      }
    )
  );
}

export interface CricketSanitizeOptions {
  /** Final URL of the fetched document — the base for relative iframe srcs. */
  sourceUrl: string;
  /** Origins a nested frame may be proxied from. */
  allowedOrigins: ReadonlySet<string>;
}

/**
 * Return the source document with the Telegram funnel, ad scripts and
 * anti-sandbox check removed. Pure: same input always yields the same output.
 */
export function sanitizeCricketHtml(
  html: string,
  { sourceUrl, allowedOrigins }: CricketSanitizeOptions
): string {
  const base = new URL(sourceUrl);

  let out = html;

  // Ad scripts are dropped whole. Keep every other <script> — the player needs
  // shaka-player and its own bootstrap.
  out = out.replace(SCRIPT_BLOCK, (block) =>
    AD_HOST.test(block) ? "" : block
  );

  // Replace every CALL to the anti-sandbox probe with `false`, leaving its
  // `function isSandboxedEnv()` definition intact. (A naive global replace
  // would rewrite the definition into `function false`, which is a syntax
  // error and would take the player's bootstrap down with it.)
  out = out.replace(
    /\bisSandboxedEnv\s*\(\s*\)/g,
    (match, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 16), offset);
      return /\bfunction\s+$/.test(before) ? match : "false";
    }
  );

  // The inner player (dekhobhai → newball/HIN1HD) goes through this route too.
  out = rewriteNestedIframes(out, base, allowedOrigins);

  // Shim first, so it is installed before the first source script runs.
  out = injectAfterHeadOpen(out, DIALOG_SHIM);
  // Cosmetic cleanup can sit at the end of <head>.
  out = injectBeforeHeadClose(out, CLEANUP_STYLE);

  return out;
}
