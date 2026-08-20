import { afterEach, describe, expect, it } from "vitest";
import {
  canAutoFallback,
  compareProviders,
  expandTemplate,
  findCandidate,
  orderProviders,
  playableCandidates,
  selectFallbackCandidate,
  selectInitialCandidate,
  switchableCandidates,
  templateTokens,
} from "@/lib/playback/manager";
import {
  describePlaybackSlots,
  isSafePlayerUrlTemplate,
  isSlotConfigured,
  readProviderSlots,
  slotUnavailableReason,
  templateFor,
} from "@/lib/playback/registry";
import {
  BUILT_IN_PLAYER_ID,
  buildBuiltInCandidate,
} from "@/lib/playback/builtin";
import { getPlaybackPlan } from "@/lib/providers";
import type {
  PlaybackCandidate,
  ProviderCapabilities,
  ProviderDescriptor,
} from "@/lib/playback/types";
import type { PlaybackServer } from "@/types";

// ---------------------------------------------------------------------------
// Provider architecture tests — run with NO real provider connected, which is
// the point: every rule (registration, priority, enable/disable, manual
// switching, fallback, movie/TV configuration) is verified against the five
// generic slots, the built-in surface, and in-test provider fixtures. No mock
// provider is registered in the app itself.
//
// `server-only` is aliased to a stub by vitest.config.mts, so the server-side
// registry and provider modules are importable here.
// ---------------------------------------------------------------------------

const CAPS = (over: Partial<ProviderCapabilities> = {}): ProviderCapabilities => ({
  canReportProgress: false,
  canReportFailure: false,
  supportedMediaTypes: ["movie", "tv"],
  ...over,
});

function provider(
  id: string,
  priority: number,
  over: Partial<ProviderDescriptor> = {}
): ProviderDescriptor {
  return {
    id,
    displayName: id,
    priority,
    surface: "embed",
    capabilities: CAPS(),
    available: true,
    isBuiltIn: false,
    ...over,
  };
}

function candidate(p: ProviderDescriptor): PlaybackCandidate {
  return { provider: p, surface: { kind: "embed", urlTemplate: `/p/${p.id}/{id}` } };
}

// ------------------------------ ordering ------------------------------------

describe("provider ordering", () => {
  it("orders by priority, then by id so the order is stable", () => {
    const list = [provider("c", 20), provider("b", 10), provider("a", 10)];
    expect(orderProviders(list).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(compareProviders(provider("x", 1), provider("y", 2))).toBeLessThan(0);
    expect(compareProviders(provider("x", 2), provider("y", 2))).toBeLessThan(0);
  });

  it("does not mutate the input list", () => {
    const list = [provider("z", 99), provider("a", 1)];
    orderProviders(list);
    expect(list.map((p) => p.id)).toEqual(["z", "a"]);
  });
});

// -------------------- enable / disable + media types ------------------------

describe("playable candidates", () => {
  const cands = [
    candidate(provider("enabled", 10)),
    candidate(provider("disabled", 5, { available: false, unavailableReason: "Disabled" })),
    candidate(
      provider("movies-only", 1, { capabilities: CAPS({ supportedMediaTypes: ["movie"] }) })
    ),
  ];

  it("excludes unavailable providers even at the best priority", () => {
    expect(playableCandidates(cands, "movie").map((c) => c.provider.id)).toEqual([
      "movies-only",
      "enabled",
    ]);
  });

  it("excludes providers not configured for the requested media type", () => {
    expect(playableCandidates(cands, "tv").map((c) => c.provider.id)).toEqual(["enabled"]);
  });

  it("selects the highest-priority playable candidate by default", () => {
    expect(selectInitialCandidate(cands, "movie")?.provider.id).toBe("movies-only");
    expect(selectInitialCandidate(cands, "tv")?.provider.id).toBe("enabled");
  });

  it("honors a preferred provider, and ignores an unplayable preference", () => {
    expect(selectInitialCandidate(cands, "movie", "enabled")?.provider.id).toBe("enabled");
    expect(selectInitialCandidate(cands, "movie", "disabled")?.provider.id).toBe("movies-only");
    expect(selectInitialCandidate(cands, "tv", "movies-only")?.provider.id).toBe("enabled");
  });

  it("returns null when nothing can play the media type", () => {
    const movieOnly = [
      candidate(
        provider("m", 1, { capabilities: CAPS({ supportedMediaTypes: ["movie"] }) })
      ),
    ];
    expect(selectInitialCandidate(movieOnly, "tv")).toBeNull();
  });
});

describe("manual switching", () => {
  const cands = [
    candidate(provider("a", 10)),
    candidate(provider("b", 20)),
    candidate(provider("off", 1, { available: false, unavailableReason: "Disabled" })),
  ];

  it("finds any playable provider by id, regardless of priority", () => {
    expect(findCandidate(cands, "movie", "b")?.provider.id).toBe("b");
  });

  it("refuses to select a disabled or unknown provider", () => {
    expect(findCandidate(cands, "movie", "off")).toBeNull();
    expect(findCandidate(cands, "movie", "nope")).toBeNull();
  });
});

// ------------------------------- fallback -----------------------------------

describe("automatic fallback", () => {
  const signalling = provider("signalling", 10, {
    capabilities: CAPS({ canReportFailure: true }),
  });
  const silent = provider("silent", 20);
  const backup = provider("backup", 30, {
    capabilities: CAPS({ canReportFailure: true }),
  });
  const cands = [candidate(signalling), candidate(silent), candidate(backup)];

  it("is permitted only for a provider that reports its own failures", () => {
    expect(canAutoFallback(signalling)).toBe(true);
    expect(canAutoFallback(silent)).toBe(false);
  });

  it("moves to the next playable provider when failure was reported", () => {
    expect(
      selectFallbackCandidate(cands, "movie", "signalling")?.provider.id
    ).toBe("silent");
  });

  it("never switches away from a provider whose failures cannot be detected", () => {
    // A loaded-but-blank embed is indistinguishable from a working one, so this
    // has to stay a manual choice.
    expect(selectFallbackCandidate(cands, "movie", "silent")).toBeNull();
  });

  it("skips providers already attempted, and stops instead of looping", () => {
    expect(
      selectFallbackCandidate(cands, "movie", "signalling", ["silent"])?.provider.id
    ).toBe("backup");
    expect(
      selectFallbackCandidate(cands, "movie", "signalling", ["silent", "backup"])
    ).toBeNull();
  });

  it("returns null for an unknown or unplayable failed provider", () => {
    expect(selectFallbackCandidate(cands, "movie", "ghost")).toBeNull();
  });

  it("only considers providers that serve the media type", () => {
    const tvless = [
      candidate(signalling),
      candidate(
        provider("movies-only", 20, {
          capabilities: CAPS({ supportedMediaTypes: ["movie"] }),
        })
      ),
      candidate(backup),
    ];
    expect(selectFallbackCandidate(tvless, "tv", "signalling")?.provider.id).toBe(
      "backup"
    );
  });
});

// --------------------------- template expansion -----------------------------

describe("expandTemplate", () => {
  it("substitutes the media id, season and episode", () => {
    expect(
      expandTemplate("https://example.test/tv/{id}/{season}/{episode}", {
        id: 1399,
        season: 2,
        episode: 5,
      })
    ).toBe("https://example.test/tv/1399/2/5");
  });

  it("collapses tokens with no supplied value instead of leaking the token", () => {
    expect(expandTemplate("/p?id={id}&s={season}", { id: 7 })).toBe("/p?id=7&s=");
  });

  it("URI-encodes substituted values", () => {
    expect(expandTemplate("/p/{id}", { id: "a b/c" })).toBe("/p/a%20b%2Fc");
  });

  it("leaves unrecognized placeholders untouched", () => {
    expect(expandTemplate("/p/{id}/{unknown}", { id: 1 })).toBe("/p/1/{unknown}");
  });

  it("reports which tokens a template uses", () => {
    expect(templateTokens("/p/{id}/{season}/{episode}/{id}")).toEqual([
      "{id}",
      "{season}",
      "{episode}",
    ]);
    expect(templateTokens("/p/static")).toEqual([]);
  });
});

// ------------------------- five-slot registry (env) -------------------------

const SLOT_KEYS = [
  "NAME",
  "ENABLED",
  "PRIORITY",
  "MOVIE_URL",
  "TV_URL",
  "MEDIA_TYPES",
  "REPORTS_PROGRESS",
  "REPORTS_FAILURE",
];

function clearSlotEnv(): void {
  for (const slot of [1, 2, 3, 4, 5]) {
    for (const key of SLOT_KEYS) delete process.env[`VIDEO_PROVIDER_${slot}_${key}`];
  }
}

afterEach(clearSlotEnv);

describe("five-slot registry", () => {
  it("ships five slots, all unconfigured and disabled", () => {
    const slots = readProviderSlots();
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.id)).toEqual([
      "provider-1",
      "provider-2",
      "provider-3",
      "provider-4",
      "provider-5",
    ]);
    for (const slot of slots) {
      expect(slot.enabled).toBe(false);
      expect(slot.movieUrlTemplate).toBeNull();
      expect(slot.tvUrlTemplate).toBeNull();
      expect(slot.capabilities.canReportProgress).toBe(false);
      expect(slot.capabilities.canReportFailure).toBe(false);
      expect(slot.capabilities.supportedMediaTypes).toEqual([]);
      expect(isSlotConfigured(slot)).toBe(false);
      expect(slotUnavailableReason(slot, "movie")).toBe("Not configured");
      expect(slotUnavailableReason(slot, "tv")).toBe("Not configured");
    }
    expect(describePlaybackSlots()).toEqual({ configuredSlots: 0, enabledSlots: 0 });
  });

  it("defaults priority to slot order and the name to the slot number", () => {
    const slots = readProviderSlots();
    expect(slots.map((s) => s.priority)).toEqual([10, 20, 30, 40, 50]);
    expect(slots.map((s) => s.displayName)).toEqual([
      "Provider 1",
      "Provider 2",
      "Provider 3",
      "Provider 4",
      "Provider 5",
    ]);
  });

  it("reads a configured slot and derives its media types from the templates", () => {
    process.env.VIDEO_PROVIDER_2_NAME = "Example Provider";
    process.env.VIDEO_PROVIDER_2_ENABLED = "true";
    process.env.VIDEO_PROVIDER_2_PRIORITY = "5";
    process.env.VIDEO_PROVIDER_2_MOVIE_URL = "https://example.test/m/{id}";
    process.env.VIDEO_PROVIDER_2_REPORTS_FAILURE = "yes";

    const slot = readProviderSlots()[1];
    expect(slot.displayName).toBe("Example Provider");
    expect(slot.enabled).toBe(true);
    expect(slot.priority).toBe(5);
    expect(slot.capabilities.supportedMediaTypes).toEqual(["movie"]);
    expect(slot.capabilities.canReportFailure).toBe(true);
    expect(slot.capabilities.canReportProgress).toBe(false);
    expect(templateFor(slot, "movie")).toBe("https://example.test/m/{id}");
    expect(templateFor(slot, "tv")).toBeNull();
    expect(slotUnavailableReason(slot, "movie")).toBeNull();
    // Movie-only configuration must not silently claim TV support.
    expect(slotUnavailableReason(slot, "tv")).toBe("No TV player URL set");
    expect(describePlaybackSlots()).toEqual({ configuredSlots: 1, enabledSlots: 1 });
  });

  it("treats a slot with a URL but no ENABLED as configured-but-disabled", () => {
    process.env.VIDEO_PROVIDER_1_MOVIE_URL = "https://example.test/m/{id}";
    const slot = readProviderSlots()[0];
    expect(isSlotConfigured(slot)).toBe(true);
    expect(slot.enabled).toBe(false);
    expect(slotUnavailableReason(slot, "movie")).toBe("Disabled");
    expect(describePlaybackSlots()).toEqual({ configuredSlots: 1, enabledSlots: 0 });
  });

  it("reports an enabled slot with no player URL instead of failing silently", () => {
    process.env.VIDEO_PROVIDER_3_ENABLED = "1";
    const slot = readProviderSlots()[2];
    expect(slotUnavailableReason(slot, "movie")).toBe("No movie player URL set");
  });

  it("lets MEDIA_TYPES narrow what a configured slot serves", () => {
    process.env.VIDEO_PROVIDER_4_ENABLED = "on";
    process.env.VIDEO_PROVIDER_4_MOVIE_URL = "https://example.test/m/{id}";
    process.env.VIDEO_PROVIDER_4_TV_URL = "https://example.test/t/{id}/{season}/{episode}";
    process.env.VIDEO_PROVIDER_4_MEDIA_TYPES = "movie";
    const slot = readProviderSlots()[3];
    expect(slot.capabilities.supportedMediaTypes).toEqual(["movie"]);
    expect(slotUnavailableReason(slot, "tv")).toBe("Not configured for TV");
  });

  it("rejects a template it cannot frame safely, and says so", () => {
    process.env.VIDEO_PROVIDER_5_ENABLED = "1";
    process.env.VIDEO_PROVIDER_5_MOVIE_URL = "javascript:alert(1)";
    const slot = readProviderSlots()[4];
    expect(slot.movieUrlTemplate).toBeNull();
    expect(slot.configError).toContain("MOVIE_URL");
    expect(slotUnavailableReason(slot, "movie")).toBe(slot.configError);
  });

  it("ignores a blank or whitespace-only value", () => {
    process.env.VIDEO_PROVIDER_1_ENABLED = "   ";
    process.env.VIDEO_PROVIDER_1_MOVIE_URL = "";
    const slot = readProviderSlots()[0];
    expect(slot.enabled).toBe(false);
    expect(isSlotConfigured(slot)).toBe(false);
  });

  it("falls back to the default priority for a non-numeric value", () => {
    process.env.VIDEO_PROVIDER_2_PRIORITY = "soon";
    expect(readProviderSlots()[1].priority).toBe(20);
  });
});

describe("isSafePlayerUrlTemplate", () => {
  it("accepts https and same-origin paths", () => {
    expect(isSafePlayerUrlTemplate("https://example.test/p/{id}")).toBe(true);
    expect(isSafePlayerUrlTemplate("/media/mock-embed/player.html?id={id}")).toBe(true);
  });

  it("rejects script, data and protocol-relative URLs", () => {
    expect(isSafePlayerUrlTemplate("javascript:alert(1)")).toBe(false);
    expect(isSafePlayerUrlTemplate("data:text/html,<b>x</b>")).toBe(false);
    expect(isSafePlayerUrlTemplate("//example.test/p/{id}")).toBe(false);
    expect(isSafePlayerUrlTemplate("not a url")).toBe(false);
    expect(isSafePlayerUrlTemplate("")).toBe(false);
  });

  it("rejects plain http except on localhost during development", () => {
    expect(
      isSafePlayerUrlTemplate("http://example.test/p/{id}", {
        allowInsecureLocalhost: true,
      })
    ).toBe(false);
    expect(
      isSafePlayerUrlTemplate("http://localhost:3001/p/{id}", {
        allowInsecureLocalhost: true,
      })
    ).toBe(true);
    expect(
      isSafePlayerUrlTemplate("http://localhost:3001/p/{id}", {
        allowInsecureLocalhost: false,
      })
    ).toBe(false);
  });
});

// --------------------------- built-in base surface --------------------------

const SERVER: PlaybackServer = {
  id: "aurora",
  name: "Aurora",
  audioLabel: "Original audio",
  countryCode: "US",
  qualityLabel: "1080p",
  source: {
    playbackUrl: "/media/big-buck-bunny.mp4",
    type: "mp4",
    sourceLabel: "Licensed sample",
    isSample: true,
  },
};

describe("built-in playback surface", () => {
  it("is a native surface flagged as built-in, not a provider", () => {
    const builtIn = buildBuiltInCandidate({ servers: [SERVER] });
    expect(builtIn.provider.id).toBe(BUILT_IN_PLAYER_ID);
    expect(builtIn.surface.kind).toBe("native");
    expect(builtIn.provider.isBuiltIn).toBe(true);
    expect(builtIn.provider.available).toBe(true);
  });

  it("plays when it is the only candidate", () => {
    const cands = [buildBuiltInCandidate({ servers: [SERVER] })];
    expect(selectInitialCandidate(cands, "movie")?.provider.id).toBe(
      BUILT_IN_PLAYER_ID
    );
    expect(selectInitialCandidate(cands, "tv")?.provider.id).toBe(
      BUILT_IN_PLAYER_ID
    );
  });

  it("yields to any configured provider, whose priority is far lower", () => {
    const cands = [
      buildBuiltInCandidate({ servers: [SERVER] }),
      candidate(provider("provider-5", 50)),
    ];
    expect(selectInitialCandidate(cands, "movie")?.provider.id).toBe("provider-5");
  });

  it("is unavailable when there is no playable source", () => {
    const builtIn = buildBuiltInCandidate({ servers: [] });
    expect(builtIn.provider.available).toBe(false);
    expect(builtIn.provider.unavailableReason).toBe("No playable source");
    expect(selectInitialCandidate([builtIn], "movie")).toBeNull();
  });

  it("is never auto-switched away from (it reports no failures)", () => {
    const cands = [
      buildBuiltInCandidate({ servers: [SERVER] }),
      candidate(provider("provider-1", 10)),
    ];
    expect(canAutoFallback(cands[0].provider)).toBe(false);
    expect(selectFallbackCandidate(cands, "movie", BUILT_IN_PLAYER_ID)).toBeNull();
  });
});

// ------------------------------ switch targets ------------------------------

describe("switchable candidates", () => {
  it("offers configured providers but never the built-in surface", () => {
    const cands = [
      buildBuiltInCandidate({ servers: [SERVER] }),
      candidate(provider("provider-1", 10)),
      candidate(provider("provider-2", 20)),
    ];
    expect(playableCandidates(cands, "movie").map((c) => c.provider.id)).toEqual([
      "provider-1",
      "provider-2",
      BUILT_IN_PLAYER_ID,
    ]);
    expect(switchableCandidates(cands, "movie").map((c) => c.provider.id)).toEqual([
      "provider-1",
      "provider-2",
    ]);
  });

  it("is empty when only the built-in surface can play", () => {
    const cands = [buildBuiltInCandidate({ servers: [SERVER] })];
    expect(switchableCandidates(cands, "movie")).toEqual([]);
  });

  it("does not fall back onto the built-in surface", () => {
    const cands = [
      buildBuiltInCandidate({ servers: [SERVER] }),
      candidate(provider("provider-1", 10, { capabilities: CAPS({ canReportFailure: true }) })),
    ];
    // provider-1 reports failures, but the only thing left is the built-in
    // surface — so there is nothing to switch to and the error surfaces instead.
    expect(selectFallbackCandidate(cands, "movie", "provider-1")).toBeNull();
  });

  it("falls back between providers, skipping the built-in surface", () => {
    const cands = [
      buildBuiltInCandidate({ servers: [SERVER] }),
      candidate(provider("provider-1", 10, { capabilities: CAPS({ canReportFailure: true }) })),
      candidate(provider("provider-2", 20)),
    ];
    expect(
      selectFallbackCandidate(cands, "movie", "provider-1")?.provider.id
    ).toBe("provider-2");
  });
});

// ------------------------------ end-to-end plan -----------------------------

describe("getPlaybackPlan", () => {
  it("lists no providers at all when no slot is configured", async () => {
    const plan = await getPlaybackPlan("movie", 603);
    // Nothing to advertise: the selector is not rendered in this state.
    expect(plan.providers).toEqual([]);
    // …and playback still works, on the built-in surface.
    expect(plan.candidates.map((c) => c.provider.id)).toEqual([BUILT_IN_PLAYER_ID]);
    expect(selectInitialCandidate(plan.candidates, "movie")?.provider.id).toBe(
      BUILT_IN_PLAYER_ID
    );
  });

  it("never lists the built-in surface as a provider", async () => {
    process.env.VIDEO_PROVIDER_2_ENABLED = "1";
    process.env.VIDEO_PROVIDER_2_MOVIE_URL = "https://example.test/m/{id}";

    const plan = await getPlaybackPlan("movie", 603);
    expect(plan.providers.map((p) => p.id)).toEqual(["provider-2"]);
    expect(plan.providers.some((p) => p.isBuiltIn)).toBe(false);
    // It is still a candidate, just not an advertised one.
    expect(plan.candidates.some((c) => c.provider.id === BUILT_IN_PLAYER_ID)).toBe(
      true
    );
  });

  it("puts a configured, enabled slot ahead of the built-in surface", async () => {
    process.env.VIDEO_PROVIDER_3_NAME = "Example Provider";
    process.env.VIDEO_PROVIDER_3_ENABLED = "1";
    process.env.VIDEO_PROVIDER_3_MOVIE_URL = "https://example.test/m/{id}";

    const plan = await getPlaybackPlan("movie", 603);
    expect(plan.providers[0].id).toBe("provider-3");
    expect(plan.providers[0].displayName).toBe("Example Provider");
    expect(plan.providers[0].surface).toBe("embed");
    const initial = selectInitialCandidate(plan.candidates, "movie");
    expect(initial?.provider.id).toBe("provider-3");
    if (initial?.surface.kind !== "embed") throw new Error("expected an embed surface");
    expect(expandTemplate(initial.surface.urlTemplate, { id: 603 })).toBe(
      "https://example.test/m/603"
    );
  });

  it("shows a half-configured slot as unavailable with the reason, and still plays", async () => {
    process.env.VIDEO_PROVIDER_1_ENABLED = "1";
    const plan = await getPlaybackPlan("tv", 1399, 1, 1);
    const slot = plan.providers.find((p) => p.id === "provider-1");
    expect(slot?.available).toBe(false);
    expect(slot?.unavailableReason).toBe("No TV player URL set");
    // Never selectable, and playback still falls to the built-in surface.
    expect(plan.candidates.some((c) => c.provider.id === "provider-1")).toBe(false);
    expect(selectInitialCandidate(plan.candidates, "tv")?.provider.id).toBe(
      BUILT_IN_PLAYER_ID
    );
  });

  it("keeps an untouched slot out of the UI entirely", async () => {
    const plan = await getPlaybackPlan("movie", 603);
    expect(plan.providers.map((p) => p.id)).not.toContain("provider-5");
  });

  it("orders providers by priority for both media types", async () => {
    process.env.VIDEO_PROVIDER_4_ENABLED = "1";
    process.env.VIDEO_PROVIDER_4_PRIORITY = "1";
    process.env.VIDEO_PROVIDER_4_TV_URL = "https://example.test/t/{id}/{season}/{episode}";
    process.env.VIDEO_PROVIDER_2_ENABLED = "1";
    process.env.VIDEO_PROVIDER_2_PRIORITY = "2";
    process.env.VIDEO_PROVIDER_2_TV_URL = "https://example.test/x/{id}/{season}/{episode}";

    const plan = await getPlaybackPlan("tv", 1399, 2, 5);
    expect(plan.providers.map((p) => p.id)).toEqual(["provider-4", "provider-2"]);
    const priorities = plan.candidates.map((c) => c.provider.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);

    // The movie surface of those TV-only slots stays unavailable.
    const moviePlan = await getPlaybackPlan("movie", 603);
    expect(
      moviePlan.providers.find((p) => p.id === "provider-4")?.unavailableReason
    ).toBe("No movie player URL set");
  });
});
