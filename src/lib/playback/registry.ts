import "server-only";

import type { MediaType } from "@/types";
import { expandTemplate } from "./manager";
import {
  PROVIDER_SLOT_COUNT,
  type ProviderCapabilities,
  type ProviderSlotConfig,
  type ProviderSlotNumber,
} from "./types";

// ---------------------------------------------------------------------------
// Five-slot provider registry (server-only).
//
// Reads the five generic provider slots from the environment. NOTHING is
// connected: with no env set — the state this ships in — all five slots are
// unconfigured and disabled, and playback continues to use Reelhouse's own
// built-in player surface (see ./builtin.ts) exactly as before.
//
// Per slot N (1..5):
//   VIDEO_PROVIDER_N_NAME          display name              (default "Provider N")
//   VIDEO_PROVIDER_N_ENABLED       1|true|yes|on to enable    (default off)
//   VIDEO_PROVIDER_N_PRIORITY      integer, lower first       (default N*10)
//   VIDEO_PROVIDER_N_MOVIE_URL     movie player URL template  (default unset)
//   VIDEO_PROVIDER_N_TV_URL        TV player URL template     (default unset)
//   VIDEO_PROVIDER_N_MEDIA_TYPES   "movie,tv"                 (default: derived
//                                                              from the templates)
//   VIDEO_PROVIDER_N_REPORTS_PROGRESS   provider documents progress events (default off)
//   VIDEO_PROVIDER_N_REPORTS_FAILURE    provider documents a reliable failure
//                                       signal — gates automatic fallback (default off)
//
// There are deliberately NO api-key / token / auth variables. A future provider
// gets those only if its own documentation actually requires them, and they stay
// server-side. See docs/video-provider-setup.md.
//
// The legacy `VIDEO_PROVIDER_BASE` / `VIDEO_PROVIDER_KEY` variables are kept for
// compatibility and remain unread by this module (they are reported for presence
// only, by src/lib/env.ts).
//
// Secret hygiene: this module never logs an env value, and the descriptors it
// feeds to the client carry no credential. An embed URL is by nature visible to
// the browser, so a template must never contain a secret — that constraint is
// documented for the operator; it cannot be enforced here.
// ---------------------------------------------------------------------------

const SLOTS: ProviderSlotNumber[] = [1, 2, 3, 4, 5];

/** Compile-time cross-check that the slot list matches the declared count. */
const _slotCount: typeof PROVIDER_SLOT_COUNT = SLOTS.length as 5;
void _slotCount;

function readVar(slot: ProviderSlotNumber, key: string): string | undefined {
  const value = process.env[`VIDEO_PROVIDER_${slot}_${key}`];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePriority(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseMediaTypes(value: string | undefined): MediaType[] | null {
  if (!value) return null;
  const types = value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t): t is MediaType => t === "movie" || t === "tv");
  return types.length ? [...new Set(types)] : null;
}

/**
 * Whether a template can be served to an iframe safely.
 *
 * Accepts a same-origin absolute path (`/...`) or an `https:` URL — plus plain
 * `http:` on localhost, so a provider can be trialled against a local sandbox
 * during development. Everything else is rejected, which is what keeps a
 * `javascript:` / `data:` template out of a frame `src`.
 *
 * The template is expanded with placeholder values first, so a token inside the
 * origin cannot hide an unsafe scheme.
 */
export function isSafePlayerUrlTemplate(
  template: string,
  { allowInsecureLocalhost = process.env.NODE_ENV !== "production" } = {}
): boolean {
  const probe = expandTemplate(template, { id: 1, season: 1, episode: 1 }).trim();
  if (!probe) return false;
  // Same-origin absolute path (the built-in surface and the embed test fixture
  // both use this). Reject `//host`,
  // which is protocol-relative and therefore cross-origin.
  if (probe.startsWith("/")) return !probe.startsWith("//");
  let url: URL;
  try {
    url = new URL(probe);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (
    allowInsecureLocalhost &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) {
    return true;
  }
  return false;
}

function readCapabilities(
  slot: ProviderSlotNumber,
  movieUrlTemplate: string | null,
  tvUrlTemplate: string | null
): ProviderCapabilities {
  // Default the supported types to whatever templates the operator actually
  // provided, so a movie-only provider needs no extra variable.
  const derived: MediaType[] = [];
  if (movieUrlTemplate) derived.push("movie");
  if (tvUrlTemplate) derived.push("tv");

  return {
    canReportProgress: parseBool(readVar(slot, "REPORTS_PROGRESS")),
    canReportFailure: parseBool(readVar(slot, "REPORTS_FAILURE")),
    supportedMediaTypes: parseMediaTypes(readVar(slot, "MEDIA_TYPES")) ?? derived,
  };
}

function readSlot(slot: ProviderSlotNumber): ProviderSlotConfig {
  const rawMovie = readVar(slot, "MOVIE_URL") ?? null;
  const rawTv = readVar(slot, "TV_URL") ?? null;

  // Drop (and report) any template we would refuse to put in a frame src,
  // rather than silently rendering something unsafe.
  const rejected: string[] = [];
  const movieUrlTemplate =
    rawMovie && !isSafePlayerUrlTemplate(rawMovie)
      ? (rejected.push("MOVIE_URL"), null)
      : rawMovie;
  const tvUrlTemplate =
    rawTv && !isSafePlayerUrlTemplate(rawTv)
      ? (rejected.push("TV_URL"), null)
      : rawTv;

  return {
    slot,
    id: `provider-${slot}`,
    displayName: readVar(slot, "NAME") ?? `Provider ${slot}`,
    enabled: parseBool(readVar(slot, "ENABLED")),
    priority: parsePriority(readVar(slot, "PRIORITY"), slot * 10),
    movieUrlTemplate,
    tvUrlTemplate,
    capabilities: readCapabilities(slot, movieUrlTemplate, tvUrlTemplate),
    ...(rejected.length
      ? {
          configError: `${rejected.join(" and ")} must be an https:// URL or a same-origin /path`,
        }
      : {}),
  };
}

/** All five slot configurations, in slot order. Never throws. */
export function readProviderSlots(): ProviderSlotConfig[] {
  return SLOTS.map(readSlot);
}

/** True when the slot has any operator configuration at all. */
export function isSlotConfigured(config: ProviderSlotConfig): boolean {
  return Boolean(
    config.enabled || config.movieUrlTemplate || config.tvUrlTemplate
  );
}

/** The URL template for a media type, or null when that type is unconfigured. */
export function templateFor(
  config: ProviderSlotConfig,
  mediaType: MediaType
): string | null {
  return mediaType === "tv" ? config.tvUrlTemplate : config.movieUrlTemplate;
}

/**
 * Why a slot cannot serve this media type, or null when it can.
 * Returned verbatim to the selector as a disabled-row explanation.
 */
export function slotUnavailableReason(
  config: ProviderSlotConfig,
  mediaType: MediaType
): string | null {
  const label = mediaType === "tv" ? "TV" : "movies";
  if (config.configError) return config.configError;
  if (!isSlotConfigured(config)) return "Not configured";
  if (!config.enabled) return "Disabled";
  if (!templateFor(config, mediaType)) {
    return `No ${mediaType === "tv" ? "TV" : "movie"} player URL set`;
  }
  if (!config.capabilities.supportedMediaTypes.includes(mediaType)) {
    return `Not configured for ${label}`;
  }
  return null;
}

/**
 * Boolean/count-only summary for the startup configuration report. Reports how
 * many slots are configured and how many are enabled — never a value.
 */
export function describePlaybackSlots(): {
  configuredSlots: number;
  enabledSlots: number;
} {
  const slots = readProviderSlots();
  return {
    configuredSlots: slots.filter(isSlotConfigured).length,
    enabledSlots: slots.filter((s) => s.enabled).length,
  };
}
