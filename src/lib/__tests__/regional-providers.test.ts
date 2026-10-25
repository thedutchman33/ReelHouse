import { describe, it, expect, vi, afterEach } from "vitest";

// Pinned regional providers (JioHotstar): TMDB catalogs them outside the US
// region, so getWatchProviders("US") injects them and region-aware consumers
// resolve their catalog region via providerRegion. Without the pin the rail
// silently loses the operator-requested card; without the region override its
// catalog page and Source filter would query the wrong region and come back
// empty. The stubbed fetch keeps these tests network-free.

// tmdb.ts reads TMDB_API_KEY at module scope (USE_LIVE) — set it BEFORE the
// module evaluates, so the import has to be dynamic (static imports hoist).
process.env.TMDB_API_KEY = "test-key";
const { getWatchProviders, providerRegion } = await import("@/lib/tmdb");

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const usList = {
  results: [
    { provider_id: 8, provider_name: "Netflix", logo_path: "/n.png", display_priority: 1 },
    { provider_id: 9, provider_name: "Amazon Prime Video", logo_path: "/p.png", display_priority: 2 },
    { provider_id: 337, provider_name: "Disney Plus", logo_path: "/d.png", display_priority: 4 },
  ],
};

describe("pinned regional providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pins JioHotstar into the US provider list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(usList)));
    const list = await getWatchProviders("US");
    const hotstar = list.find((p) => p.id === 2336);
    expect(hotstar?.name).toBe("JioHotstar");
    // the real TMDB provider art (app icon), copied from the IN list
    expect(hotstar?.logoUrl).toContain("ledoS6EgdjTNq8F1e6wubUQer18");
  });

  it("does not duplicate JioHotstar if TMDB already lists it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            ...usList.results,
            { provider_id: 2336, provider_name: "JioHotstar", logo_path: "/j.png", display_priority: 3 },
          ],
        })
      )
    );
    const list = await getWatchProviders("US");
    expect(list.filter((p) => p.id === 2336)).toHaveLength(1);
  });

  it("does not pin into non-US region lists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(usList)));
    const list = await getWatchProviders("GB");
    expect(list.some((p) => p.id === 2336)).toBe(false);
  });

  it("resolves JioHotstar's catalog region to IN and leaves US providers alone", () => {
    expect(providerRegion(2336)).toBe("IN");
    expect(providerRegion(8)).toBe("US");
    expect(providerRegion(8, "GB")).toBe("GB");
  });
});
