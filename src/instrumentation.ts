// ---------------------------------------------------------------------------
// Startup instrumentation (Next.js 16 `register` hook — runs once per server
// instance, before the first request is served; ref
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
//
// Sole job in V1: in NON-PRODUCTION only, log a ONE-TIME, boolean-only summary
// of what this deployment has switched on, so a "did my env actually take
// effect?" check needs no guesswork. This changes NO application behavior — it
// is pure observability.
//
// Safety invariants:
//   • Dev-only: logged only when NODE_ENV !== "production", so a production
//     server (`next start`) stays quiet. The output is booleans-only and would
//     be safe in prod too — keeping it out of prod is a signal-to-noise choice.
//   • Node runtime only. Next calls `register` in every runtime (Node + Edge);
//     we guard on NEXT_RUNTIME and dynamic-import the `server-only` status
//     module INSIDE the guard, so nothing is pulled into the Edge bundle. This
//     mirrors how src/proxy.ts scopes its Supabase import.
//   • Secret-safe: logs booleans/labels only — never a key/token/password or any
//     process.env value. getConfigStatus() returns booleans by design, and
//     formatConfigSummary() only ever sees those booleans.
//   • Never fatal: wrapped in try/catch so a logging failure cannot stop the
//     server from becoming ready. Blank env → an all-"off"/fallback summary,
//     with no throw path.
// ---------------------------------------------------------------------------

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;

  try {
    const [{ getConfigStatus }, { formatConfigSummary }] = await Promise.all([
      import("@/lib/env"),
      import("@/lib/config-summary"),
    ]);
    console.info(formatConfigSummary(getConfigStatus()).join("\n"));
  } catch {
    // Observability must never break boot; skip the summary and continue.
    console.warn("[instrumentation] startup config summary skipped (non-fatal).");
  }
}
