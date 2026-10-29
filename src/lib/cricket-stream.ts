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
  /** ClearKey pair, both 32 hex characters, or nulls when unencrypted. */
  keyId: string | null;
  key: string | null;
  /** Endpoint that returns `{ "cookie": "__hdnea__=…" }` for the CDN. */
  cookieUrl: string | null;
  /** Channel id used when the token endpoint returns a channel list. */
  channelId?: string | null;
  /** Short-lived CDN token fetched server-side by the embed route. */
  token?: string | null;
}

const HEX_32 = /^[0-9a-f]{32}$/i;

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

  const keyId = configString(html, "keyId");
  const key = configString(html, "key");
  let clearKeyId = keyId;
  let clearKey = key;

  // newball's current page publishes comma-separated ClearKey pairs as
  // `DRM_KEYS="keyId:key,..."` instead of separate keyId/key properties.
  if (!clearKeyId || !clearKey) {
    const drmKeys = constantString(html, "DRM_KEYS");
    const firstPair = drmKeys?.split(",")[0]?.trim();
    const separator = firstPair?.indexOf(":") ?? -1;
    if (separator > 0) {
      clearKeyId = firstPair!.slice(0, separator).trim();
      clearKey = firstPair!.slice(separator + 1).trim();
    }
  }

  const hasClearKey = Boolean(
    clearKeyId && clearKey && HEX_32.test(clearKeyId) && HEX_32.test(clearKey)
  );

  return {
    streamUrl,
    keyId: hasClearKey ? clearKeyId! : null,
    key: hasClearKey ? clearKey! : null,
    cookieUrl: httpsUrl(
      sourceString(html, "cookieUrl", "COOKIE_JSON_URL")
    ),
    channelId: sourceString(html, "channelId", "CHANNEL_ID"),
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
    keyId: config.keyId,
    key: config.key,
    cookieUrl: config.cookieUrl,
    channelId: config.channelId,
    token: config.token ?? null,
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
    if (CONFIG.keyId && CONFIG.key) { drm.clearKeys = {}; drm.clearKeys[CONFIG.keyId] = CONFIG.key; }

    player.configure({
      drm: drm,
      manifest: { defaultPresentationDelay: 5 },
      streaming: { lowLatencyMode: true, bufferingGoal: 10, rebufferingGoal: 2, safeSeekOffset: 5 }
    });

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

    return fetchToken().then(function (token) {
      if (token) withToken(token);
      return player.load(CONFIG.streamUrl).then(function () {
        video.play().catch(function () {});
      });
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
