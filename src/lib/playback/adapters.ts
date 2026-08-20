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
// IMPORTANT — nothing is assumed here. There is no adapter for any of the five
// slots, because no provider documentation has been supplied. A slot with no
// adapter simply produces no signals: its embed still plays (the provider owns
// its player UI), Reelhouse just records no progress and performs no automatic
// fallback for it. That is the correct conservative default, and it is exactly
// what the `canReportProgress` / `canReportFailure` capability flags express.
//
// To add one later, follow docs/video-provider-setup.md → "Provider events".
// ---------------------------------------------------------------------------

/** Normalized signal vocabulary. Providers are translated INTO this. */
export type PlaybackSignal =
  | { kind: "ready" }
  | { kind: "progress"; seconds: number; duration: number }
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
 * `src` is the URL actually loaded, and is used only to recognize the local embed
 * test fixture — a slot pointed at it during setup gets the fixture's adapter, so
 * progress and fallback can be verified without touching this table.
 */
export function getMessageAdapter(
  providerId: string,
  src?: string
): ProviderMessageAdapter | null {
  return ADAPTERS[providerId] ?? (isEmbedTestUrl(src) ? mockEmbedAdapter : null);
}

/**
 * The origin an embed's messages must come from, derived from the URL actually
 * loaded. A same-origin path (`/media/...`) resolves to this app's own origin.
 * Messages from any other origin are dropped by the embed surface — a frame must
 * not be able to speak for a provider it is not.
 */
export function expectedOriginFor(url: string, pageOrigin: string): string | null {
  try {
    return new URL(url, pageOrigin).origin;
  } catch {
    return null;
  }
}
