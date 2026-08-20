import "server-only";

import { isLiveMetadata } from "@/lib/tmdb";
import { isDownloadConfigured, isSearchConfigured } from "@/lib/opensubtitles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { describePlaybackSlots } from "@/lib/playback/registry";

// ---------------------------------------------------------------------------
// Server-only, read-only view of what THIS environment has configured.
//
// Purpose: one typed place to answer "what's switched on in this deployment?" —
// for the deployment checklist (docs/deployment.md) and an optional dev-startup
// summary. This is a STATUS REPORT, not a config loader: it does not read env
// vars into features, and missing env is never fatal here. The app degrades
// gracefully on its own (mock catalog + localStorage); this only describes the
// current state. See PROGRESS.md → Phase 4 / M2.
//
// Secret-safety invariants (non-negotiable):
//   • `server-only`: never bundled into client code.
//   • Reports BOOLEANS ONLY — never a secret's value. Keys / passwords / tokens
//     are reported as "set / not set"; their values are never returned or logged.
//   • The gated video-provider seam is reported for presence/counts only — how
//     many provider slots are configured or enabled, never a name, URL or
//     template, and reading them here activates nothing.
//
// Why compose the existing helpers instead of re-reading process.env: each
// feature already owns its config gate (tmdb.ts / opensubtitles.ts /
// supabase/config.ts), so there is one source of truth per toggle and no way for
// this file to disagree with the code that actually branches on the env var.
// (This is also why the 9 feature env reads are NOT relocated here.)
// ---------------------------------------------------------------------------

/** True when an optional env var is present and non-blank (whitespace ignored). */
function isSet(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export interface ConfigStatus {
  /** Live TMDB metadata is on (else the built-in mock catalog). */
  metadata: boolean;
  /** OpenSubtitles subtitle *search* is available (API key present). */
  subtitleSearch: boolean;
  /** OpenSubtitles subtitle *download* is available (API key + account creds). */
  subtitleDownload: boolean;
  /** Supabase auth + persistence is on (else anonymous / localStorage local mode). */
  supabase: boolean;
  /**
   * The five configurable playback-provider slots — COUNTS ONLY. Never a provider
   * name, URL or template: a slot's configuration is not a secret, but this
   * report exists to say what is switched on, not to echo values.
   */
  playback: {
    /** How many of the five slots have any configuration at all (0–5). */
    configuredSlots: number;
    /** How many of the five slots are enabled (0–5). */
    enabledSlots: number;
  };
  /**
   * Presence-only flags for env vars that are declared but not yet read by any
   * feature — surfaced for the deployment checklist. Each value is whether the
   * var is SET, never the value itself.
   */
  optionals: {
    /** Privileged server key that bypasses RLS — presence only, never its value. */
    supabaseServiceRoleKey: boolean;
    /** Shared metadata cache for scale-out (else the built-in Next.js Data Cache). */
    redisUrl: boolean;
    /**
     * Licensed playback-provider seam — DEFERRED and unused (playback stays
     * authorized / Creative-Commons only). Presence is reported for the
     * deployment checklist; nothing here reads or activates the provider.
     */
    videoProviderBase: boolean;
    videoProviderKey: boolean;
  };
}

/**
 * Snapshot of what this environment has configured. Server-only; safe to call
 * anywhere on the server; returns booleans only and has no side effects.
 */
export function getConfigStatus(): ConfigStatus {
  return {
    metadata: isLiveMetadata(),
    subtitleSearch: isSearchConfigured(),
    subtitleDownload: isDownloadConfigured(),
    supabase: isSupabaseConfigured(),
    playback: describePlaybackSlots(),
    optionals: {
      supabaseServiceRoleKey: isSet(process.env.SUPABASE_SERVICE_ROLE_KEY),
      redisUrl: isSet(process.env.REDIS_URL),
      videoProviderBase: isSet(process.env.VIDEO_PROVIDER_BASE),
      videoProviderKey: isSet(process.env.VIDEO_PROVIDER_KEY),
    },
  };
}
