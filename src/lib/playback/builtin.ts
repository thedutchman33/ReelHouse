import "server-only";

import type { PlaybackServer } from "@/types";
import type { PlaybackCandidate, ProviderCapabilities } from "./types";

// ---------------------------------------------------------------------------
// Built-in playback surface.
//
// This is NOT a provider slot and NOT a placeholder for one: it is Reelhouse's
// own player (src/components/player), the surface that runs when no external
// provider is configured — the state the app ships in. It is deliberately kept
// OUT of the provider selector: the selector lists the operator's configured
// providers, and this surface is simply "how Reelhouse plays things itself".
//
// Because it is not a provider, it is also excluded from provider switching and
// from automatic fallback (see manager#switchableCandidates). It is the base
// surface underneath the provider layer, not an alternative to it.
//
// Its priority sits far above any slot's (slot default = slot × 10), so the
// moment an operator enables a real provider that provider takes over, and this
// surface stays as the last resort.
// ---------------------------------------------------------------------------

export const BUILT_IN_PLAYER_ID = "reelhouse-player";

/** Chosen only when no configured provider can serve the request. */
export const BUILT_IN_PLAYER_PRIORITY = 10_000;

const BUILT_IN_CAPABILITIES: ProviderCapabilities = {
  // Reelhouse owns the media element here, so position is directly observable
  // (the player persists it itself).
  canReportProgress: true,
  // A local <video> error is observable, but this surface is the floor: there is
  // nothing below it to fall back to, so failures stay a manual retry.
  canReportFailure: false,
  supportedMediaTypes: ["movie", "tv"],
};

/**
 * The built-in candidate for one request.
 *
 * `servers` is passed in rather than fetched here so this module has no
 * dependency on how sources are resolved — it only describes the surface.
 */
export function buildBuiltInCandidate(options: {
  servers: PlaybackServer[];
}): PlaybackCandidate {
  const { servers } = options;
  return {
    provider: {
      id: BUILT_IN_PLAYER_ID,
      displayName: "Reelhouse Player",
      priority: BUILT_IN_PLAYER_PRIORITY,
      surface: "native",
      capabilities: BUILT_IN_CAPABILITIES,
      available: servers.length > 0,
      ...(servers.length ? {} : { unavailableReason: "No playable source" }),
      isBuiltIn: true,
    },
    surface: { kind: "native", servers },
  };
}
