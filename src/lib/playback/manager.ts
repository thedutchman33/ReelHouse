import type { MediaType } from "@/types";
import type {
  PlaybackCandidate,
  ProviderDescriptor,
  TemplateValues,
} from "./types";

// ---------------------------------------------------------------------------
// Provider Manager — pure selection logic.
//
// No I/O, no env reads, no React: given a list of providers/candidates it
// decides ordering, what is playable, what to start on, and what (if anything)
// to fall back to. That makes every rule here unit-testable without a browser,
// a server, or a real provider (src/lib/__tests__/playback-manager.test.ts).
//
// Safe to import from client components AND from server code.
//
// The one rule that matters most: automatic fallback is gated on the FROM
// provider declaring `canReportFailure`. A provider whose failures cannot be
// reliably detected is never auto-switched away from, because a "silent" embed
// (loaded but blank) is indistinguishable from a working one from the outside.
// ---------------------------------------------------------------------------

/** Ordering: lower `priority` first; ties broken by id so the order is stable. */
export function compareProviders(
  a: ProviderDescriptor,
  b: ProviderDescriptor
): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A new list ordered by priority (does not mutate the input). */
export function orderProviders(
  providers: ProviderDescriptor[]
): ProviderDescriptor[] {
  return [...providers].sort(compareProviders);
}

/** True when the provider is enabled/available and serves this media type. */
export function supportsMediaType(
  provider: ProviderDescriptor,
  mediaType: MediaType
): boolean {
  return provider.capabilities.supportedMediaTypes.includes(mediaType);
}

/** Playable candidates for a media type, ordered by priority. */
export function playableCandidates(
  candidates: PlaybackCandidate[],
  mediaType: MediaType
): PlaybackCandidate[] {
  return [...candidates]
    .filter((c) => c.provider.available && supportsMediaType(c.provider, mediaType))
    .sort((a, b) => compareProviders(a.provider, b.provider));
}

/**
 * Playable candidates the user can be switched TO — i.e. actual providers.
 *
 * The built-in surface is excluded: it is not an external provider, it is not
 * offered in the selector, and Reelhouse must not silently "switch" a viewer onto
 * it. It stays available as the initial/only surface when nothing is configured,
 * which is what keeps playback working with an empty environment.
 */
export function switchableCandidates(
  candidates: PlaybackCandidate[],
  mediaType: MediaType
): PlaybackCandidate[] {
  return playableCandidates(candidates, mediaType).filter(
    (c) => !c.provider.isBuiltIn
  );
}

/**
 * Which candidate to start on: the caller's explicit preference when it is
 * playable, otherwise the highest-priority playable one. Null when nothing can
 * play this media type.
 */
export function selectInitialCandidate(
  candidates: PlaybackCandidate[],
  mediaType: MediaType,
  preferredId?: string | null
): PlaybackCandidate | null {
  const playable = playableCandidates(candidates, mediaType);
  if (preferredId) {
    const preferred = playable.find((c) => c.provider.id === preferredId);
    if (preferred) return preferred;
  }
  return playable[0] ?? null;
}

/** Look up one candidate by provider id (only if it is playable). */
export function findCandidate(
  candidates: PlaybackCandidate[],
  mediaType: MediaType,
  providerId: string
): PlaybackCandidate | null {
  return (
    playableCandidates(candidates, mediaType).find(
      (c) => c.provider.id === providerId
    ) ?? null
  );
}

/**
 * Whether Reelhouse is allowed to switch away from this provider automatically.
 *
 * True ONLY when the provider documents a reliable failure signal. Everything
 * else — an ambiguous timeout, a provider that reports nothing — must surface to
 * the user as a manual choice instead.
 */
export function canAutoFallback(provider: ProviderDescriptor): boolean {
  return provider.capabilities.canReportFailure;
}

/**
 * The next candidate to try after `failedId` failed.
 *
 * Returns null when auto-fallback is not permitted for the failed provider, when
 * every candidate has already been attempted, or when nothing else can play —
 * which is what stops fallback from looping. The built-in surface is never a
 * fallback target (see switchableCandidates).
 */
export function selectFallbackCandidate(
  candidates: PlaybackCandidate[],
  mediaType: MediaType,
  failedId: string,
  attemptedIds: Iterable<string> = []
): PlaybackCandidate | null {
  const failed = playableCandidates(candidates, mediaType).find(
    (c) => c.provider.id === failedId
  );
  // Unknown or non-signalling provider → never switch automatically.
  if (!failed || !canAutoFallback(failed.provider)) return null;

  const skip = new Set<string>(attemptedIds);
  skip.add(failedId);
  return (
    switchableCandidates(candidates, mediaType).find(
      (c) => !skip.has(c.provider.id)
    ) ?? null
  );
}

// --------------------------- URL template expansion ------------------------

/**
 * Substitute `{id}`, `{season}` and `{episode}` in a provider URL template.
 *
 * Reelhouse makes NO assumption about a provider's URL shape — the owner writes
 * the whole template from the provider's own documentation and marks where the
 * values go. Values are URI-encoded, and an unsupplied token collapses to an
 * empty string so a malformed template can never smuggle a literal `{season}`
 * into a request.
 *
 * Pure and shared by the server (validation) and the client (re-expanding when
 * the episode changes), so both always produce the same URL.
 */
export function expandTemplate(template: string, values: TemplateValues): string {
  const map: Record<string, string> = {
    id: String(values.id),
    season: values.season == null ? "" : String(values.season),
    episode: values.episode == null ? "" : String(values.episode),
  };
  return template.replace(/\{(id|season|episode)\}/g, (_full, token: string) =>
    encodeURIComponent(map[token] ?? "")
  );
}

/** Tokens a template actually uses — for config diagnostics. */
export function templateTokens(template: string): string[] {
  return [...new Set(template.match(/\{(?:id|season|episode)\}/g) ?? [])];
}
