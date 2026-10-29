import { describe, expect, it } from "vitest";
import {
  CRICKET_EMBED_PATH,
  isCricketSourceShape,
  parseAllowedCricketUrl,
  sanitizeCricketHtml,
} from "@/lib/cricket-embed";

// ---------------------------------------------------------------------------
// Sanitizer tests. These are string-level, but they pin the exact behaviours a
// browser verification depends on: shim before source scripts, the anti-sandbox
// check neutralized, ad scripts dropped, Telegram UI hidden and nested player
// iframes routed through the proxy.
// ---------------------------------------------------------------------------

const ALLOWED = new Set([
  "https://newball.pages.dev",
  "https://dekhobhai.pages.dev",
]);
const SOURCE = "https://dekhobhai.pages.dev/HIN/";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>TG_@Cricinsider365</title>
<script>(function(s){s.dataset.zone='11621694',s.src='https://al5sm.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
<script src="https://cdn.jsdelivr.net/npm/shaka-player@4.16.2/dist/shaka-player.ui.min.js"></script>
<script>
function isSandboxedEnv() { return window.origin === "null"; }
if(isSandboxedEnv()){ document.body.innerHTML = "DISABLE SANDBOX"; }
confirm("Join our Telegram channel?");
</script>
</head>
<body>
<a href="https://t.me/cricinsider365">Join</a>
<div class="telegram-modal">Join now</div>
<iframe id="main" src="https://newball.pages.dev/HIN1HD"></iframe>
<iframe src="https://evil.example/watch"></iframe>
<iframe src="/HIN/?a=1&amp;b=2"></iframe>
</body>
</html>`;

const out = sanitizeCricketHtml(PAGE, {
  sourceUrl: SOURCE,
  allowedOrigins: ALLOWED,
});

describe("cricket HTML sanitizer", () => {
  it("installs the dialog shim before the first source script", () => {
    expect(out).toContain("data-reelhouse-cricket-shim");
    expect(out).toContain("window.confirm = function () { return false; };");
    expect(out).toContain("window.alert = function () {};");
    expect(out).toContain("window.prompt = function () { return null; };");

    const shimAt = out.indexOf("data-reelhouse-cricket-shim");
    const firstSourceScript = out.indexOf("shaka-player.ui.min.js");
    expect(shimAt).toBeGreaterThan(-1);
    expect(shimAt).toBeLessThan(firstSourceScript);
  });

  it("neutralizes the anti-sandbox probe without removing its definition", () => {
    expect(out).not.toContain("if(isSandboxedEnv())");
    expect(out).toContain("if(false)");
    // The definition remains harmless and keeps any other reference valid.
    expect(out).toContain("function isSandboxedEnv()");
  });

  it("drops ad scripts but keeps the player's CDN script", () => {
    expect(out).not.toContain("al5sm.com");
    expect(out).toContain("cdn.jsdelivr.net/npm/shaka-player");
    expect(out).toContain("confirm(\"Join our Telegram channel?\");");
  });

  it("hides the Telegram UI", () => {
    expect(out).toContain("data-reelhouse-cricket-cleanup");
    expect(out).toContain('a[href*="t.me"]');
    expect(out).toContain('class*="telegram"');
  });

  it("routes allowed nested frames through the sanitizer", () => {
    const proxied = `${CRICKET_EMBED_PATH}?url=${encodeURIComponent(
      "https://newball.pages.dev/HIN1HD"
    )}`;
    expect(out).toContain(`src="${proxied}"`);

    // A relative nested frame resolves against the fetched document URL, and
    // HTML entities in the query are decoded before the URL is encoded again.
    const relative = `${CRICKET_EMBED_PATH}?url=${encodeURIComponent(
      "https://dekhobhai.pages.dev/HIN/?a=1&b=2"
    )}`;
    expect(out).toContain(`src="${relative}"`);
  });

  it("leaves a non-allowlisted frame untouched", () => {
    expect(out).toContain('src="https://evil.example/watch"');
  });

  it("does not touch a frame that is already proxied", () => {
    const already = `<iframe src="${CRICKET_EMBED_PATH}?url=https%3A%2F%2Fnewball.pages.dev%2FHIN1HD"></iframe>`;
    const result = sanitizeCricketHtml(already, {
      sourceUrl: SOURCE,
      allowedOrigins: ALLOWED,
    });
    expect(result).toContain(already);
    expect(result).not.toContain("%253A");
  });
});

describe("cricket source URL validation", () => {
  it("accepts absolute http(s) URLs without credentials", () => {
    expect(isCricketSourceShape("https://newball.pages.dev/HIN")).toBe(true);
    expect(isCricketSourceShape("http://127.0.0.1:4173/fixture")).toBe(true);
  });

  it("rejects non-network schemes and embedded credentials", () => {
    expect(isCricketSourceShape("javascript:alert(1)")).toBe(false);
    expect(isCricketSourceShape("data:text/html,hi")).toBe(false);
    expect(isCricketSourceShape("file:///etc/passwd")).toBe(false);
    expect(isCricketSourceShape("https://user:pass@example.test/live")).toBe(
      false
    );
  });

  it("only returns URLs whose origin is allowlisted", () => {
    expect(
      parseAllowedCricketUrl("https://newball.pages.dev/HIN", ALLOWED)?.origin
    ).toBe("https://newball.pages.dev");
    expect(
      parseAllowedCricketUrl("https://evil.example/watch", ALLOWED)
    ).toBeNull();
    expect(
      parseAllowedCricketUrl("https://newball.pages.dev.evil.test/", ALLOWED)
    ).toBeNull();
  });
});
