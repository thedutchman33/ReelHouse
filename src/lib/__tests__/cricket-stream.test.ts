import { describe, expect, it } from "vitest";
import {
  buildCricketEmbedDocument,
  extractCricketStreamConfig,
  firstAllowedFrameUrl,
  renderCricketFramePage,
  renderCricketPlayerPage,
} from "@/lib/cricket-stream";

// ---------------------------------------------------------------------------
// The player document is what makes ClearKey cricket streams playable: a
// sandboxed proxy is a unique origin, and EME is refused there. These tests pin
// the extraction contract and the fact that no third-party JavaScript survives.
// ---------------------------------------------------------------------------

const ALLOWED = new Set([
  "https://newball.pages.dev",
  "https://dekhobhai.pages.dev",
]);

const KEY_ID = "68318f7c97c55ba6ab8d0398a88fed3e";
const KEY = "d312fb3325b4eb9462b4a0d2b6794adf";

const PLAYER_PAGE = `<!DOCTYPE html>
<html><head><title>TG_@Cricinsider365</title>
<script>(function(s){s.src='https://al5sm.com/tag.min.js'})(document.body.appendChild(document.createElement('script')))</script>
</head><body>
<div id="player-container"><video id="video"></video></div>
<script>
if (confirm("Join Our Telegram Channel @Cricinsider365")) {window.location.href = "https://t.me/+IhSW51QysxU3NzY1";}
(function(){
  const CONFIG={
    streamUrl:"https://jiotvmblive.cdn.jio.com/bpk-tv/Ten_3_MOB/WDVLive/index.mpd",
    keyId:"${KEY_ID}",
    key:"${KEY}",
    cookieUrl:"https://allrounder2-0.pages.dev/api/Sony-3.json"
  };
})();
</script>
</body></html>`;

const SHELL_PAGE = `<!DOCTYPE html><html><body>
<script>const join = confirm("Join Our Telegram Channel");</script>
<iframe id="main-iframe" allowfullscreen src="https://newball.pages.dev/HIN1HD"></iframe>
</body></html>`;

const INDEX_PAGE = `<!DOCTYPE html><html><body>
<a href="/HIN">Ten 3</a><a href="/HIN1HD">Ten 3 HD</a>
</body></html>`;

describe("cricket stream config extraction", () => {
  it("reads the manifest, ClearKey pair and token endpoint", () => {
    expect(extractCricketStreamConfig(PLAYER_PAGE)).toEqual({
      streamUrl:
        "https://jiotvmblive.cdn.jio.com/bpk-tv/Ten_3_MOB/WDVLive/index.mpd",
      clearKeys: { [KEY_ID]: KEY },
      cookieUrl: "https://allrounder2-0.pages.dev/api/Sony-3.json",
      channelId: null,
    });
  });

  it("reads the current uppercase source-page config", () => {
    const config = extractCricketStreamConfig(`
      const STREAM_URL = "https://cdn.test/live/index.mpd";
      const DRM_KEYS = "${KEY_ID}:${KEY},deadbeef:bad";
      const COOKIE_JSON_URL = "https://token.test/sports.json";
    `);
    expect(config).toEqual({
      streamUrl: "https://cdn.test/live/index.mpd",
      clearKeys: { [KEY_ID]: KEY },
      cookieUrl: "https://token.test/sports.json",
      channelId: null,
    });
  });

  it("keeps EVERY ClearKey pair, not just the first", () => {
    // The Star Sports manifest encrypts video and audio with different KIDs;
    // dropping the later pairs stalls playback on the poster frame.
    const videoId = "a1ce6b9514f35174bda80ddd425bfd88";
    const videoKey = "5c5e158724eced92f92ca8286fb28fd9";
    const audioId = "11073b8f426e5092a2effada3bfaf721";
    const audioKey = "5d1c59a8052956bd056810f260161e5f";
    const config = extractCricketStreamConfig(`
      const STREAM_URL = "https://cdn.test/live/index.mpd";
      const DRM_KEYS = "${videoId.toUpperCase()}:${videoKey.toUpperCase()},${audioId}:${audioKey}";
    `);
    expect(config?.clearKeys).toEqual({
      [videoId]: videoKey,
      [audioId]: audioKey,
    });
  });

  it("returns null for a page with no player config", () => {
    expect(extractCricketStreamConfig(INDEX_PAGE)).toBeNull();
    expect(extractCricketStreamConfig(SHELL_PAGE)).toBeNull();
  });

  it("refuses a non-https or credentialed manifest", () => {
    expect(
      extractCricketStreamConfig(`CONFIG = { streamUrl: "http://cdn.test/a.mpd" }`)
    ).toBeNull();
    expect(
      extractCricketStreamConfig(
        `CONFIG = { streamUrl: "https://user:pass@cdn.test/a.mpd" }`
      )
    ).toBeNull();
    expect(extractCricketStreamConfig(`CONFIG = { streamUrl: "nope" }`)).toBeNull();
  });

  it("drops a half or malformed ClearKey pair instead of configuring DRM", () => {
    const halfKey = extractCricketStreamConfig(
      `CONFIG={streamUrl:"https://cdn.test/a.mpd",keyId:"${KEY_ID}"}`
    );
    expect(halfKey?.clearKeys).toEqual({});

    const malformed = extractCricketStreamConfig(
      `CONFIG={streamUrl:"https://cdn.test/a.mpd",keyId:"${KEY_ID}",key:"not-a-key"}`
    );
    expect(malformed?.clearKeys).toEqual({});
  });

  it("keeps a manifest with no DRM or token endpoint", () => {
    expect(
      extractCricketStreamConfig(`CONFIG={streamUrl:"https://cdn.test/a.m3u8"}`)
    ).toEqual({
      streamUrl: "https://cdn.test/a.m3u8",
      clearKeys: {},
      cookieUrl: null,
      channelId: null,
    });
  });
});

describe("nested frame detection", () => {
  it("finds the allowlisted shell frame", () => {
    expect(
      firstAllowedFrameUrl(SHELL_PAGE, new URL("https://dekhobhai.pages.dev/HIN/"), ALLOWED)
    ).toBe("https://newball.pages.dev/HIN1HD");
  });

  it("resolves relative frames against the fetched page", () => {
    const html = `<iframe src="/HIN1HD?a=1&amp;b=2"></iframe>`;
    expect(
      firstAllowedFrameUrl(html, new URL("https://newball.pages.dev/list/"), ALLOWED)
    ).toBe("https://newball.pages.dev/HIN1HD?a=1&amp;b=2");
  });

  it("ignores frames off the allowlist and frames already proxied", () => {
    expect(
      firstAllowedFrameUrl(
        `<iframe src="https://evil.example/watch"></iframe>`,
        new URL("https://dekhobhai.pages.dev/HIN/"),
        ALLOWED
      )
    ).toBeNull();
    expect(
      firstAllowedFrameUrl(
        `<iframe src="/api/cricket/embed?url=https%3A%2F%2Fnewball.pages.dev%2FHIN"></iframe>`,
        new URL("https://dekhobhai.pages.dev/HIN/"),
        ALLOWED
      )
    ).toBeNull();
  });
});

describe("embed document selection", () => {
  it("replaces a player page with the first-party player", () => {
    const doc = buildCricketEmbedDocument(PLAYER_PAGE, {
      sourceUrl: "https://newball.pages.dev/HIN/",
      allowedOrigins: ALLOWED,
    });
    expect(doc?.kind).toBe("player");
    if (doc?.kind !== "player") return;
    expect(doc.html).toContain("data-reelhouse-cricket-player");
    expect(doc.html).toContain(KEY_ID);
    expect(doc.html).toContain(KEY);
    expect(doc.html).toContain("index.mpd");
  });

  it("reduces a shell page to a first-party frame around the nested player", () => {
    const doc = buildCricketEmbedDocument(SHELL_PAGE, {
      sourceUrl: "https://dekhobhai.pages.dev/HIN/",
      allowedOrigins: ALLOWED,
    });
    expect(doc?.kind).toBe("frame");
    if (doc?.kind !== "frame") return;
    expect(doc.nestedUrl).toBe("https://newball.pages.dev/HIN1HD");
    expect(doc.html).toContain(
      `/api/cricket/embed?url=${encodeURIComponent("https://newball.pages.dev/HIN1HD")}`
    );
  });

  it("leaves an index page to the sanitizer", () => {
    expect(
      buildCricketEmbedDocument(INDEX_PAGE, {
        sourceUrl: "https://newball.pages.dev/",
        allowedOrigins: ALLOWED,
      })
    ).toBeNull();
  });
});

describe("first-party player document", () => {
  const html = renderCricketPlayerPage({
    streamUrl: "https://cdn.test/a.mpd",
    clearKeys: { [KEY_ID]: KEY },
      cookieUrl: "https://cdn.test/token.json",
      channelId: "H1HD",
      token: "__hdnea__=test",
  });

  it("never carries source HTML or its scripts", () => {
    expect(html).not.toContain("telegram");
    expect(html).not.toContain("t.me");
    expect(html).not.toContain("al5sm");
    expect(html).not.toContain("@Cricinsider365");
    expect(html).not.toContain("confirm(");
  });

  it("loads Shaka from its CDN and installs the token filter", () => {
    expect(html).toContain("cdn.jsdelivr.net/npm/shaka-player@");
    expect(html).toContain("__hdnea__");
    expect(html).toContain("clearKeys");
  });

  it("escapes markup inside the injected config", () => {
    const hostile = renderCricketPlayerPage({
      streamUrl: "https://cdn.test/a.mpd</script><script>alert(1)</script>",
      clearKeys: {},
      cookieUrl: null,
    });
    expect(hostile).not.toContain("</script><script>alert(1)");
    expect(hostile).toContain("\\u003c/script");
  });

  it("renders a sandbox-free shell for a nested frame", () => {
    const shell = renderCricketFramePage("/api/cricket/embed?url=x");
    expect(shell).toContain('src="/api/cricket/embed?url=x"');
    expect(shell).toContain("encrypted-media");
    expect(shell).toContain("data-reelhouse-cricket-frame");
  });
});
