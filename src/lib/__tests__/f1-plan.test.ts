import { describe, expect, it } from "vitest";
import { F1_SERVERS } from "@/config/f1-servers";
import {
  buildF1PlaybackPlan,
  getF1PlaybackPlan,
  getF1PreconnectOrigin,
} from "@/lib/f1-playback";
import { isSafePlayerUrlTemplate } from "@/lib/playback/registry";
import { getPlaybackServers } from "@/lib/providers";

// ---------------------------------------------------------------------------
// F1 plan tests. The list is a checked-in config, so these also act as a
// content guard: duplicate ids, unsafe URLs and accidental built-in clips fail
// here instead of in the watch page.
// ---------------------------------------------------------------------------

describe("F1 server config", () => {
  it("uses unique ids", () => {
    const ids = F1_SERVERS.map((server) => server.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only accepts safe player URLs for enabled entries", () => {
    for (const server of F1_SERVERS) {
      if (server.enabled === false) continue;
      expect(
        isSafePlayerUrlTemplate(server.url),
        `${server.name} has an unsafe URL`
      ).toBe(true);
    }
  });
});

describe("F1 playback plan", () => {
  it("lists every configured server, enabled or not", () => {
    const plan = getF1PlaybackPlan();
    expect(plan.providers).toHaveLength(F1_SERVERS.length);
    expect(plan.providers.every((provider) => !provider.isBuiltIn)).toBe(true);
  });

  it("only turns enabled, safe entries into candidates", () => {
    const plan = getF1PlaybackPlan();
    const expected = F1_SERVERS.filter(
      (server) => server.enabled !== false && isSafePlayerUrlTemplate(server.url)
    );
    expect(plan.candidates.map((candidate) => candidate.provider.id)).toEqual(
      [...expected]
        .sort(
          (a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1)
        )
        .map((server) => server.id)
    );
  });

  it("defaults to WestreamF1 as the first playable server", () => {
    expect(getF1PlaybackPlan().candidates[0]?.provider.id).toBe("westreamf1-st");
  });

  it("marks F1 capabilities on every entry", () => {
    const plan = getF1PlaybackPlan();
    for (const provider of plan.providers) {
      expect(provider.surface).toBe("embed");
      expect(provider.capabilities.supportedMediaTypes).toEqual(["f1"]);
      expect(provider.capabilities.canReportProgress).toBe(false);
      expect(provider.capabilities.canReportFailure).toBe(false);
    }
  });

  it("keeps a disabled entry visible but out of the candidate list", () => {
    const plan = buildF1PlaybackPlan([
      {
        id: "ready",
        name: "Ready",
        url: "https://example.test/live",
        priority: 1,
      },
      {
        id: "dead",
        name: "Dead",
        url: "https://example.test/dead",
        priority: 2,
        enabled: false,
        note: "Reported offline",
      },
    ]);
    const disabled = plan.providers.find((provider) => provider.id === "dead");
    expect(disabled?.available).toBe(false);
    expect(disabled?.unavailableReason).toBe("Reported offline");
    expect(plan.candidates.map((candidate) => candidate.provider.id)).toEqual([
      "ready",
    ]);
  });

  it("rejects an unsafe URL without dropping the row", () => {
    const plan = buildF1PlaybackPlan([
      {
        id: "bad",
        name: "Bad",
        url: "javascript:alert(1)",
        priority: 1,
      },
    ]);
    expect(plan.providers).toHaveLength(1);
    expect(plan.providers[0].available).toBe(false);
    expect(plan.providers[0].unavailableReason).toMatch(/https/i);
    expect(plan.candidates).toHaveLength(0);
  });

  it("never falls back to the bundled sample clips", async () => {
    await expect(getPlaybackServers("f1", 1)).resolves.toEqual([]);
  });

  it("preconnects to the first enabled absolute server only", () => {
    expect(getF1PreconnectOrigin()).toBe("https://westreamf1.st");
  });
});
