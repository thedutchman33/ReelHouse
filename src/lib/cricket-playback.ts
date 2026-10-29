import "server-only";

import { cricketEmbedHref, isCricketSourceShape } from "@/lib/cricket-embed";
import { orderProviders } from "@/lib/playback/manager";
import type {
  PlaybackCandidate,
  PlaybackPlan,
  ProviderCapabilities,
  ProviderDescriptor,
} from "@/lib/playback/types";

// ---------------------------------------------------------------------------
// Cricket playback plan.
//
// Cricket IS environment-backed, unlike F1: the sources are short-lived public
// pages whose URLs change with the fixture, so the operator drops them into
// .env.local. Up to five slots are read:
//
//   CRICKET_SERVER_N_NAME          display name           (default "Cricket Server N")
//   CRICKET_SERVER_N_URL           absolute https:// URL
//   CRICKET_SERVER_N_MEDIA_TYPES   optional; must include "cricket"
//   CRICKET_SERVER_N_ENABLED       optional; default ON (unlike VIDEO_PROVIDER_*)
//   CRICKET_SERVER_N_PRIORITY      optional; default N*10, lower first
//
// A slot the operator has started configuring stays in `providers` even when it
// cannot play, so a typo is visible in the Servers panel instead of silently
// disappearing. Only a safe, enabled URL becomes a candidate.
//
// The candidate URL is NEVER the source URL itself. It is the same-origin
// sanitizer route (src/app/api/cricket/embed/route.ts), which fetches the page
// server-side, removes the Telegram funnel/ad scripts and returns it under a
// sandbox. That is what makes the fix work for every visitor rather than only
// for browsers with a userscript installed.
// ---------------------------------------------------------------------------

/** This module owns the five cricket slots; keep the count explicit. */
export const CRICKET_SERVER_SLOTS = [1, 2, 3, 4, 5] as const;
export type CricketServerSlot = (typeof CRICKET_SERVER_SLOTS)[number];

/**
 * Origins the configured pages embed in turn. dekhobhai/HIN wraps
 * newball/HIN1HD; both need to be proxied so the inner frame gets the same
 * dialog shim. Configured server origins are added automatically.
 */
export const CRICKET_NESTED_ORIGINS = [
  "https://newball.pages.dev",
  "https://dekhobhai.pages.dev",
] as const;

/**
 * The iframe sandbox for every cricket embed.
 *
 * `allow-same-origin` is required: the protected player document is first-party
 * and ClearKey-encrypted, and Encrypted Media Extensions are refused on a unique
 * origin — both a `sandbox` attribute without it and the route's CSP `sandbox`
 * produce one. The sanitized third-party fallback is still isolated: that
 * response carries its own `sandbox allow-scripts` header, so this attribute can
 * only add restrictions, never lift them.
 */
export const CRICKET_EMBED_SANDBOX = "allow-scripts allow-same-origin";

const CRICKET_CAPABILITIES: ProviderCapabilities = {
  canReportProgress: false,
  canReportFailure: false,
  supportedMediaTypes: ["cricket"],
};

export interface CricketServerConfig {
  /** Stable selection id — never reused for a different service. */
  id: string;
  /** Name shown in the Servers panel. */
  name: string;
  /** Source page URL (absolute https://). Empty when the slot is incomplete. */
  url: string;
  /** Lower sorts first; the first enabled entry is the default server. */
  priority: number;
  /** Omitted means enabled. */
  enabled?: boolean;
  /** Why a disabled/incomplete entry cannot be selected. */
  note?: string;
}

function readVar(
  slot: CricketServerSlot,
  key: string
): string | undefined {
  const value = process.env[`CRICKET_SERVER_${slot}_${key}`];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePriority(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseEnabled(value: string | undefined): boolean {
  // A cricket slot is on by default: the operator supplying a URL is the
  // intent. VIDEO_PROVIDER_* defaults OFF because those are an optional seam.
  if (!value) return true;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function mediaTypes(value: string | undefined): string[] | null {
  if (!value) return null;
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * An absolute source URL we are willing to fetch and proxy.
 *
 * https:// only, plus http:// on localhost in development so a local fixture
 * server can be trialled. Credentials in the URL are rejected: the embed href
 * is visible in the page, so a URL must never carry a secret.
 */
export function isSafeCricketSourceUrl(
  raw: string,
  { allowInsecureLocalhost = process.env.NODE_ENV !== "production" } = {}
): boolean {
  if (!isCricketSourceShape(raw)) return false;
  const url = new URL(raw);
  if (url.protocol === "https:") return true;
  return (
    allowInsecureLocalhost &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

/** Read the configured slots. Slots with no configuration at all are omitted. */
export function readCricketServers(): CricketServerConfig[] {
  const servers: CricketServerConfig[] = [];

  for (const slot of CRICKET_SERVER_SLOTS) {
    const name = readVar(slot, "NAME");
    const url = readVar(slot, "URL");
    const types = readVar(slot, "MEDIA_TYPES");

    // An untouched slot is not a broken slot — leave it out of the panel.
    if (!name && !url && !types) continue;

    const enabled = parseEnabled(readVar(slot, "ENABLED"));
    const declaredTypes = mediaTypes(types);
    const servesCricket = !declaredTypes || declaredTypes.includes("cricket");

    servers.push({
      id: `cricket-${slot}`,
      name: name ?? `Cricket Server ${slot}`,
      url: url ?? "",
      // Slot 2 is the currently healthy Star Sports source; keep it as the
      // default when the operator has not supplied explicit priorities. The
      // other slots remain visible and selectable for source-side recovery.
      priority: parsePriority(
        readVar(slot, "PRIORITY"),
        slot === 2 ? 5 : slot * 10
      ),
      ...(enabled && servesCricket ? {} : { enabled: false }),
      ...(servesCricket
        ? {}
        : { note: "MEDIA_TYPES does not list cricket" }),
    });
  }

  return servers;
}

function unavailableReason(server: CricketServerConfig): string | null {
  if (!server.url) return "No stream URL set";
  if (server.enabled === false) return server.note ?? "Disabled";
  if (!isSafeCricketSourceUrl(server.url)) {
    return "Stream URL must be an absolute https:// URL";
  }
  return null;
}

/**
 * Build a plan from an explicit server list. Exported for tests; the page uses
 * the environment-backed default below.
 */
export function buildCricketPlaybackPlan(
  servers: readonly CricketServerConfig[] = readCricketServers()
): PlaybackPlan {
  const providers: ProviderDescriptor[] = [];
  const candidates: PlaybackCandidate[] = [];

  for (const server of servers) {
    const reason = unavailableReason(server);
    const provider: ProviderDescriptor = {
      id: server.id,
      displayName: server.name,
      priority: server.priority,
      surface: "embed",
      capabilities: CRICKET_CAPABILITIES,
      available: reason === null,
      ...(reason === null ? {} : { unavailableReason: reason }),
      isBuiltIn: false,
    };
    providers.push(provider);

    if (reason === null) {
      candidates.push({
        provider,
        surface: {
          kind: "embed",
          urlTemplate: cricketEmbedHref(server.url),
          sandbox: CRICKET_EMBED_SANDBOX,
        },
      });
    }
  }

  return {
    providers: orderProviders(providers),
    candidates: candidates.sort(
      (a, b) =>
        a.provider.priority - b.provider.priority ||
        (a.provider.id < b.provider.id ? -1 : 1)
    ),
  };
}

/** The plan rendered by /watch/cricket. */
export function getCricketPlaybackPlan(): PlaybackPlan {
  return buildCricketPlaybackPlan();
}

/**
 * Origins /api/cricket/embed may fetch: every safe configured server, plus the
 * known nested player origins. Anything else is rejected by the route.
 */
export function getCricketEmbedAllowlist(): Set<string> {
  const origins = new Set<string>(CRICKET_NESTED_ORIGINS);

  for (const server of readCricketServers()) {
    if (!isSafeCricketSourceUrl(server.url)) continue;
    try {
      origins.add(new URL(server.url).origin);
    } catch {
      // unavailableReason() already reports the malformed URL.
    }
  }

  return origins;
}
