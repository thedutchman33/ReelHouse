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
 * Translates one message payload into a signal, or null to ignore it.
 * Receives `data` only — origin checking happens before the adapter is called.
 */
export type ProviderMessageAdapter = (data: unknown) => PlaybackSignal | null;

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

// ------------------------------- Videasy ------------------------------------
//
// Videasy (vidy.st) is the provider slot this deployment is configured with. Its
// hosted player posts its own state to the parent window as JSON text:
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

const VIDEASY_HOSTS = new Set(["vidy.st", "www.vidy.st"]);

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

export const videasyAdapter: ProviderMessageAdapter = (data) => {
  const payload = typeof data === "string" ? safeJson(data) : data;
  if (!payload || typeof payload !== "object") return null;
  const message = payload as { type?: unknown; data?: unknown };
  if (message.type !== "PLAYER_EVENT") return null;
  if (!message.data || typeof message.data !== "object") return null;

  const event = message.data as VideasyEvent;
  if (event.event === "ended") return { kind: "ended" };
  if (
    event.event !== "timeupdate" &&
    event.event !== "play" &&
    event.event !== "pause"
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
 * Adapters by provider id. The five slots are intentionally ABSENT: add an entry
 * (`"provider-3": myAdapter`) only once that provider's official documentation
 * describes its events, and set `VIDEO_PROVIDER_3_REPORTS_PROGRESS` /
 * `_REPORTS_FAILURE` to match what the adapter can actually detect.
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
 * `src` is the URL actually loaded. It selects the adapter in two cases:
 *   - a real provider whose events are documented (Videasy, by host), and
 *   - the local embed test fixture, so progress and fallback can be verified
 *     without touching this table.
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
  if (host && VIDEASY_HOSTS.has(host)) return videasyAdapter;
  if (isEmbedTestUrl(src)) return mockEmbedAdapter;
  return embedBridgeAdapter;
}

/**
 * The origin an embed's messages must come from, derived from the URL actually
 * loaded. A same-origin path (`/media/...`) resolves to this app's own origin.
 * Messages from any other origin are dropped by the embed surface — a frame must
 * not be able to speak for a provider it is not (see EmbedSurface).
 */
