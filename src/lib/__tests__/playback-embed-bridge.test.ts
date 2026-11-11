import { describe, expect, it } from "vitest";
import {
  EMBED_BRIDGE_SOURCE,
  EMBED_TEST_PATH,
  embedBridgeAdapter,
  getMessageAdapter,
  mockEmbedAdapter,
} from "@/lib/playback/adapters";

// ---------------------------------------------------------------------------
// The Reelhouse embed bridge.
//
// A hosted player reports state with one namespaced schema. These tests pin the
// translation AND the namespacing: anything that is not the bridge's own shape is
// ignored rather than guessed at, while the local embed fixture keeps its own
// adapter. The embed surface adds origin + frame-window checks before any of
// this runs (see EmbedSurface).
// ---------------------------------------------------------------------------

const bridge = (payload: Record<string, unknown>) =>
  embedBridgeAdapter({ source: EMBED_BRIDGE_SOURCE, ...payload });

describe("embedBridgeAdapter", () => {
  it("translates every documented message", () => {
    expect(bridge({ type: "ready" })).toEqual({ kind: "ready" });

    expect(bridge({ type: "progress", currentTime: 12.5, duration: 2700 })).toEqual({
      kind: "progress",
      seconds: 12.5,
      duration: 2700,
    });
    // `timeupdate` is accepted as the same event.
    expect(bridge({ type: "timeupdate", currentTime: 3, duration: 10 })).toEqual({
      kind: "progress",
      seconds: 3,
      duration: 10,
    });

    // The one that lets a provider's own Next button reach watch history.
    expect(bridge({ type: "episode", season: 3, episode: 4 })).toEqual({
      kind: "episode",
      season: 3,
      episode: 4,
    });

    expect(bridge({ type: "ended" })).toEqual({ kind: "ended" });
    expect(bridge({ type: "error", message: "boom" })).toEqual({
      kind: "failure",
      reason: "provider-reported",
      detail: "boom",
    });
  });

  it("ignores anything outside the namespaced schema", () => {
    // No bridge marker — never parsed, even when the shape looks familiar.
    expect(embedBridgeAdapter({ type: "episode", season: 3, episode: 4 })).toBeNull();
    expect(
      embedBridgeAdapter({
        source: "some-other-player",
        type: "progress",
        currentTime: 5,
        duration: 100,
      })
    ).toBeNull();

    // Malformed payloads are dropped, not clamped or invented.
    expect(bridge({ type: "progress", currentTime: 5 })).toBeNull();
    expect(bridge({ type: "progress", currentTime: -1, duration: 10 })).toBeNull();
    expect(bridge({ type: "progress", currentTime: 1, duration: 0 })).toBeNull();
    expect(bridge({ type: "episode", season: 0, episode: 4 })).toBeNull();
    expect(bridge({ type: "episode", season: 3, episode: 2.5 })).toBeNull();
    expect(bridge({ type: "unknown" })).toBeNull();
    expect(embedBridgeAdapter("nope")).toBeNull();
    expect(embedBridgeAdapter(null)).toBeNull();
  });
});

describe("getMessageAdapter", () => {
  it("uses the bridge for a configured provider with no provider-specific adapter", () => {
    expect(getMessageAdapter("provider-4", "https://player.example/embed/1399/3/1")).toBe(
      embedBridgeAdapter
    );
  });

  it("keeps the local fixture on its own documented contract", () => {
    expect(getMessageAdapter("provider-4", EMBED_TEST_PATH)).toBe(mockEmbedAdapter);
  });
});
