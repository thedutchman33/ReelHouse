// ---------------------------------------------------------------------------
// Trend48 Live TV resolution.
//
// A Trend48 channel page is not a player. It is a chain of iframes:
//
//   https://trend48.st/live-tv?ch=<slug>
//     -> https://trendy48.site/embed/<slug>
//       -> https://ehgembxe.cfd/trefoxy/<slug>
//         -> https://ehgembxe.cfd/trefoxy/pl/<JWT>
//
// The last document is a JW Player page with an anti-sandbox script, which is
// why framing it through the generic cricket proxy shows SANDBOX DETECTED. The
// stream itself is not sandboxed: the page carries a small binary "ticket", and
// that ticket decodes to a signed HLS manifest on tims-001.sytes.net.
//
// We never execute the relay's JavaScript. We follow the iframe chain
// server-side, decode the ticket statically, and hand the signed manifest to our
// own player. The manifest's segments are real MPEG-TS, but TikTok's CDN serves
// each one inside a WebP/EXIF envelope; renderCricketPlayerPage() unwraps that
// envelope in a Shaka response filter.
// ---------------------------------------------------------------------------

const TREND48_ORIGIN = "https://trend48.st";
const TREND48_EMBED_ORIGIN = "https://trendy48.site";
const TREND48_RELAY_ORIGIN = "https://ehgembxe.cfd";
const TREND48_TICKET_ORIGIN = "https://tims-001.sytes.net";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TICKET_PATH_PATTERN = /^\/p\/[a-f0-9]{16,128}$/i;
const TICKET_MARKER = /https:\/\/tims-001\.sytes\.net\/p\/[a-f0-9]{16,128}/i;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_HTML_BYTES = 2_000_000;
const MAX_TICKET_BYTES = 4_096;
const UPSTREAM_TIMEOUT_MS = 15_000;

export interface Trend48Channel {
  slug: string;
  /** Signed HLS manifest. Short-lived; re-resolve through the ticket. */
  streamUrl: string;
  /** Manifest expiry in Unix milliseconds, when the path carries one. */
  expiresAt: number | null;
}

/**
 * Read the channel slug out of the URL an operator puts in the cricket env.
 * Only the public Live TV directory is accepted; arbitrary Trend48 URLs are not
 * proxied.
 */
export function trend48ChannelSlug(sourceUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.origin !== TREND48_ORIGIN) return null;
  if (url.pathname !== "/live-tv") return null;
  const slug = url.searchParams.get("ch")?.trim() ?? "";
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Decode the small loader script that carries the ticket URL. The relay rotates
 * the variable names and the XOR/offset pair on every response, so everything is
 * read from the script instead of hard-coded.
 *
 * Shape: `var _x=[…],_a=50,_b=218,_c="",…` and
 *        `String.fromCharCode(((_x[i]^_a)-_b+256)%256)`.
 */
export function decodeTrend48Loader(script: string): string | null {
  const match = script.match(
    /var _[A-Za-z0-9]+=\[([\d,\s]+)\],_[A-Za-z0-9]+=(\d+),_[A-Za-z0-9]+=(\d+),/
  );
  if (!match) return null;

  const values = match[1].split(",").map((value) => Number(value));
  const xor = Number(match[2]);
  const offset = Number(match[3]);
  if (
    values.length === 0 ||
    values.length > 100_000 ||
    values.some((value) => !Number.isInteger(value))
  ) {
    return null;
  }

  let decoded = "";
  for (const value of values) {
    decoded += String.fromCharCode(((value ^ xor) - offset + 256) % 256);
  }
  return decoded;
}

/**
 * Decode the binary ticket. The first byte is a seed; every following byte is
 * XORed with the ticket id and the seed, exactly as the relay's own loader does.
 */
export function decodeTrend48Ticket(
  ticketUrl: string,
  bytes: Uint8Array
): string | null {
  if (bytes.length < 2) return null;
  const key = ticketUrl.slice(ticketUrl.lastIndexOf("/") + 1);
  if (!key) return null;

  const seed = bytes[0];
  let decoded = "";
  for (let index = 1; index < bytes.length; index++) {
    decoded += String.fromCharCode(
      bytes[index] ^
        key.charCodeAt((index - 1) % key.length) ^
        ((seed + index - 1) & 0xff)
    );
  }
  return decoded.trim() || null;
}

async function fetchText(url: string, referer: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        referer,
      },
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.length <= MAX_HTML_BYTES ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTicket(
  ticketUrl: string,
  referer: string
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(ticketUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": BROWSER_UA, referer },
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_TICKET_BYTES) return null;
    return new Uint8Array(buffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function firstIframeUrl(html: string): URL | null {
  const match =
    /<iframe\b[^>]*src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(
      html
    );
  const raw = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw, `${TREND48_EMBED_ORIGIN}/`);
  } catch {
    return null;
  }
}

function ticketUrlFromHtml(html: string): string | null {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const decoded = decodeTrend48Loader(match[1]);
    if (!decoded) continue;
    const ticket = TICKET_MARKER.exec(decoded);
    if (ticket) return ticket[0];
  }
  return null;
}

/**
 * Resolve one Live TV channel to a signed HLS manifest. The ticket itself is
 * short-lived and changes on every page load, so this is intentionally not
 * cached. The player calls it again through `?resolve=1` when the manifest
 * expires.
 */
export async function resolveTrend48Channel(
  slug: string
): Promise<Trend48Channel | null> {
  if (!SLUG_PATTERN.test(slug)) return null;

  const liveUrl = `${TREND48_ORIGIN}/live-tv?ch=${encodeURIComponent(slug)}`;
  const embedHtml = await fetchText(
    `${TREND48_EMBED_ORIGIN}/embed/${encodeURIComponent(slug)}`,
    liveUrl
  );
  if (!embedHtml) return null;

  const relay = firstIframeUrl(embedHtml);
  if (
    !relay ||
    relay.origin !== TREND48_RELAY_ORIGIN ||
    !relay.pathname.startsWith("/trefoxy/")
  ) {
    return null;
  }

  const relayHtml = await fetchText(relay.href, `${TREND48_EMBED_ORIGIN}/`);
  if (!relayHtml) return null;

  const ticketUrl = ticketUrlFromHtml(relayHtml);
  if (!ticketUrl) return null;

  let ticket: URL;
  try {
    ticket = new URL(ticketUrl);
  } catch {
    return null;
  }
  if (
    ticket.origin !== TREND48_TICKET_ORIGIN ||
    !TICKET_PATH_PATTERN.test(ticket.pathname)
  ) {
    return null;
  }

  const bytes = await fetchTicket(ticket.href, relay.href);
  if (!bytes) return null;

  const decoded = decodeTrend48Ticket(ticket.href, bytes);
  if (!decoded) return null;

  let stream: URL;
  try {
    stream = new URL(decoded);
  } catch {
    return null;
  }
  if (
    stream.origin !== TREND48_TICKET_ORIGIN ||
    !stream.pathname.startsWith("/main/secure/") ||
    !stream.pathname.endsWith(".m3u8")
  ) {
    return null;
  }

  // /main/secure/<hash>/<expiry>/<name>.m3u8
  const parts = stream.pathname.split("/").filter(Boolean);
  const expiry = Number(parts[3]);
  return {
    slug,
    streamUrl: stream.href,
    expiresAt:
      Number.isFinite(expiry) && expiry > 0 ? expiry * 1000 : null,
  };
}
