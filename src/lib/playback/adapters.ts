"use client";

import type { PlaybackFailureReason } from "./types";

// ---------------------------------------------------------------------------
// Provider message adapters (client-side).
//
// An `embed` provider runs in an iframe, so anything Reelhouse learns about it
// arrives as a `postMessage`. Every provider words those messages differently,
// so each one gets a small ADAPTER that translates its own documented payload
// into the normalized signals below. Nothing else in the app parses provider
// messages.
//
// IMPORTANT — nothing is assumed here. A provider only gets an adapter once its
// actual, observed message contract is known (see Videasy below); a provider
// whose payloads were never verified sends nothing Reelhouse will act on. A slot
// with no adapter still plays (the provider owns its player UI), and the
// namespaced Reelhouse bridge lets any host report state deliberately.
//
// To add one later, follow docs/video-provider-setup.md → "Provider events".
// ---------------------------------------------------------------------------

/** Normalized signal vocabulary. Providers are translated INTO this. */
export type PlaybackSignal =
  | { kind: "ready" }
  | {
      kind: "progress";
      seconds: number;
      duration: number;
      /**
       * Present when the provider's progress report also names the episode it is
       * playing. Hosted players that expose their own Next control advance
       * without any separate navigation event, so this is how Reelhouse learns
       * that the episode changed (and retargets history before writing).
       */
      season?: number;
      episode?: number;
    }
  | { kind: "episode"; season: number; episode: number }
  | { kind: "ended" }
  | { kind: "failure"; reason: PlaybackFailureReason; detail?: string };

/**
 * What the host already knows about the framed title. Some players key their
 * payload by TMDB id (`tv-1408`), so the adapter needs the ids the frame was
 * opened with to pick the right record.
 */
export interface AdapterContext {
  /** TMDB ids this frame addresses (root id, plus a resolved anime twin). */
  mediaIds?: number[];
  /** The provider endpoint's media type — anime players use TV endpoints. */
  mediaType?: "movie" | "tv";
  /**
   * When this frame was mounted (epoch ms). A MEDIA_DATA record older than the
   * mount is watch history, not current playback, and must not move the page.
   */
  mountedAt?: number;
}

/**
 * Translates one message payload into a signal, or null to ignore it.
 * Receives `data` plus optional title context; origin checking happens before
 * the adapter is called.
 */
export type ProviderMessageAdapter = (
  data: unknown,
  context?: AdapterContext
) => PlaybackSignal | null;

// --------------------------- embed test fixture ----------------------------
//
// A developer-only test page lives at public/media/mock-embed/player.html. It is
// NOT a provider: it is registered nowhere, appears in no selector, and is only
// ever loaded if an operator deliberately points a slot's URL template at it to
// verify the embed pipeline before a real provider exists.
//
// Its adapter is therefore keyed by that URL rather than by a provider id — see
// getMessageAdapter below.

/** Same-origin path of the embed test fixture (under /public/media). */
export const EMBED_TEST_PATH = "/media/mock-embed/player.html";

/**
 * Message contract of the embed test fixture.
 *
 * This is the FIXTURE's OWN contract, invented for testing — it is not a standard
 * and no real provider is expected to match it. It exists so the embed surface,
 * progress plumbing, and controlled fallback can all be exercised end-to-end
 * with no external provider connected.
 *
 *   { source: "reelhouse-mock-embed",
 *     type: "ready" | "timeupdate" | "ended" | "error",
 *     currentTime?: number, duration?: number, message?: string }
 */
export const MOCK_EMBED_MESSAGE_SOURCE = "reelhouse-mock-embed";

interface MockEmbedMessage {
  source?: unknown;
  type?: unknown;
  currentTime?: unknown;
  duration?: unknown;
  message?: unknown;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const mockEmbedAdapter: ProviderMessageAdapter = (data) => {
  if (!data || typeof data !== "object") return null;
  const msg = data as MockEmbedMessage;
  if (msg.source !== MOCK_EMBED_MESSAGE_SOURCE) return null;

  switch (msg.type) {
    case "ready":
      return { kind: "ready" };
    case "timeupdate": {
      const seconds = num(msg.currentTime);
      const duration = num(msg.duration);
      if (seconds == null || duration == null || duration <= 0) return null;
      return { kind: "progress", seconds, duration };
    }
    case "ended":
      return { kind: "ended" };
    case "error":
      return {
        kind: "failure",
        reason: "provider-reported",
        detail: typeof msg.message === "string" ? msg.message : undefined,
      };
    default:
      return null;
  }
};

// --------------------------- Reelhouse embed bridge --------------------------
//
// A provider — or a thin relay page the operator controls in front of one — can
// report its state with ONE documented, namespaced schema. Nothing is guessed:
// a message is only read when it carries the bridge's own `source` marker, and
// the embed surface has already checked that it came from the frame's origin AND
// that frame's window. Any other message shape is ignored.
//
//   { source: "reelhouse-embed", type: "ready" }
//   { source: "reelhouse-embed", type: "progress" | "timeupdate",
//     currentTime: 123.4, duration: 2700 }
//   { source: "reelhouse-embed", type: "episode", season: 3, episode: 4 }
//   { source: "reelhouse-embed", type: "ended" }
//   { source: "reelhouse-embed", type: "error", message: "…" }
//
// `episode` is what lets a hosted player's OWN Next Episode button reach watch
// history: the container moves to that episode and re-keys progress without
// reloading the frame (the provider is already playing it).
//
// Because the schema is namespaced, it is safe to accept from every embed: a
// provider that does not speak it simply sends nothing.

export const EMBED_BRIDGE_SOURCE = "reelhouse-embed";

interface EmbedBridgeMessage {
  source?: unknown;
  type?: unknown;
  currentTime?: unknown;
  duration?: unknown;
  season?: unknown;
  episode?: unknown;
  message?: unknown;
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/** Videasy spells coordinates as numbers, but tolerate numeric strings too. */
function coordinate(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : num(value);
  return n != null && Number.isInteger(n) && n > 0 ? n : null;
}

export const embedBridgeAdapter: ProviderMessageAdapter = (data) => {
  if (!data || typeof data !== "object") return null;
  const msg = data as EmbedBridgeMessage;
  if (msg.source !== EMBED_BRIDGE_SOURCE) return null;

  switch (msg.type) {
    case "ready":
      return { kind: "ready" };
    case "progress":
    case "timeupdate": {
      const seconds = num(msg.currentTime);
      const duration = num(msg.duration);
      if (seconds == null || duration == null || duration <= 0 || seconds < 0) {
        return null;
      }
      return { kind: "progress", seconds, duration };
    }
    case "episode": {
      const season = positiveInt(msg.season);
      const episode = positiveInt(msg.episode);
      if (season == null || episode == null) return null;
      return { kind: "episode", season, episode };
    }
    case "ended":
      return { kind: "ended" };
    case "error":
      return {
        kind: "failure",
        reason: "provider-reported",
        detail: typeof msg.message === "string" ? msg.message : undefined,
      };
    default:
      return null;
  }
};

// --------------------- documented PLAYER_EVENT players ----------------------
//
// Videasy (vidy.st), VidLink (vidlink.pro) and VidNest (vidnest.fun) publish the
// same documented contract, captured from their live players: position, duration
// and the season/episode ACTUALLY playing. The payload arrives as JSON text or as
// an object:
//
//   { "type": "PLAYER_EVENT",
//     "data": { "event": "timeupdate" | "play" | "pause" | "ended",
//               "currentTime"?: 123.4, "timestamp"?: 123.4,
//               "duration": 3444, "progress"?: 3.6,
//               "type": "tv", "id": "84773",
//               "season": 3, "episode": 4 } }
//
// Both position spellings occur in the wild (`currentTime` and `timestamp`), and
// `progress` is a PERCENTAGE — never seconds, so it is deliberately never read as
// a position. `season`/`episode` describe what the player is ACTUALLY playing,
// which is what makes the provider's own Next Episode button visible to history.
//
// Recognizing the provider by URL host (not by slot id) keeps this working when
// the operator configures it in a different slot, and survives the
// `vidy.st` → `www.vidy.st` redirect the player performs.

const PLAYER_EVENT_HOSTS = new Set([
  "vidy.st",
  "www.vidy.st",
  "vidlink.pro",
  "vidnest.fun",
]);

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

interface VideasyEvent {
  event?: unknown;
  currentTime?: unknown;
  timestamp?: unknown;
  duration?: unknown;
  season?: unknown;
  episode?: unknown;
}

/**
 * The other spelling of the same documented contract (VidAPI / VidSrc family):
 * playback state under `player_status`, position under `player_progress`, and the
 * episode under `player_info`. Same message type, so it is read here too rather
 * than assumed absent.
 */
interface PlayerInfoEvent {
  player_info?: { season?: unknown; episode?: unknown } | null;
  player_status?: unknown;
  player_progress?: unknown;
  player_duration?: unknown;
}

export const playerEventAdapter: ProviderMessageAdapter = (data) => {
  const payload = typeof data === "string" ? safeJson(data) : data;
  if (!payload || typeof payload !== "object") return null;
  const message = payload as { type?: unknown; data?: unknown };
  if (message.type !== "PLAYER_EVENT") return null;
  if (!message.data || typeof message.data !== "object") return null;

  const api = message.data as PlayerInfoEvent;
  if (api.player_status != null || api.player_progress != null) {
    if (api.player_status === "completed") return { kind: "ended" };
    const seconds = num(api.player_progress);
    const duration = num(api.player_duration);
    if (seconds == null || seconds < 0 || duration == null || duration <= 0) {
      return null;
    }
    const season = api.player_info ? coordinate(api.player_info.season) : null;
    const episode = api.player_info ? coordinate(api.player_info.episode) : null;
    return {
      kind: "progress",
      seconds,
      duration,
      ...(season != null && episode != null ? { season, episode } : {}),
    };
  }

  const event = message.data as VideasyEvent;
  if (event.event === "ended") return { kind: "ended" };
  if (
    event.event !== "timeupdate" &&
    event.event !== "play" &&
    event.event !== "pause" &&
    event.event !== "seeked" &&
    event.event !== "time"
  ) {
    return null;
  }

  // `progress` is a percentage, so it must never stand in for a position: a
  // pause at 50% of a 44-minute episode is 1320s, not 50s.
  const seconds = num(event.currentTime) ?? num(event.timestamp);
  const duration = num(event.duration);
  if (seconds == null || seconds < 0 || duration == null || duration <= 0) {
    return null;
  }

  const season = coordinate(event.season);
  const episode = coordinate(event.episode);
  return {
    kind: "progress",
    seconds,
    duration,
    ...(season != null && episode != null ? { season, episode } : {}),
  };
};

// ------------------------------ MEDIA_DATA ----------------------------------
//
// Captured from the live VidFast/Videasy players (and from 7REELS' own host):
// a JSON text or object named `MEDIA_DATA`, keyed by title:
//
//   { "type": "MEDIA_DATA",
//     "data": "{\"tv-1408\": {
//       \"last_season_watched\": 1,
//       \"last_episode_watched\": 4,
//       \"last_updated\": 1760000000000,
//       \"show_progress\": {
//         \"s1e4\": { \"season\": 1, \"episode\": 4,
//                    \"progress\": { \"watched\": 1200, \"duration\": 2700 },
//                    \"last_updated\": 1760000000000 }
//       }
//     }}" }
//
// This is the message a player's OWN Next Episode button produces: the new
// season/episode and the position that belongs to it. `last_updated` is the
// freshness proof — a payload describing what the viewer watched yesterday must
// not move today's page — so only a recent one is followed. The position is
// read from the entry for that exact episode, never from a bulk backfill that
// could be older than the position Reelhouse already saved.

/** How recent a MEDIA_DATA timestamp must be to describe current playback. */
const MEDIA_DATA_FRESH_MS = 120_000;

/** 5s of slack for a player that stamps just before the frame finishes loading. */
const MEDIA_DATA_MOUNT_SLACK_MS = 5_000;

/**
 * Freshness proof, matching the reference: a record must be recent AND must not
 * predate the frame that is reporting it. Without the second check, a player
 * that replays yesterday's saved record on mount would drag the page back to an
 * episode the viewer watched in an earlier session.
 */
function mediaDataIsFresh(at: number | null, mountedAt: number | undefined): boolean {
  if (at == null) return false;
  if (Date.now() - at > MEDIA_DATA_FRESH_MS) return false;
  return mountedAt == null || at >= mountedAt - MEDIA_DATA_MOUNT_SLACK_MS;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/** Some providers post JSON text; accept either that or an object. */
function parseMaybeJson(value: unknown): unknown {
  return typeof value === "string" ? safeJson(value) : value;
}

/** `last_updated` is milliseconds; tolerate a seconds-based epoch too. */
function timestampMs(value: unknown): number | null {
  const n = num(value);
  if (n == null || n <= 0) return null;
  return n < 1_000_000_000_000 ? n * 1000 : n;
}

/**
 * The record for THIS title. Providers key the payload by `tv-<tmdbId>` (or
 * `<tmdbId>`); a payload that is itself one record, or that contains exactly one
 * record, is unambiguous even without context.
 */
function selectMediaRecord(root: JsonRecord, context?: AdapterContext): JsonRecord | null {
  const mediaType = context?.mediaType === "movie" ? "movie" : "tv";
  for (const id of context?.mediaIds ?? []) {
    for (const key of [`${mediaType}-${id}`, String(id)]) {
      const record = asRecord(root[key]);
      if (record) return record;
    }
  }
  if (
    root.season != null ||
    root.episode != null ||
    root.show_progress != null ||
    root.progress != null
  ) {
    return root;
  }
  const records = Object.values(root)
    .map(asRecord)
    .filter((value): value is JsonRecord => value != null);
  return records.length === 1 ? records[0] : null;
}

function progressOf(value: unknown): { watched: number; duration: number } | null {
  const record = asRecord(value);
  if (!record) return null;
  const watched = num(record.watched);
  const duration = num(record.duration);
  if (watched == null || watched < 0 || duration == null || duration <= 0) return null;
  return { watched, duration };
}

function newestProgressEntry(showProgress: JsonRecord): JsonRecord | null {
  let newest: JsonRecord | null = null;
  let newestAt = -1;
  for (const value of Object.values(showProgress)) {
    const entry = asRecord(value);
    if (!entry) continue;
    const at = timestampMs(entry.last_updated ?? entry.updated_at) ?? 0;
    if (at > newestAt) {
      newest = entry;
      newestAt = at;
    }
  }
  return newest;
}

export const mediaDataAdapter: ProviderMessageAdapter = (data, context) => {
  const payload = asRecord(parseMaybeJson(data));
  if (!payload || payload.type !== "MEDIA_DATA") return null;
  const root = asRecord(parseMaybeJson(payload.data));
  if (!root) return null;
  const record = selectMediaRecord(root, context);
  if (!record) return null;

  const season = coordinate(record.last_season_watched ?? record.season);
  const episode = coordinate(record.last_episode_watched ?? record.episode);
  const updatedAt = timestampMs(record.last_updated ?? record.updated_at);
  const fresh = mediaDataIsFresh(updatedAt, context?.mountedAt);

  // TV: one entry per episode, keyed however the provider likes. Only the
  // entry for the current pair — or, failing that, the most recently updated
  // one — can be trusted as "where the viewer is now".
  const showProgress = asRecord(record.show_progress);
  if (showProgress) {
    let entry: JsonRecord | null = null;
    if (season != null && episode != null) {
      for (const value of Object.values(showProgress)) {
        const candidate = asRecord(value);
        if (!candidate) continue;
        if (
          coordinate(candidate.season) === season &&
          coordinate(candidate.episode) === episode
        ) {
          entry = candidate;
          break;
        }
      }
    }
    entry ??= newestProgressEntry(showProgress);
    const progress = progressOf(entry?.progress);
    const entryAt =
      timestampMs(entry?.last_updated ?? entry?.updated_at) ?? updatedAt;
    if (progress && mediaDataIsFresh(entryAt, context?.mountedAt)) {
      const entrySeason = coordinate(entry?.season) ?? season;
      const entryEpisode = coordinate(entry?.episode) ?? episode;
      return {
        kind: "progress",
        seconds: progress.watched,
        duration: progress.duration,
        ...(entrySeason != null && entryEpisode != null
          ? { season: entrySeason, episode: entryEpisode }
          : {}),
      };
    }
  }

  // A movie's record carries a single `progress`, not a season map. It cannot
  // move the URL, so its position is safe to read even without a timestamp.
  if (context?.mediaType === "movie") {
    const progress = progressOf(record.progress);
    return progress
      ? { kind: "progress", seconds: progress.watched, duration: progress.duration }
      : null;
  }

  // The TV fallback: one record holding the current pair and its progress.
  const recordProgress = progressOf(record.progress);
  if (fresh && season != null && episode != null) {
    if (recordProgress) {
      return {
        kind: "progress",
        seconds: recordProgress.watched,
        duration: recordProgress.duration,
        season,
        episode,
      };
    }
    return { kind: "episode", season, episode };
  }
  return null;
};

// ------------------------- generic episode messages -------------------------
//
// A hosted player that names no position but does announce its episode (a Next
// control, an episode picker) is still useful: the page URL, history and rail
// must follow it. This reads ONLY a positive `season` + `episode` pair, directly
// or under `data`, and deliberately leaves `PLAYER_EVENT`/`MEDIA_DATA` to the
// stricter adapters above — their staleness rules must not be bypassed here.

export const episodeMessageAdapter: ProviderMessageAdapter = (data) => {
  const payload = asRecord(parseMaybeJson(data));
  if (!payload) return null;
  if (payload.type === "MEDIA_DATA" || payload.type === "PLAYER_EVENT") return null;
  const nested = asRecord(parseMaybeJson(payload.data));
  const holder = nested ?? payload;
  const season = coordinate(holder.season);
  const episode = coordinate(holder.episode);
  if (season == null || episode == null) return null;
  return { kind: "episode", season, episode };
};

// -------------------------------- VidRift -----------------------------------
//
// VidRift (embed.vidrift.net, and embed.vidrift.in which serves the same player)
// posts its own namespaced messages. Every one carries the title AND the episode
// actually playing, and `vidrift:episode` is sent right before the player swaps
// its iframe to the episode the viewer picked — which is exactly the moment the
// host's URL has to move with it:
//
//   { type: "vidrift:episode", tmdbId, mediaType, season, episode }
//   { type: "vidrift:progress" | "vidrift:unpaused" | "vidrift:paused",
//     currentTime, duration, tmdbId, mediaType, season, episode }
//   { type: "vidrift:ended", … }
//
// Its UI chatter (vidrift:ui-hidden, vidrift:providers, vidrift:state, …) names
// no position and is ignored.

const VIDRIFT_HOSTS = new Set(["embed.vidrift.net", "embed.vidrift.in"]);

interface VidriftMessage {
  type?: unknown;
  currentTime?: unknown;
  duration?: unknown;
  season?: unknown;
  episode?: unknown;
}

export const vidriftAdapter: ProviderMessageAdapter = (data) => {
  const payload = typeof data === "string" ? safeJson(data) : data;
  if (!payload || typeof payload !== "object") return null;
  const msg = payload as VidriftMessage;
  if (typeof msg.type !== "string" || !msg.type.startsWith("vidrift:")) return null;

  if (msg.type === "vidrift:ended") return { kind: "ended" };

  const season = coordinate(msg.season);
  const episode = coordinate(msg.episode);

  if (msg.type === "vidrift:episode") {
    if (season == null || episode == null) return null;
    return { kind: "episode", season, episode };
  }

  if (
    msg.type !== "vidrift:progress" &&
    msg.type !== "vidrift:unpaused" &&
    msg.type !== "vidrift:paused"
  ) {
    return null;
  }

  const seconds = num(msg.currentTime);
  const duration = num(msg.duration);
  if (seconds == null || seconds < 0 || duration == null || duration <= 0) {
    return null;
  }
  return {
    kind: "progress",
    seconds,
    duration,
    ...(season != null && episode != null ? { season, episode } : {}),
  };
};

/**
 * The contracts a hosted player may publish, in strictness order: documented
 * PLAYER_EVENT, the MEDIA_DATA record a Next Episode produces, then a bare
 * positive season/episode pair. Each adapter rejects a payload it cannot read,
 * so composing them never makes a player look like it said something it didn't.
 */
export const playerContractAdapter: ProviderMessageAdapter = (data, context) =>
  playerEventAdapter(data, context) ??
  mediaDataAdapter(data, context) ??
  episodeMessageAdapter(data, context);

/**
 * The conservative fallback every embed gets: the namespaced Reelhouse bridge,
 * plus the hosted-player contracts above (VidFast, VidBolt, VidLink, VidNest,
 * Videasy, VidSrc-style). A payload is only read when it carries one of those
 * exact shapes, so a player that sends something else contributes nothing.
 */
export const embedAdapter: ProviderMessageAdapter = (data, context) =>
  embedBridgeAdapter(data) ?? playerContractAdapter(data, context);

/** The origin(s) an embed may legitimately post from (see EmbedSurface). */
export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "https://reelhouse.invalid").hostname.toLowerCase();
  } catch {
    return null;
  }
}

// ------------------------------- adapter table ------------------------------

/**
 * Adapters by provider id. The slots are intentionally ABSENT: an entry
 * (`"provider-3": myAdapter`) is only needed when a provider's own messages are
 * recognised by neither its host nor the bridge.
 */
const ADAPTERS: Record<string, ProviderMessageAdapter> = {};

/** True when this URL is the local embed test fixture (never a real provider). */
function isEmbedTestUrl(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  return path === EMBED_TEST_PATH;
}

/**
 * The adapter for a provider, or null when it publishes no documented events.
 *
 * `src` is the URL actually loaded. It selects the adapter in three cases:
 *   - a provider whose message contract is documented, recognised by HOST
 *     (Videasy, VidLink, VidNest publish PLAYER_EVENT; VidRift has its own),
 *   - the local embed test fixture, so progress and fallback can be verified
 *     without touching this table, and
 *   - the documented player contracts plus the namespaced Reelhouse bridge,
 *     which any embed may use.
 * A host check — not a slot number — is what makes a documented provider keep
 * working when an operator moves it to another slot.
 */
export function getMessageAdapter(
  providerId: string,
  src?: string
): ProviderMessageAdapter | null {
  const byProvider = ADAPTERS[providerId];
  if (byProvider) return byProvider;

  const host = hostOf(src);
  if (host && PLAYER_EVENT_HOSTS.has(host)) return playerContractAdapter;
  if (host && VIDRIFT_HOSTS.has(host)) return vidriftAdapter;
  if (isEmbedTestUrl(src)) return mockEmbedAdapter;
  return embedAdapter;
}
