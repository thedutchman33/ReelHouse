import "server-only";

import { F1_SERVERS, type F1ServerConfig } from "@/config/f1-servers";
import { orderProviders } from "@/lib/playback/manager";
import { isSafePlayerUrlTemplate } from "@/lib/playback/registry";
import type {
  PlaybackCandidate,
  PlaybackPlan,
  ProviderCapabilities,
  ProviderDescriptor,
} from "@/lib/playback/types";

// ---------------------------------------------------------------------------
// Formula 1 playback plan.
//
// F1 does not use the env-backed provider slots: its list is a checked-in TS
// config (src/config/f1-servers.ts) so tens of servers stay readable and cost
// no extra request at render time. This module turns that list into the same
// PlaybackPlan the movie/TV/anime watch page already consumes, so the existing
// PlaybackContainer, WatchDock and ServerPanel render it unchanged.
//
// This is deliberately separate from src/lib/f1.ts, which owns the OpenF1
// schedule/telemetry data used by the dashboard.
//
// A disabled or unsafe entry stays in `providers` (visible, with a reason) but
// never becomes a `candidate`. There is deliberately no built-in sample clip
// for F1 — the surface is embed-only.
// ---------------------------------------------------------------------------

const F1_CAPABILITIES: ProviderCapabilities = {
  canReportProgress: false,
  canReportFailure: false,
  supportedMediaTypes: ["f1"],
};

function unavailableReason(server: F1ServerConfig): string | null {
  if (server.enabled === false) return server.note ?? "Disabled";
  if (!isSafePlayerUrlTemplate(server.url)) {
    return "Player URL must be https:// or a same-origin /path";
  }
  return null;
}

/**
 * Build a playback plan from an explicit server list. Exported for tests; the
 * page uses the default list below.
 */
export function buildF1PlaybackPlan(
  servers: readonly F1ServerConfig[] = F1_SERVERS
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
      capabilities: F1_CAPABILITIES,
      available: reason === null,
      ...(reason === null ? {} : { unavailableReason: reason }),
      isBuiltIn: false,
    };
    providers.push(provider);
    if (reason === null) {
      candidates.push({
        provider,
        surface: { kind: "embed", urlTemplate: server.url },
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

/** The plan rendered by /watch/f1. */
export function getF1PlaybackPlan(): PlaybackPlan {
  return buildF1PlaybackPlan();
}

/**
 * Origin of the first enabled absolute server, used for a single preconnect on
 * the F1 watch page. Same-origin resolver paths are skipped on purpose.
 */
export function getF1PreconnectOrigin(): string | null {
  for (const server of F1_SERVERS) {
    if (server.enabled === false) continue;
    if (server.url.startsWith("/")) continue;
    if (!isSafePlayerUrlTemplate(server.url)) continue;
    try {
      const url = new URL(server.url);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Invalid URLs are already reported as unavailable by the plan builder.
    }
  }
  return null;
}
