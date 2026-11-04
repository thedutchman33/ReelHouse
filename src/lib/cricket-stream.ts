// ---------------------------------------------------------------------------
// Cricket stream extraction + first-party player document.
//
// The proxied source pages (newball.pages.dev, dekhobhai.pages.dev) all play
// through Shaka Player with a plain-JS config object:
//
//   const CONFIG = {
//     streamUrl: "https://…/index.mpd",
//     keyId: "…32 hex…", key: "…32 hex…",   // ClearKey pairs (optional)
//     cookieUrl: "https://…/api/Sony-3.json" // signed-URL token (optional)
//   };
//
// Their own bootstrap cannot run under our proxy: the sanitizer response is
// sandboxed, and Chrome refuses Encrypted Media Extensions on a unique origin
// ("EME use is not allowed on unique origins"), so `createMediaKeys()` fails and
// Shaka reports 6002 FAILED_TO_CREATE_CDM. Every cricket stream here is
// ClearKey-encrypted, so the sandboxed page is always a black player.
//
// The fix is to stop running third-party JavaScript at all. The route reads the
// config above from the fetched HTML and returns THIS document instead: our own
// player page, first-party, no sandbox, no ad scripts, no Telegram funnel. The
// source HTML never reaches the browser. Pages with no playable config keep the
// sanitized path; a page that is only a shell around another player page is
// reduced to a first-party full-bleed frame around that nested page.
// ---------------------------------------------------------------------------

import { CRICKET_EMBED_PATH, cricketEmbedHref } from "@/lib/cricket-embed";

/** Shaka build the source pages use. Pinned: the config shape is version-bound. */
const SHAKA_VERSION = "4.16.2";
const SHAKA_SCRIPT = `https://cdn.jsdelivr.net/npm/shaka-player@${SHAKA_VERSION}/dist/shaka-player.ui.min.js`;
const SHAKA_STYLES = `https://cdn.jsdelivr.net/npm/shaka-player@${SHAKA_VERSION}/dist/controls.css`;

export interface CricketStreamConfig {
  /** Absolute media manifest (`.mpd` / `.m3u8`). */
  streamUrl: string;
  /**
   * Every ClearKey pair the page publishes, as `keyId → key` (lowercase hex).
   * Empty when the stream is unencrypted.
   *
   * The current sources list up to five pairs in `DRM_KEYS`, and a single
   * manifest can use different KIDs for its video and audio tracks (Star
   * Sports: video `a1ce…`, audio `1107…`). Configuring only the first pair
   * leaves the other track undecryptable, and playback stalls on the poster
   * frame while the element waits in `seeking`.
   */
  clearKeys: Record<string, string>;
  /** Endpoint that returns `{ "cookie": "__hdnea__=…" }` for the CDN. */
  cookieUrl: string | null;
  /** Channel id used when the token endpoint returns a channel list. */
  channelId?: string | null;
  /** Short-lived CDN token fetched server-side by the embed route. */
  token?: string | null;
  /**
   * Trend48 segments are MPEG-TS inside a WebP/EXIF envelope. The player
   * unwraps them in a Shaka response filter before the HLS parser sees them.
   */
  unwrapWebpSegments?: boolean;
  /** Same-origin endpoint that returns a fresh signed manifest URL. */
  refreshUrl?: string | null;
  /** Manifest expiry in Unix milliseconds, when known. */
  expiresAt?: number | null;
}

const HEX_32 = /^[0-9a-f]{32}$/i;

/** Add one `keyId → key` pair when both halves are 32 hex characters. */
function addClearKeyPair(
  clearKeys: Record<string, string>,
  keyId: unknown,
  key: unknown
): void {
  if (typeof keyId !== "string" || typeof key !== "string") return;
  const id = keyId.trim().toLowerCase();
  const value = key.trim().toLowerCase();
  if (HEX_32.test(id) && HEX_32.test(value)) clearKeys[id] = value;
}

function httpsUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Read `name: "value"` out of inline JS, tolerating quotes and spacing. */
function configString(html: string, name: string): string | null {
  const pattern = new RegExp(
    `(?:^|[^\\w$])${name}\\s*:\\s*(["'])([^"'\\n]*?)\\1`,
    "m"
  );
  const match = pattern.exec(html);
  return match ? match[2].trim() : null;
}

/** Read `const NAME = "value"` from the source-page variant. */
function constantString(html: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b(?:const|let|var)\\s+${name}\\s*=\\s*(["'])([^"'\\n]*?)\\1`,
    "m"
  );
  const match = pattern.exec(html);
  return match ? match[2].trim() : null;
}

function sourceString(html: string, camelName: string, constantName: string): string | null {
  return configString(html, camelName) ?? constantString(html, constantName);
}

/**
 * Pull the player config out of a fetched source page. Returns null unless the
 * page carries an absolute https manifest — that is the signal that this page is
 * a player, not a channel index or a shell.
 */
export function extractCricketStreamConfig(
  html: string
): CricketStreamConfig | null {
  // The current sources have used both a CONFIG object (camelCase) and
  // top-level constants (UPPER_SNAKE_CASE). Support both forms; the latter is
  // what newball.pages.dev currently serves.
  const streamUrl = httpsUrl(
    sourceString(html, "streamUrl", "STREAM_URL")
  );
  if (!streamUrl) return null;

  // Two published shapes: a single `keyId`/`key` pair, or a `kid:key,…` list.
  // newball publishes that list as `DRM_KEYS`; the ci365 static players publish
  // it as `RAW_KEYS`. Keep every valid pair — the manifest's tracks do not
  // share one KID.
  const clearKeys: Record<string, string> = {};
  addClearKeyPair(clearKeys, configString(html, "keyId"), configString(html, "key"));

  const drmKeys =
    constantString(html, "DRM_KEYS") ?? constantString(html, "RAW_KEYS");
  for (const pair of drmKeys?.split(",") ?? []) {
    const separator = pair.indexOf(":");
    if (separator <= 0) continue;
    addClearKeyPair(clearKeys, pair.slice(0, separator), pair.slice(separator + 1));
  }

  return {
    streamUrl,
    clearKeys,
    cookieUrl: httpsUrl(
      sourceString(html, "cookieUrl", "COOKIE_JSON_URL")
    ),
    channelId: sourceString(html, "channelId", "CHANNEL_ID"),
  };
}

export interface CricketChannelSource {
  /** JSON list endpoint the page declares as `var API = "…"`. */
  apiUrl: string;
  /** Channel id taken from the source page's own `?id=` query. */
  channelId: string;
}

/**
 * ci365's `/star?id=…` page is not a static player: its markup has no manifest
 * and its script reads `?id=` from its OWN `location.search` to pick a record
 * from a JSON channel list. Behind the embed proxy that location is
 * `/api/cricket/embed?url=…`, so the id is gone and the page falls back to its
 * channel directory instead of playing. The route resolves the record
 * server-side from the URL it actually fetched, which still carries `?id=`.
 */
export function extractCricketChannelSource(
  html: string,
  sourceUrl: string
): CricketChannelSource | null {
  const apiUrl = httpsUrl(constantString(html, "API"));
  if (!apiUrl) return null;

  // Only the runtime-list template. A static player page is handled above; an
  // index page does not reference `stream_url`.
  if (!/\bchannels\b/.test(html) || !/\bstream_url\b/.test(html)) return null;

  let rawId: string | null;
  try {
    rawId = new URL(sourceUrl).searchParams.get("id");
  } catch {
    return null;
  }
  const channelId = rawId?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(channelId)) return null;

  return { apiUrl, channelId };
}

interface CricketChannelRecord {
  id?: unknown;
  stream_url?: unknown;
  cookie?: unknown;
  key_id?: unknown;
  key?: unknown;
  sonuxs?: unknown;
}

/**
 * Turn a record from the channel JSON into the same config shape a static
 * player page publishes. `cookie` is the signed-URL token for that channel; the
 * route fetches it fresh on every embed request, so the source's expiry is the
 * only expiry.
 */
export function cricketChannelStreamConfig(
  data: unknown,
  channelId: string
): CricketStreamConfig | null {
  if (!data || typeof data !== "object") return null;
  const channels = (data as { channels?: unknown }).channels;
  if (!Array.isArray(channels)) return null;

  const record = channels.find(
    (item): item is CricketChannelRecord =>
      !!item &&
      typeof item === "object" &&
      String((item as { id?: unknown }).id ?? "") === channelId
  );
  if (!record) return null;

  const streamUrl =
    typeof record.stream_url === "string"
      ? httpsUrl(record.stream_url.trim())
      : null;
  if (!streamUrl) return null;

  // The list publishes every ClearKey pair in `sonuxs`; fall back to the single
  // `key_id`/`key` form when that list is absent.
  const clearKeys: Record<string, string> = {};
  if (Array.isArray(record.sonuxs)) {
    for (const entry of record.sonuxs) {
      if (typeof entry !== "string") continue;
      const separator = entry.indexOf(":");
      if (separator <= 0) continue;
      addClearKeyPair(
        clearKeys,
        entry.slice(0, separator),
        entry.slice(separator + 1)
      );
    }
  }
  if (Object.keys(clearKeys).length === 0) {
    addClearKeyPair(clearKeys, record.key_id, record.key);
  }

  return {
    streamUrl,
    clearKeys,
    cookieUrl: null,
    channelId,
    token:
      typeof record.cookie === "string" && record.cookie.trim()
        ? record.cookie.trim()
        : null,
  };
}

/**
 * The first iframe in the page whose resolved URL is on the allowlist. Used for
 * shell pages (dekhobhai/HIN is a full-bleed frame around newball/HIN1HD).
 */
export function firstAllowedFrameUrl(
  html: string,
  base: URL,
  allowedOrigins: ReadonlySet<string>
): string | null {
  const tags = html.match(/<iframe\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const match = /src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
    const raw = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
    if (!raw) continue;
    try {
      const url = new URL(raw, base);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      if (!allowedOrigins.has(url.origin)) continue;
      if (url.pathname === CRICKET_EMBED_PATH) continue;
      return url.href;
    } catch {
      // A malformed src is not a candidate.
    }
  }
  return null;
}

const PAGE_STYLE = `*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden;color:#e5e5e5;
font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#player-container{position:fixed;inset:0;background:#000}
video{width:100%;height:100%;object-fit:contain;background:#000}
[data-player-error]{position:fixed;inset:auto 0 0;padding:12px 16px;background:rgba(0,0,0,.82);
color:#fca5a5;text-align:center}`;

/** JSON that is safe inside an inline <script>. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
}

/**
 * First-party player document. It loads Shaka from its CDN, applies the
 * ClearKey pair, and installs the same signed-URL token filter the source page
 * uses — but as our code, in a real origin, so EME is permitted.
 */
export function renderCricketPlayerPage(config: CricketStreamConfig): string {
  const inline = scriptJson({
    streamUrl: config.streamUrl,
    clearKeys: config.clearKeys,
    cookieUrl: config.cookieUrl,
    channelId: config.channelId,
    token: config.token ?? null,
    unwrapWebpSegments: config.unwrapWebpSegments === true,
    refreshUrl: config.refreshUrl ?? null,
    expiresAt: config.expiresAt ?? null,
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cricket Live</title>
<link rel="stylesheet" href="${SHAKA_STYLES}">
<style>${PAGE_STYLE}</style>
</head>
<body>
<div id="player-container"><video id="video" autoplay muted playsinline preload="auto"></video></div>
<script src="${SHAKA_SCRIPT}"></script>
<script data-reelhouse-cricket-player>
(function () {
  var CONFIG = ${inline};
  var video = document.getElementById("video");
  var container = document.getElementById("player-container");

  function fail(message) {
    var node = document.createElement("p");
    node.setAttribute("data-player-error", "");
    node.textContent = message;
    document.body.appendChild(node);
  }

  if (!window.shaka) { fail("The player library did not load. Check your connection and retry."); return; }

  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) { fail("This browser cannot play the stream."); return; }

  var player = new shaka.Player();
  player.attach(video).then(function () {
    if (shaka.ui) { new shaka.ui.Overlay(player, container, video); }

    var drm = {};
    if (CONFIG.clearKeys && Object.keys(CONFIG.clearKeys).length) {
      drm.clearKeys = CONFIG.clearKeys;
    }

    player.configure({
      drm: drm,
      manifest: { defaultPresentationDelay: 5 },
      streaming: { lowLatencyMode: true, bufferingGoal: 10, rebufferingGoal: 2, safeSeekOffset: 5 }
    });

    // Trend48 (and the TikTok CDN it uses) serves each MPEG-TS segment inside
    // a WebP container. Shaka would feed the RIFF header to the TS parser, so
    // replace the response body with the EXIF payload before the parser runs.
    if (CONFIG.unwrapWebpSegments) {
      player.getNetworkingEngine().registerResponseFilter(function (type, response) {
        if (type !== shaka.net.NetworkingEngine.RequestType.SEGMENT) return;
        var data = response.data;
        if (!data) return;
        var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        if (bytes.length < 16) return;
        if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return;
        if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return;
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var offset = 12;
        while (offset + 8 <= bytes.length) {
          var tag = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
          var size = view.getUint32(offset + 4, true);
          var start = offset + 8;
          if (start + size > bytes.length) return;
          if (tag === "EXIF" && size > 0 && bytes[start] === 0x47) {
            response.data = bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + size);
            response.headers = response.headers || {};
            response.headers["content-type"] = "video/mp2t";
            return;
          }
          offset = start + size + (size & 1);
        }
      });
    }

    function withToken(token) {
      player.getNetworkingEngine().registerRequestFilter(function (type, request) {
        try {
          request.headers["Referer"] = "https://www.jiotv.com/";
          request.headers["User-Agent"] = "plaYtv/7.1.5 (Linux;Android 13) ExoPlayerLib/2.11.6";
          request.headers["Cookie"] = token;
        } catch (e) {}
        var manifest = shaka.net.NetworkingEngine.RequestType.MANIFEST;
        var segment = shaka.net.NetworkingEngine.RequestType.SEGMENT;
        if (type !== manifest && type !== segment) return;
        var uri = request.uris[0];
        if (!uri || uri.indexOf("__hdnea__") !== -1) return;
        var bare = token.indexOf("__hdnea__=") === 0 ? token.slice(10) : token;
        request.uris[0] = uri + (uri.indexOf("?") === -1 ? "?" : "&") + "__hdnea__=" + bare;
      });
    }

    function fetchToken() {
      // The route fetches this server-side. Keeping the fallback makes the
      // document useful for a source whose endpoint already allows CORS, but
      // normal production playback never depends on cross-origin JSON access.
      if (CONFIG.token) return Promise.resolve(CONFIG.token);
      if (!CONFIG.cookieUrl) return Promise.resolve("");
      return fetch(CONFIG.cookieUrl, { cache: "no-store" })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (data && data.cookie) return data.cookie;
          var channels = data && Array.isArray(data.channels) ? data.channels : [];
          var channel = channels.find(function (item) {
            return String(item && item.id || "").toLowerCase() === String(CONFIG.channelId || "").toLowerCase();
          });
          return channel && channel.cookie || "";
        })
        .catch(function () { return ""; });
    }

    function loadStream(url) {
      return player.load(url).then(function () {
        var error = document.querySelector("[data-player-error]");
        if (error) error.remove();
        video.play().catch(function () {});
      });
    }

    // Trend48's signed manifest expires every few hours. Re-resolve through the
    // same-origin route instead of making the viewer reload the page. After a
    // few failures, reload the frame so the server can resolve a fresh ticket.
    var refreshAttempts = 0;
    function refreshStream() {
      if (!CONFIG.refreshUrl) return;
      if (refreshAttempts >= 3) {
        setTimeout(function () { window.location.reload(); }, 5000);
        return;
      }
      refreshAttempts++;
      setTimeout(function () {
        fetch(CONFIG.refreshUrl, { cache: "no-store" })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (!data || typeof data.streamUrl !== "string") throw new Error("no stream");
            return loadStream(data.streamUrl).then(function () { refreshAttempts = 0; });
          })
          .catch(function () { refreshStream(); });
      }, 1500 * refreshAttempts);
    }
    player.addEventListener("error", refreshStream);

    return fetchToken().then(function (token) {
      if (token) withToken(token);
      return loadStream(CONFIG.streamUrl);
    });
  }).catch(function (error) {
    fail(error && error.message ? error.message : "The stream could not be started.");
  });

  // Unmuting autoplay without user activation makes Chrome pause the element
  // again, so only lift the mute when the visitor has already interacted.
  video.addEventListener("play", function () {
    try {
      if (navigator.userActivation && navigator.userActivation.hasBeenActive) video.muted = false;
    } catch (e) {}
  });
})();
</script>
</body>
</html>`;
}

/**
 * First-party shell: a full-bleed frame around another proxied page. Used when
 * the source page is only an iframe shell, so the nested player page is not
 * trapped in the shell's (sandboxed, unique-origin) document.
 */
export function renderCricketFramePage(nestedHref: string): string {
  const src = nestedHref.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cricket Live</title>
<style>${PAGE_STYLE}
iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}</style>
</head>
<body><iframe data-reelhouse-cricket-frame src="${src}" allow="encrypted-media; fullscreen; autoplay; picture-in-picture" allowfullscreen></iframe></body>
</html>`;
}

export type CricketEmbedDocument =
  | { kind: "player"; html: string; config: CricketStreamConfig }
  | { kind: "frame"; html: string; nestedUrl: string };

/**
 * Decide what the embed route should serve for a fetched source page.
 *
 *   player — the page carries a stream config, so serve our own player;
 *   frame  — the page is a shell around another allowlisted page, so frame the
 *            nested page directly (its own response becomes a player page);
 *   null   — neither, keep the sanitized third-party document.
 */
export function buildCricketEmbedDocument(
  html: string,
  {
    sourceUrl,
    allowedOrigins,
  }: { sourceUrl: string; allowedOrigins: ReadonlySet<string> }
): CricketEmbedDocument | null {
  const config = extractCricketStreamConfig(html);
  if (config) {
    return { kind: "player", html: renderCricketPlayerPage(config), config };
  }

  const base = new URL(sourceUrl);
  const nestedUrl = firstAllowedFrameUrl(html, base, allowedOrigins);
  if (nestedUrl) {
    return {
      kind: "frame",
      html: renderCricketFramePage(cricketEmbedHref(nestedUrl)),
      nestedUrl,
    };
  }

  return null;
}
