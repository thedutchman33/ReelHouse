import type { ConfigStatus } from "@/lib/env";

// ---------------------------------------------------------------------------
// Pure formatter for the one-time startup configuration summary.
//
// Split out from env.ts (and from instrumentation.ts) on purpose:
//   • It takes a ConfigStatus of BOOLEANS and returns display strings, so it is
//     trivially unit-testable and — by construction — can never emit a secret
//     value: it never receives one.
//   • The ConfigStatus import is TYPE-ONLY (erased at compile), so this module
//     does NOT pull in env.ts, nor its transitive tmdb.ts `cache()` module-load
//     side effect, at runtime — keeping it importable in a plain Vitest
//     (non-Next) context. `isolatedModules` also requires `import type` here.
// ---------------------------------------------------------------------------

/**
 * Render a ConfigStatus as a human-readable, boolean-only summary (one string
 * per line). Pure and deterministic; contains no secret values by construction.
 */
export function formatConfigSummary(status: ConfigStatus): string[] {
  const onOff = (on: boolean): string => (on ? "on" : "off");
  const setState = (present: boolean): string => (present ? "set" : "not set");
  const row = (label: string, value: string): string =>
    `  • ${label.padEnd(18)}: ${value}`;

  return [
    "Reelhouse — environment configuration (each feature falls back to its default until its env is set):",
    row("metadata", status.metadata ? "live TMDB" : "mock catalog"),
    row("subtitle search", onOff(status.subtitleSearch)),
    row("subtitle download", onOff(status.subtitleDownload)),
    row("auth + persistence", status.supabase ? "Supabase" : "local (localStorage)"),
    row(
      "provider slots",
      `${status.playback.enabledSlots} of 5 enabled (${status.playback.configuredSlots} configured)`
    ),
    row(
      "optional vars",
      [
        `service-role-key ${setState(status.optionals.supabaseServiceRoleKey)}`,
        `redis ${setState(status.optionals.redisUrl)}`,
        `video-provider-base ${setState(status.optionals.videoProviderBase)}`,
        `video-provider-key ${setState(status.optionals.videoProviderKey)}`,
      ].join(", ")
    ),
  ];
}
