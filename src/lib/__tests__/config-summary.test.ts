import { describe, it, expect } from "vitest";
import { formatConfigSummary } from "@/lib/config-summary";
import type { ConfigStatus } from "@/lib/env";

// NOTE: `ConfigStatus` is imported type-only, so this suite never pulls env.ts
// (nor its transitive tmdb.ts `cache()` module-load side effect) into the Vitest
// runtime — it only needs the shape.

const ALL_ON: ConfigStatus = {
  metadata: true,
  subtitleSearch: true,
  subtitleDownload: true,
  supabase: true,
  playback: { configuredSlots: 5, enabledSlots: 5 },
  optionals: {
    supabaseServiceRoleKey: true,
    redisUrl: true,
    videoProviderBase: true,
    videoProviderKey: true,
  },
};

const ALL_OFF: ConfigStatus = {
  metadata: false,
  subtitleSearch: false,
  subtitleDownload: false,
  supabase: false,
  playback: { configuredSlots: 0, enabledSlots: 0 },
  optionals: {
    supabaseServiceRoleKey: false,
    redisUrl: false,
    videoProviderBase: false,
    videoProviderKey: false,
  },
};

const joined = (status: ConfigStatus): string => formatConfigSummary(status).join("\n");

describe("formatConfigSummary", () => {
  it("reports every live feature when all gates are on", () => {
    const text = joined(ALL_ON);
    expect(text).toContain("live TMDB");
    expect(text).toContain("subtitle search   : on");
    expect(text).toContain("subtitle download : on");
    expect(text).toContain("Supabase");
    expect(text).toContain("5 of 5 enabled (5 configured)");
    expect(text).toContain("service-role-key set");
    expect(text).toContain("redis set");
    expect(text).toContain("video-provider-base set");
    expect(text).toContain("video-provider-key set");
  });

  it("reports the fallback for every feature when all gates are off", () => {
    const text = joined(ALL_OFF);
    expect(text).toContain("mock catalog");
    expect(text).toContain("subtitle search   : off");
    expect(text).toContain("subtitle download : off");
    expect(text).toContain("local (localStorage)");
    expect(text).toContain("0 of 5 enabled (0 configured)");
    expect(text).toContain("service-role-key not set");
    expect(text).toContain("redis not set");
    expect(text).toContain("video-provider-base not set");
    expect(text).toContain("video-provider-key not set");
  });

  it("reports each toggle independently (mixed state)", () => {
    const text = joined({
      ...ALL_OFF,
      metadata: true,
      subtitleSearch: true,
      playback: { configuredSlots: 2, enabledSlots: 1 },
      optionals: { ...ALL_OFF.optionals, redisUrl: true },
    });
    expect(text).toContain("live TMDB");
    expect(text).toContain("subtitle search   : on");
    // still off / fallback:
    expect(text).toContain("subtitle download : off");
    expect(text).toContain("local (localStorage)");
    expect(text).toContain("1 of 5 enabled (2 configured)");
    expect(text).toContain("redis set");
    expect(text).toContain("service-role-key not set");
  });

  it("returns one header line plus one row per feature and is deterministic", () => {
    // header + metadata + search + download + auth + provider slots + optionals
    expect(formatConfigSummary(ALL_ON)).toHaveLength(7);
    expect(formatConfigSummary(ALL_OFF)).toHaveLength(7);
    // pure/deterministic: same input → identical output
    expect(formatConfigSummary(ALL_ON)).toEqual(formatConfigSummary(ALL_ON));
  });

  it("emits only on/off/set-or-not-set vocabulary — no boolean or value leaks", () => {
    // The formatter only ever receives booleans, so no secret can appear; also
    // assert the raw words `true`/`false` never reach the human-facing output.
    for (const status of [ALL_ON, ALL_OFF]) {
      const text = joined(status);
      expect(text).not.toMatch(/\btrue\b|\bfalse\b/);
    }
  });
});
