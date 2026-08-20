import type { MediaType, PlaybackServer } from "@/types";

// ---------------------------------------------------------------------------
// Provider-agnostic playback types.
//
// These describe the SHAPE of a playback provider without assuming anything
// about any specific one: no URL format, no authentication model, no event
// vocabulary, no capability is baked in here. Every provider-specific fact is
// supplied later, as configuration, from that provider's OWN official
// documentation (see docs/video-provider-setup.md).
//
// Deliberate omissions (do not add them speculatively):
//   • No API-key / token / auth fields. A future provider gets those only if its
//     documentation actually requires them — and then they stay server-side.
//   • No assumed player API, postMessage schema, or query-parameter names.
//   • No provider names. The five slots are generic and unconfigured.
//
// This module is types-only, so it is safe to import from both server and
// client code (the import is erased at compile time).
// ---------------------------------------------------------------------------

/** Reelhouse prepares exactly five future provider slots. */
export const PROVIDER_SLOT_COUNT = 5;

export type ProviderSlotNumber = 1 | 2 | 3 | 4 | 5;

/**
 * How a provider's player is rendered inside the playback container.
 *
 * - `embed`  — the provider hosts its own complete player UI; Reelhouse frames
 *              it and supplies only the surrounding experience. This is the mode
 *              a future external provider is expected to use.
 * - `native` — Reelhouse renders the media itself with its own player. Used ONLY
 *              by the built-in base surface (see playback/builtin.ts), which runs
 *              when no external provider is configured.
 */
export type SurfaceKind = "native" | "embed";

/**
 * What a provider is documented to be able to do.
 *
 * Every flag DEFAULTS TO FALSE. An unknown capability is treated as absent, so
 * Reelhouse never fabricates progress data and never auto-switches away from a
 * provider whose failures it cannot actually detect.
 */
export interface ProviderCapabilities {
  /**
   * The provider documents a playback/progress event stream that an adapter can
   * translate into Reelhouse's normalized events. False → Reelhouse records no
   * progress from this provider (it does not guess).
   */
  canReportProgress: boolean;
  /**
   * The provider documents a RELIABLE failure signal. This is the ONLY gate for
   * automatic fallback: false → a failure surfaces as a manual retry/switch
   * prompt instead of a silent provider change.
   */
  canReportFailure: boolean;
  /** Media types this provider is configured to serve. */
  supportedMediaTypes: MediaType[];
}

/**
 * Static configuration for one of the five slots, read from the environment.
 * All five are unconfigured (and therefore disabled) until an authorized
 * provider is supplied.
 */
export interface ProviderSlotConfig {
  slot: ProviderSlotNumber;
  /** Stable id, `provider-<slot>` — used for selection and diagnostics. */
  id: string;
  displayName: string;
  enabled: boolean;
  /** Lower sorts first. */
  priority: number;
  /** Owner-supplied movie player URL template, or null when unset. */
  movieUrlTemplate: string | null;
  /** Owner-supplied TV player URL template, or null when unset. */
  tvUrlTemplate: string | null;
  capabilities: ProviderCapabilities;
  /** Set when the slot has configuration that could not be used (e.g. bad URL). */
  configError?: string;
}

/**
 * Client-safe description of a provider. Contains display/selection data only —
 * never a credential. (Note that an embed URL is by nature visible to the
 * browser, so a template must never contain a secret; the registry rejects
 * templates it cannot serve safely.)
 */
export interface ProviderDescriptor {
  id: string;
  displayName: string;
  priority: number;
  surface: SurfaceKind;
  capabilities: ProviderCapabilities;
  /** True when this provider is playable for the current request. */
  available: boolean;
  /** Why it is not playable — rendered as a disabled row in the selector. */
  unavailableReason?: string;
  /**
   * True for Reelhouse's own built-in playback surface. It is not an external
   * provider, so it is never listed in the provider selector and is never a
   * switch/fallback target — it is the floor beneath the provider layer.
   */
  isBuiltIn: boolean;
}

/**
 * A provider's playback payload for one concrete request.
 *
 * `embed` carries a URL *template* rather than a finished URL so the client can
 * re-expand it when the season/episode changes without a round-trip — keeping
 * media/season/episode context provider-independent.
 */
export type ResolvedSurface =
  | { kind: "native"; servers: PlaybackServer[] }
  | { kind: "embed"; urlTemplate: string };

/** One playable provider plus its payload. */
export interface PlaybackCandidate {
  provider: ProviderDescriptor;
  surface: ResolvedSurface;
}

/** Everything the playback container needs to run one title/episode. */
export interface PlaybackPlan {
  /**
   * The operator's configured providers, ordered by priority, including
   * unavailable ones so the selector can explain them. Unconfigured slots and the
   * built-in surface are NOT here — this list is exactly what the selector shows,
   * so it is empty until a provider is configured.
   */
  providers: ProviderDescriptor[];
  /** Everything that can actually play, ordered by priority (built-in included). */
  candidates: PlaybackCandidate[];
}

/** Values substituted into a provider URL template. */
export interface TemplateValues {
  /** Media identifier passed to the provider (the TMDB id by default). */
  id: number | string;
  season?: number;
  episode?: number;
}

/** Why a provider stopped being usable at runtime. */
export type PlaybackFailureReason =
  /** The embed document itself failed to load. */
  | "load-error"
  /** The provider's own documented failure signal fired. */
  | "provider-reported"
  /** No signal arrived within the load deadline. */
  | "timeout";

export interface PlaybackFailure {
  providerId: string;
  reason: PlaybackFailureReason;
  detail?: string;
}
