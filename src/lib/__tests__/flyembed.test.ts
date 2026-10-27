import { describe, expect, it } from "vitest";
import {
  F1_PLACEHOLDER_PATH,
  isAllowedFlyEmbedUrl,
  isF1Event,
  resolveFlyEmbedUrl,
} from "@/lib/flyembed";

// ---------------------------------------------------------------------------
// FlyEmbed resolver tests — no network. The feed is fetched through an
// injected fetch, so every branch (F1 present, no F1, bad host, network error)
// is deterministic.
// ---------------------------------------------------------------------------

type ResolverFetch = NonNullable<Parameters<typeof resolveFlyEmbedUrl>[0]>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeFetch(body: unknown, status = 200): ResolverFetch {
  return (async () => jsonResponse(body, status)) as unknown as ResolverFetch;
}

const F1_EVENT = {
  MatchID: "1",
  Sport: "Motorsport",
  League: "Formula 1",
  Team1: "Max Verstappen",
  Team2: "Lando Norris",
  IframeURL: "https://flyembed.cfd/embed/45.php",
};

describe("isAllowedFlyEmbedUrl", () => {
  it("accepts only HTTPS FlyEmbed hosts", () => {
    expect(isAllowedFlyEmbedUrl("https://flyembed.cfd/embed/1.php")).toBe(true);
    expect(isAllowedFlyEmbedUrl("https://www.flyembed.cfd/embed/1.php")).toBe(true);
  });

  it("rejects other hosts, schemes and non-strings", () => {
    expect(isAllowedFlyEmbedUrl("http://flyembed.cfd/embed/1.php")).toBe(false);
    expect(isAllowedFlyEmbedUrl("https://flyembed.cfd.evil.test/embed/1.php")).toBe(false);
    expect(isAllowedFlyEmbedUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedFlyEmbedUrl(null)).toBe(false);
    expect(isAllowedFlyEmbedUrl(42)).toBe(false);
  });
});

describe("isF1Event", () => {
  it("matches Formula 1 in the sport or league", () => {
    expect(isF1Event(F1_EVENT)).toBe(true);
    expect(isF1Event({ Sport: "Racing", League: "Formula One" })).toBe(true);
    expect(isF1Event({ League: "F1" })).toBe(true);
  });

  it("does not match unrelated sports", () => {
    expect(isF1Event({ Sport: "Soccer", League: "Italian Serie A" })).toBe(false);
    expect(isF1Event(null)).toBe(false);
  });
});

describe("resolveFlyEmbedUrl", () => {
  it("returns the current F1 embed URL", async () => {
    await expect(
      resolveFlyEmbedUrl(fakeFetch([{ Sport: "Soccer" }, F1_EVENT]))
    ).resolves.toBe("https://flyembed.cfd/embed/45.php");
  });

  it("falls back when the feed has no F1 event", async () => {
    await expect(
      resolveFlyEmbedUrl(fakeFetch([{ Sport: "Soccer", League: "Serie A" }]))
    ).resolves.toBe(F1_PLACEHOLDER_PATH);
  });

  it("falls back when the F1 entry points at another host", async () => {
    await expect(
      resolveFlyEmbedUrl(
        fakeFetch([{ ...F1_EVENT, IframeURL: "https://evil.test/embed/1.php" }])
      )
    ).resolves.toBe(F1_PLACEHOLDER_PATH);
  });

  it("falls back on a non-200, malformed payload or network error", async () => {
    await expect(resolveFlyEmbedUrl(fakeFetch({}, 503))).resolves.toBe(
      F1_PLACEHOLDER_PATH
    );
    await expect(resolveFlyEmbedUrl(fakeFetch({ events: [F1_EVENT] }))).resolves.toBe(
      F1_PLACEHOLDER_PATH
    );
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as ResolverFetch;
    await expect(resolveFlyEmbedUrl(failing)).resolves.toBe(F1_PLACEHOLDER_PATH);
  });
});
