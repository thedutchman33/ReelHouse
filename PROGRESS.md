# Reelhouse — Project Progress Checkpoint

_Last updated: 2026-08-20_

A session handoff snapshot. This is documentation only — it changes no application behavior.

## Phase numbering (read first)

Two labels are in play; they refer to related work:

- **Repo docs** (`docs/phase-2.md`) call the Supabase backend **"Phase 2 (backend)"** — and that code is written and code-complete but **not activated**.
- **The working gate model** (how this project is managed) treats the next *not-yet-done* milestone — **activating + validating that backend, plus a licensed playback provider** — as **"Phase 3"**, which stays **paused until explicit approval**.

This doc uses: **Phase 1** = front-end V1 · **Phase 2** = live TMDB metadata + Supabase backend *code* · **Phase 3** = backend *activation* + real playback (gated).

---

## Completed phases

- **Phase 1 — Front-end V1** ✅ Runs with zero setup on a mock catalog, fully offline (including playback). Home (hero + rails), search, movie/TV detail pages (TV: season/episode lists), custom watch player, personal library in `localStorage`, deterministic SVG placeholder art.
- **Phase 2 — Live TMDB metadata** ✅ Behind `TMDB_API_KEY` (server-only); silently falls back to mock when absent. v3 keys and v4 tokens both supported.
- **Custom video player rebuild** ✅ Full-viewport custom player (not native controls): quality/subtitle/server/speed panels, saves & restores playback position per movie/episode, "up next", error/retry. Playback source = bundled Creative-Commons-licensed sample clip in `public/media/`, served same-origin.
- **Subtitle search & load (internally "Phase B")** ✅ **Debugged and verified this session.** Player Settings → Subtitles → Search subtitles queries OpenSubtitles, and "Use" downloads the file server-side, converts to WebVTT, and loads it into the player.
- **Supabase backend — code-complete _and activated_** ✅. Per `docs/phase-2.md`: schema + RLS (`supabase/migrations/0001_init.sql`), client factories (`src/lib/supabase/{config,server,client,middleware}.ts`), auth (`/login`, `LoginForm`, session middleware, navbar indicator), persistence routes (`/api/watchlist`, `/api/history`, `/api/progress`), and library server-sync with one-time localStorage→server migration. **Phase 3 (2026-08-19):** a hosted Supabase project is live, `0001_init.sql` is applied, and `NEXT_PUBLIC_SUPABASE_*` are set — the data + auth + RLS layer is validated end-to-end (details below). With the env blanked it still degrades cleanly to Phase 1 behavior (middleware passthrough, factories return `null`, routes 401, library stays on `localStorage`).

## Current phase

- **Just finished (awaiting approval):** **mobile interaction audit** (2026-08-20) — every interactive element in the app hit-tested and *tapped* under Android emulation in both orientations, after the reported "Search / Sign In / provider selector do nothing on my phone". Four causes found and fixed, the first of which explains the report: `next dev` was 403ing every client chunk for the LAN origin it prints, so the page rendered perfectly and never hydrated. Dedicated section below. **A real-device retest is still owed** — see that section.
- **Previously (awaiting approval):** **password reset / "Forgot password?"** (2026-08-20) — the Supabase recovery flow, wired into the existing auth stack: a link on the sign-in form, `/forgot-password`, `/reset-password`, and the project's first auth callback route. One auth client, one session mechanism, no custom token system. Dedicated section below. **Two Supabase dashboard settings are required before the emailed link can work — see that section.**
- **Previously (code approved 2026-08-20; your live browser/Supabase verification was in progress):** **playback/history bugfix** — a title watched partway and then left behind never appeared in Watch History / Continue Watching. Root cause, the smallest correct fix, and 14 new regression tests are in the dedicated section below. No architecture, provider registry/manager, migration or RLS change.
- **Previously:** **UI redesign — dark cinematic pass** (2026-08-20, user-approved). A full visual pass over every user-facing surface against a supplied dark-cinematic reference, plus the navigation/filtering features the brief called for (`/movies`, `/tv-shows`, `/browse` + a filter bar), a glass navbar with an account menu that never shows the address, a rewritten provider picker that lists **only** configured slots, and the removal of every demo/placeholder provider from both the UI and the plan. Dedicated section below.
- **Previously:** **Provider-agnostic playback infrastructure** (2026-08-19, user-approved). Five generic provider slots, a Provider Manager, a provider picker, an embed surface, loading/error/controlled-fallback states, and provider-independent progress — **with nothing connected**: all five slots ship unconfigured and disabled, and blank-env playback is byte-identical to before. Dedicated section below.
- **Previously:** **Framework hardening upgrade + subtitle-search resilience** (2026-08-19, user-approved). Upgraded **Next.js 14.2.35 → 16.3.1** (Turbopack build) and **React 18.3.1 → 19.2.8**: migrated every dynamic route to async `params`/`searchParams`, made `createClient()`/`cookies()` async, and adopted the Next 16 `proxy` file convention (renamed `src/middleware.ts` → `src/proxy.ts`, function `middleware` → `proxy`). Also wrapped `/api/subtitles/search` in the same resilient fetch (3 attempts, per-attempt timeout, linear backoff) the download path already used. Verified: `tsc --noEmit` exit 0, a clean `next build`, and a dev-server smoke test (home / login / `search?q=` all HTTP 200 — the search route exercises the new async `searchParams`). Details below.
- **Phase 3 — backend activation: CLOSED & approved (2026-08-19).** The data/auth/RLS layer is validated by direct API calls against the live REST + Auth endpoints. The browser-UX slice (in-app "Sign in", the one-time `localStorage`→server migration + owner-marker) is left for you to confirm at your leisure per `docs/phase-3.md` §5–§6 — not a blocker to closing, since the underlying code paths and data layer are verified.
- **Phase 4 (Production Hardening), user-approved — all milestones M0–M6 implemented & verified; awaiting final approval to close (2026-08-19).** See the dedicated section below. Ran one milestone at a time, stopping for approval between milestones; M6 (deployment readiness) is the final milestone and is complete pending this approval.
- **Still gated (separate track — needs explicit approval to start):** **Phase 3b** — connecting an actual licensed playback provider. The *architecture* is now in place and testable (section below), but **no provider is connected, referenced, or prepared for by name**, and none will be until you supply one that is genuinely licensed, with its own official documentation.

## Phase 4 — Production Hardening (M0–M6 done, awaiting final approval, 2026-08-19)

User-approved plan (`starry-skipping-dove`), executed **one milestone at a time**, stopping for approval between milestones. Scope is CLAUDE.md's enumerated 9 items — no invented requirements. Every change preserves the graceful-degradation invariant (blank env → mock + `localStorage`, every route 200) and leaves the gated `VIDEO_PROVIDER_*` seam untouched.

- **M0 — Testability refactors (behavior-preserving): ✅ DONE.** Extracted a pure, exported `mergeLibrary(local, server, { localIsOurs }): MergeResult` from `syncOnSignIn` in `src/lib/library.ts` — it returns `{ watchlist, progress, localOnlyWatch, localNewer }` so the one-time sign-in migration's two push-lists survive; `syncOnSignIn` keeps identical side-effects and order (`commit` → `setOwner` → `pushWatchlist("add")` per local-only item → `pushProgress` per local-newer entry). Added `export` to the pure `ensureVtt` in `src/lib/opensubtitles.ts` (no logic change) so the SRT→VTT normalizer is unit-testable. Verified: `npx tsc --noEmit` exit 0; clean `next build` (Compiled successfully, TypeScript passed, 7/7 static pages, all routes + `Proxy (Middleware)` unchanged). No behavior change.
- **M1 — Test infrastructure + unit tests (user-approved): ✅ DONE.** Added Vitest as dev-only tooling — `vitest` 3.2.7, `vite` 6.4.3, `vite-tsconfig-paths` 6.1.1, `jsdom` 30.0.1, all exact-pinned (matching the repo's no-caret convention). vitest was pinned to the **3.x** line and `vite` provided explicitly at **6.4.3** so the tree resolves against the existing `@types/node` 20.14.10 **without `--force`/`--legacy-peer-deps` and without bumping `@types/node`** (vitest 4 → vite 8 would have forced `@types/node` ≥ 20.19). New scripts: `test` (`vitest run`, CI-safe) + `test:watch` (`vitest`). New files: `vitest.config.mts` (`node` environment for these pure suites — jsdom stays installed for future per-file component tests; `@/*` via `vite-tsconfig-paths`; `server-only` aliased to `test/stubs/server-only.ts` so the server-only `opensubtitles.ts` is importable), `test/stubs/server-only.ts`, and `src/lib/__tests__/{utils,library,opensubtitles}.test.ts`. **23 tests, all green in ~1s:** `utils.ts` (id round-trip + malformed ids, `yearOf`, `formatRating`/`formatRuntime` boundaries, `clamp`, `placeholderArt` determinism), `mergeLibrary` (watchlist union-by-id, progress newest-`updatedAt`-wins incl. strict-`>` tie handling, the returned `localOnlyWatch`/`localNewer` push-lists, and `localIsOurs=false` → server-only), `progressKey` (movie vs episode), and `ensureVtt` (WEBVTT passthrough, SRT comma→dot, header inject, BOM strip, CRLF). **No production code changed.** Verified: `npm run test` exit 0; `npx tsc --noEmit` exit 0; clean `next build` (7/7 static pages, unchanged); `npm install` reported 0 vulnerabilities.
- **M2 — Environment validation: ✅ DONE.** Added `src/lib/env.ts` (`server-only`) exposing `getConfigStatus(): ConfigStatus` — a **read-only status report, not a config loader**. It **composes the four existing feature gates** (`isLiveMetadata`, `isSearchConfigured`, `isDownloadConfigured`, `isSupabaseConfigured`) so there stays one source of truth per toggle, plus **presence-only** booleans (via a local `isSet()`) for the four declared-but-unread optionals (`SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `VIDEO_PROVIDER_BASE`, `VIDEO_PROVIDER_KEY`). Secret-safe by construction: `server-only`, returns **booleans only** (never a key/token/password value), no logging, and the `VIDEO_PROVIDER_*` seam is reported for **presence only** — never read or wired, so the abstraction stays intact. Deliberately **does not relocate** the 9 feature `process.env` reads, and omits the TMDB base URLs (they're among those 9 and aren't exported — surfacing them would mean re-reading env or modifying `tmdb.ts`, both out of M2 scope). No dev-startup logging here — the summary/log belongs to M3's optional `instrumentation.ts`, where it's actually consumed. **No unit test added on purpose:** `env.ts` transitively imports `tmdb.ts`, which calls React's `cache()` at module load; importing that in Vitest (a non-Next context) would be a misleading canary, and M1 deliberately kept `tmdb.ts` out of unit scope — `env.ts` is only ever used server-side inside Next. Verified: `npx tsc --noEmit` exit 0; clean `next build` (7/7 static pages, all 15 routes + `Proxy (Middleware)` unchanged, `.env.local` still resolved → no `NEXT_PUBLIC_` inlining regression); grep confirms no `console.*` and every `process.env` read wrapped in `isSet(...)`. `getConfigStatus()` is pure/side-effect-free → blank env yields all-false with no throw path. **No production behavior changed** — `env.ts` is not imported anywhere yet (M3 wires it).
- **M3 — Startup config summary (the consumer of M2's `env.ts`): ✅ DONE.** Wired `getConfigStatus()` into a one-time, boolean-only startup log via the Next 16 `register` hook. New files: **`src/instrumentation.ts`** (Next 16 file convention — verified against `node_modules/next/dist/docs/.../instrumentation.md`; `register()` runs once per server instance before requests. Guarded to `process.env.NEXT_RUNTIME === "nodejs"` and dynamic-imports the `server-only` modules **inside** the guard so nothing enters the Edge bundle — the same discipline `src/proxy.ts` uses; wrapped in try/catch so a logging failure can never block boot, with a static, non-fatal `console.warn` fallback) and **`src/lib/config-summary.ts`** (pure, exported `formatConfigSummary(status: ConfigStatus): string[]`; the `ConfigStatus` import is **type-only**, so it does not drag `env.ts`→`tmdb.ts`'s module-load `cache()` into the Vitest runtime — the canary M2 flagged — and stays unit-testable in isolation). Added **`src/lib/__tests__/config-summary.test.ts`** (5 tests: all-on / all-off / mixed-state independence / line-count + determinism / and a no-leak assertion that raw `true`/`false` never reach the output). **Observability only — no application behavior changed**, and the `VIDEO_PROVIDER_*` seam stays presence-only (never read or wired). Secret-safe by construction: the only `process.env` read is the `NEXT_RUNTIME` guard, and the log emits booleans/labels only — never a key/token/password or any env value. Decisions: **dev-only logging** (user-chosen after review) — the summary logs via `console.info` **only when `NODE_ENV !== "production"`**, via an early return in `register()`, so a `next start` production server stays quiet. (Output is booleans-only so it would be prod-safe regardless; suppressing it in prod is a signal-to-noise choice.) `docs/deployment.md` was **deferred** to a later deployment-readiness milestone to keep M3 minimal. Verified: `npx tsc --noEmit` exit 0; `npm run test` exit 0 (**28 tests**, +5 new, all green in ~1s); clean `next build` (Compiled successfully, TypeScript passed, 7/7 static pages, all 15 routes + `Proxy (Middleware)` unchanged, `.env.local` resolved); and a two-phase smoke test proving the guard in both directions — **dev** (`next dev`, `NODE_ENV=development`): summary logged **exactly once** (`DEV_SUMMARY_COUNT=1`, correct boolean-only content reflecting `.env.local`); **prod** (`next start`, `NODE_ENV=production`): summary **suppressed** (`PROD_SUMMARY_COUNT=0`, `PROD_WARN_COUNT=0` — `register` ran and returned cleanly at the guard) — with `/`, `/login`, `/search?q=matrix` all HTTP 200 in both phases. (Harness note: an earlier smoke attempt reported a false `SUMMARY_COUNT=0` — a race where the grep fired on the `Ready` banner before Turbopack flushed the `register` output; the persisted dev log showed the summary present, and the corrected single-instance run confirmed it. Two orphaned dev servers from a Git Bash PID-namespace mis-kill were cleaned up via `taskkill /F /T`.)
- **M4 — Production error / loading / empty states: ✅ DONE.** Added streaming loading UI and a last-resort error boundary, then closed a status-code gap the loading UI introduced. **New files:** `src/app/loading.tsx` (the ROOT segment's Suspense fallback — kept deliberately **neutral**, a centered brand spinner, because Next reuses it for any child route lacking its own `loading.tsx`; a home-shaped skeleton would flash the wrong shape onto `/login`, `/search`, etc.); `src/components/detail/DetailSkeleton.tsx` (a content-shaped skeleton mirroring `<DetailContent>`, **composed entirely from the existing `Skeleton`/`RowSkeleton` primitives** — no new primitives); `src/app/movie/[id]/loading.tsx` + `src/app/tv/[id]/loading.tsx` (both just render `<DetailSkeleton />`, so the only tailored skeletons live on the two routes whose server-side `getMediaDetail()` fetch is slow enough to warrant one); and `src/app/global-error.tsx` (Next 16 `global-error` convention — the last-resort boundary for a crash in the **root layout** itself, which the segment-level `src/app/error.tsx` can't cover; per the Next docs it replaces the root layout so it renders its own `<html>`/`<body>` and, since global CSS/Tailwind is **not** loaded there, styles inline via the Reelhouse brand tokens; same `reset()` + `console.error` recovery contract as `error.tsx`). **Confirmed already production-quality → no rewrites** (honoring "don't rewrite working code"): `SearchClient` (idle+suggestions / loading `GridSkeleton` / error+retry / no-results / results), `/my-list` empty-watchlist state, `error.tsx`, and `not-found.tsx`. **Soft-404 finding + fix (user-chosen "Proxy numeric guard"):** adding the detail `loading.tsx` files introduces a Suspense boundary, so the response body begins streaming as HTTP 200 **before** the page's own `notFound()` runs — turning an invalid id into a "soft 404" (200 + `noindex`) instead of a real 404. Rather than silently accept the changed status, the finding was surfaced empirically and the fix chosen by the user: a cheap **synchronous** id-shape guard in `src/proxy.ts` (runs first, in both Supabase and local modes; **no network fetch**). A well-formed detail URL is `/movie/<digits>`/`/tv/<digits>`; a **malformed** id (`/movie/abc`, `/tv/xyz`, `/movie/12.5`) is rewritten to the app's `/_not-found` route with an explicit `status: 404` → a **real 404 + the branded not-found UI**, exactly as the Next guide recommends ("ensure the resource exists before the response body is streamed … run this check in proxy to rewrite missing slugs to a not-found route"; `.../file-conventions/loading.md#status-codes`). A **numeric-but-missing** id (`/movie/99999999`) is intentionally left to the page and **stays a soft 404** — matching the page's own `Number()`-based acceptance. The `rewrite(url, { status })` shape was verified against the installed `NextResponse` types (`MiddlewareResponseInit extends globalThis.ResponseInit`). **No secrets touched, `VIDEO_PROVIDER_*` seam untouched, graceful-degradation invariant preserved.** Verified: `npx tsc --noEmit` exit 0; `npm run test` exit 0 (28 tests, unchanged); clean `next build` (Compiled successfully, TypeScript passed, 7/7 static pages; `ƒ /_not-found` present as the rewrite target; `ƒ Proxy (Middleware)` present); **prod smoke** (`next start`) — `/movie/abc` → **404**, `/tv/xyz` → **404**, `/movie/12.5` → **404** (guard fires); `/movie/550` → 200, `/tv/1399` → 200 (numeric passes); `/movie/99999999` → 200 (soft-404 preserved); `/` → 200, `/login` → 200 (no sibling regression); `/no-such-route` → 404 (baseline unaffected); clean process shutdown (`PORT_FREE`), empty server stderr.
- **M5 — Security & reliability review + low-risk hardening: ✅ DONE.** A focused review of the security surface plus three additive, app-safe hardening changes; no behavior change on any success path. **(1) Dependency audit:** `npm audit` → **0 vulnerabilities** (the Next 16 upgrade already cleared the residual Next 14 advisories). **(2) Info-disclosure fix — genericized DB-error 500s:** the three Supabase-backed routes echoed the raw PostgREST/Postgres `error.message` on their DB-error branches (`watchlist` ×3, `history` ×4, `playback_events` ×1 = **8 branches**). That message can name tables/columns/constraints — internal schema detail, not a secret (no key/token/password is ever in it), but no reason to expose it. Added one shared **`dbErrorResponse(scope, error)`** helper in `src/lib/supabase/server.ts` that **logs the detail server-side** (`[api:<scope>] database error: …`) and **returns a generic `{ error: "Server error" }` (500)**; applied it to all 8 branches. Safe because the client consumes these routes **status-only** — verified in `src/lib/library.ts`: `fetchServerState()` reads only `res.status`/`res.ok` then `.items`/`.entries`, and every mutation push (`pushWatchlist`/`pushProgress`/`deleteProgressRemote`/`clearHistoryRemote`/`logPlaybackEvent`) is fire-and-forget and never inspects the response body. The other API routes need no change: `playback`/`search`/`subtitles/*` already return curated, non-echoing messages. **(3) Security response headers:** added `async headers()` to `next.config.mjs` on `source: "/:path*"` (all routes incl. `/api/*`) — `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `X-DNS-Prefetch-Control: on`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`. All additive and app-safe. **HSTS omits `preload`** on purpose (the preload-list submission is a standing commitment that should be an explicit deployment decision, not a framework default). **CSP is deliberately deferred to M6** — a strict policy for this app (TMDB/YouTube images, Supabase, inline styles) needs its own tested rollout. **(4) Secret-hygiene regression test:** new `src/lib/__tests__/secret-hygiene.test.ts` — a pure static scan of `src/` (skips `__tests__`) codifying two invariants M2/M3 checked by hand: (a) the only `NEXT_PUBLIC_*` tokens in source are the two allowlisted Supabase public values (any other would inline a value into the client bundle), and (b) no source line contains both `console.*` and `process.env` (never log a raw env var). Includes a "scanned >10 files" sanity guard so a broken path can't pass vacuously. **RLS/auth review (read-only, no change):** every Supabase query stays `auth.uid()`-scoped via the request-bound client; routes 401 when unconfigured or signed-out; secrets remain server-side (`server-only` on `env.ts`/`config-summary.ts`/`server.ts`/`opensubtitles.ts`); OpenSubtitles diagnostics stay hostname-only. `VIDEO_PROVIDER_*` seam untouched; graceful-degradation invariant preserved. **Verified:** `npx tsc --noEmit` exit 0; `npm run test` exit 0 (**31 tests**, +3 new secret-hygiene, all green in ~1s); clean `next build` (Compiled successfully, TypeScript passed, 7/7 static pages, all 15 routes + `ƒ /_not-found` + `ƒ Proxy (Middleware)`); **prod smoke** (`next start`) — all six security headers present on **both** an HTML (`/`) **and** an API (`/api/search`) response; status matrix `/`, `/search`, `/my-list`, `/login`, `/movie/550`, `/tv/1399` → 200, `/api/search` → 200, `/api/watchlist` → 401 (no auth cookie); **M4 guard intact** — `/movie/abc`, `/tv/xyz` → 404, `/movie/99999999` → 200 (soft-404 preserved); clean shutdown (`PORT_FREE`). Smoke ran in Supabase-configured mode; M5's changes are env-independent (static headers + error-branch-only body change), so the blank-env graceful-degradation invariant (validated in M0/M1) is unaffected.
- **M6 — Deployment readiness & final Phase 4 hardening: ✅ DONE.** The last Phase 4 milestone: the four items deferred here from earlier milestones, shipped as deployment infrastructure + docs with no change to any application success path. **(1) Content-Security-Policy — shipped REPORT-ONLY (user-chosen posture).** Added a full CSP to `next.config.mjs` `headers()` under the key **`Content-Security-Policy-Report-Only`**, so the browser *reports* violations to the console but **never blocks** — the zero-risk way to land a policy that a headless build cannot validate (CSP violations are only observable in a real browser). Policy, built from verified codebase facts (no external/inline app scripts beyond styles, no web fonts, no iframes; browser reaches only TMDB/YouTube image hosts and Supabase REST+Auth+realtime): `default-src 'self'` · `script-src 'self' 'unsafe-inline'` (**+ `'unsafe-eval'` in dev only** — React's dev error overlay needs it; a prod smoke confirmed it is **absent** when `NODE_ENV=production`) · `style-src 'self' 'unsafe-inline'` · `img-src 'self' data: blob: https://image.tmdb.org https://img.youtube.com` · `font-src 'self'` · `connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co` · `media-src 'self' blob:` · `object-src 'none'` · `base-uri 'self'` · `form-action 'self'` · `frame-ancestors 'none'` · `upgrade-insecure-requests`. **Enforce path is a documented one-line flip** (rename the header key to `Content-Security-Policy` after confirming a clean browser console); the stricter nonce-based alternative and its dynamic-rendering trade-off are documented too (`docs/deployment.md` §5). **(2) CI workflow:** new **`.github/workflows/ci.yml`** — GitHub Actions on `push`→`main` + every `pull_request`, `concurrency` cancel-in-progress, one `verify` job on `ubuntu-latest` (Node 20, npm cache) running `npm ci` → `npx tsc --noEmit` → `npm run test` → `npm run build`. The build runs with **no secrets**, so CI exercises the graceful-degradation path (a fresh clone must always build clean). Validated as well-formed YAML via a `yaml`-lib parse (job/step structure confirmed). Inert until the repo is pushed to a GitHub remote (no VCS in this workspace yet). **(3) `docs/deployment.md`:** new 8-section deployment guide — prerequisites, full env-var table (with the graceful-degradation note and the "never `NEXT_PUBLIC_` the service-role key" rule), build/run commands, Supabase setup (apply `0001_init.sql` + set the two `NEXT_PUBLIC_` vars), the security-headers/CSP reference (all six M5 headers, the HSTS-`preload`-omission rationale, the Report-Only policy + enforce flip + nonce alternative + self-hosted-Supabase origin note), a release checklist, and the manual browser-verification runbook. **(4) Production-build finalization:** clean `next build` on the full M4+M5+M6 surface. **(5) Browser-driven verification is delivered as a runbook, NOT executed** (`docs/deployment.md` §7, cross-referencing `docs/phase-3.md` §5–§6): in-app sign-in, cross-reload persistence, the one-time `localStorage`→Supabase migration + owner-marker (import-once / no cross-account bleed), RLS isolation with a second account, and sign-out→local-mode — the flows that genuinely require a human in a browser and cannot be driven headless. The data/auth/RLS layer underneath them is already validated by direct API calls (Phase 3). **No secrets touched; `VIDEO_PROVIDER_*` seam untouched (still presence-only, never read/wired); graceful-degradation invariant preserved** (M6 changes are static config + docs + CI, env-independent). **Verified:** `npx tsc --noEmit` exit 0; `npm run test` exit 0 (**31 tests**, unchanged, all green); clean `next build` (Compiled successfully, TypeScript passed, all 15 routes + `ƒ /_not-found` + `ƒ Proxy (Middleware)`, `next.config.mjs` loaded); `ci.yml` parses as valid YAML; **prod smoke** (`next start`) — `Content-Security-Policy-Report-Only` present on **both** an HTML (`/`) **and** an API (`/api/watchlist`) response with the full policy, and `script-src` correctly **omits `'unsafe-eval'` in production**; all six M5 headers still present; status matrix `/`, `/search`, `/my-list`, `/login`, `/movie/550`, `/tv/1399`, `/api/search` → 200, `/api/watchlist` → 401; **M4 guard intact** — `/movie/abc`, `/tv/xyz` → 404, `/movie/99999999` → 200 (soft-404 preserved); clean shutdown (`PORT_FREE`). **This closes Phase 4 — Production Hardening.** No further phase begins without explicit approval; the gated **Phase 3b ( playback provider)** remains untouched.

## Provider-agnostic playback architecture (2026-08-19, user-approved milestone)

**What this is:** the surrounding playback experience, rebuilt so that up to five future **licensed** providers can be activated by configuration alone. **Nothing is connected.** All five slots ship unconfigured and disabled; with a blank env the app selects the existing custom player and behaves exactly as it did before this milestone (verified below). No provider is named, referenced, modelled on, or scaffolded for — a future provider must be genuinely licensed and integrated from its own official documentation.

**Approved decisions honored:** (D1) the existing custom `VideoPlayer` and every `src/components/player/*` file are **unchanged** — kept as the native built-in surface, not the target architecture; (D2) exactly five generic slots `VIDEO_PROVIDER_1_*` … `VIDEO_PROVIDER_5_*`, with legacy `VIDEO_PROVIDER_BASE`/`KEY` kept for compatibility and **no** api-key/auth variables invented.

**Architecture**

- **Two surfaces.** `native` = Reelhouse's own custom player, serving the bundled Creative-Commons clip. `embed` = the provider hosts its **own complete player UI** inside the container; Reelhouse deliberately does **not** reproduce play/pause, seek, volume, quality, fullscreen, subtitles or PiP on that surface — only back, title, provider picker, episodes, loading, and error/fallback.
- **Provider Manager** (`src/lib/playback/manager.ts`) — pure, no I/O, no env, no React: ordering, what is playable, what to start on, what to fall back to, and URL-template expansion. All of it unit-tested.
- **Five-slot registry** (`src/lib/playback/registry.ts`, `server-only`) — reads eight vars per slot (`NAME`, `ENABLED`, `PRIORITY`, `MOVIE_URL`, `TV_URL`, `MEDIA_TYPES`, `REPORTS_PROGRESS`, `REPORTS_FAILURE`). Templates are validated before they can reach a frame `src`: `https://`, a same-origin `/path`, or `http://localhost` in dev only — `javascript:`, `data:` and protocol-relative `//host` are rejected and reported in the picker as a config error rather than loaded.
- **Capabilities default to FALSE.** `REPORTS_PROGRESS` off → **no** progress is recorded for that provider (a position is never invented). `REPORTS_FAILURE` off → **automatic fallback is off for that provider**; a failure surfaces as retry/switch instead. This is the single most important rule: a loaded-but-blank embed is indistinguishable from a working one, so silent switching would be guesswork.
- **Priority:** lower wins; slot default `N × 10`; Reelhouse's own built-in player surface sits at `10000`, so **any** configured slot outranks it automatically with no other change.
- **Progress is provider-independent** (`src/lib/playback/progress.ts`) — one throttled sink keyed by **media/episode, never by provider**, writing through the **unmodified** `library.ts` (localStorage + Supabase). Switching provider cannot reset the title, season, episode, saved position, or history. The native surface keeps persisting progress inside the existing player (documented exception, so today's behavior is unchanged).
- **Event translation** (`src/lib/playback/adapters.ts`) — a per-provider adapter turns a documented message payload into normalized `ready`/`progress`/`ended`/`failure` signals. **No adapter exists for any of the five slots**, because no provider documentation has been supplied; such a slot's messages are ignored entirely rather than guessed at. Embed messages are accepted only from the frame's own origin **and** that frame's window.
- **Season/episode survive a switch** without touching any player file: the custom player already rewrites `?s`/`?e`, so the URL is the shared source of truth.

**Testable with nothing connected.** Two things make that possible, and neither is a provider:

- **Reelhouse's own built-in player surface** (`src/lib/playback/builtin.ts`, id `reelhouse-player`, priority `10000`, `isBuiltIn: true`) — the existing custom player, used whenever no configured slot can serve the request. It is a `PlaybackCandidate` only: it never enters `plan.providers`, and `manager#switchableCandidates()` keeps it out of both manual switching and automatic fallback. It is the floor under the provider layer, not an alternative to it, so it is never listed in the provider picker.
- **A local embed test fixture** at `public/media/mock-embed/player.html` — a same-origin page with its own player UI and a documented `postMessage` contract (`ready`/`timeupdate`/`ended`/`error`), plus a `fail=1` switch that reports a failure right after load. It is **not registered as a provider**: you point a spare slot's `_MOVIE_URL`/`_TV_URL` at it when you want to exercise the embed surface, progress, the error state or controlled fallback, then unset the slot (runbook: `docs/video-provider-setup.md` §14). The file lives under `public/media/`, already excluded by the `src/proxy.ts` matcher, so it needs no route and no CSP change.

With a blank provider env there is therefore **nothing in the picker at all** (the control is not rendered) and playback runs on the built-in surface exactly as it did before this milestone.

**Files added:** `src/lib/playback/{types,manager,registry,builtin,progress,adapters}.ts` · `src/components/playback/{PlaybackContainer,EmbedSurface,ProviderSelector,PlaybackStates}.tsx` · `public/media/mock-embed/player.html` · `src/lib/__tests__/{playback-manager,playback-progress}.test.ts` · **`docs/video-provider-setup.md`** (the self-service activation guide: where each value goes, how TMDB ids and season/episode map, enable/disable, priority, how to test a movie / a TV episode / switching / automatic fallback, and a troubleshooting list keyed to the exact messages the UI shows).

**Files modified:** `src/lib/providers.ts` (existing `VideoProvider`/`SampleClipProvider`/`getPlaybackServers`/`getPlaybackSource` untouched — a `getPlaybackPlan()` was **appended**) · `src/app/watch/[type]/[id]/page.tsx` (renders `PlaybackContainer` with a plan; params/`?s`/`?e`/`?t` handling unchanged) · `src/lib/env.ts` + `src/lib/config-summary.ts` + its test (one **counts-only** line: how many slots are configured/enabled — never a name, URL or template) · `.env.local.example` (the five slot groups, commented out).

**Deliberately untouched:** `src/components/player/*` · `src/lib/library.ts` · the Supabase routes, RLS and migrations · `src/proxy.ts` · `next.config.mjs`.

**Beyond the approved file list (2 files, flagged):** `src/lib/playback/adapters.ts` (message translation had to live somewhere other than the component, so the security rule — ignore anything undocumented — is testable and not buried in JSX) and `src/lib/__tests__/playback-progress.test.ts` (the progress rules deserved their own suite). Both are additive.

**Verified**

- `npx tsc --noEmit` → exit 0.
- `npm run test` → exit 0, **86 tests** (was 31; +42 provider-manager, +13 progress). Covers registration, priority ordering, enable/disable, manual switching, fallback **only** when the failing provider declares a failure signal, **no** fallback when it does not, no fallback looping, movie/TV configuration, template expansion + rejection of unsafe templates, and the five-slot env matrix (unconfigured, configured, half-configured, narrowed by `MEDIA_TYPES`, bad URL, blank/whitespace, non-numeric priority).
- `npm run build` → clean (Compiled successfully, TypeScript passed, 7/7 static pages, all 15 routes + `ƒ Proxy (Middleware)`).
- **Dev smoke, blank provider env (no `VIDEO_PROVIDER_*_*` set):** `/watch/movie/550` → 200 rendering the **native** surface (`<video src="/media/big-buck-bunny.mp4">`) with **zero `<iframe>`** — i.e. behavior identical to before; the provider picker is **not rendered at all** (no slot configured, and the built-in surface is never listed as a provider); `/watch/tv/1399?s=2&e=5` → 200 with the episode context intact; the embed test fixture → 200 from `public/media/`; the string `VIDEO_PROVIDER` appears **0 times** in either page's HTML (no slot config leaks to the browser); CSP still ships **Report-Only**, unchanged.
- **Not executed (needs a real browser):** the embed iframe + `postMessage` round-trip, the automatic-fallback walkthrough, and progress writes from an embed provider. Runbook: `docs/video-provider-setup.md` §11–§14.

## UI redesign — dark cinematic pass (2026-08-20, user-approved)

**What this is:** a full visual pass over every user-facing surface against a supplied dark-cinematic reference (black/charcoal ground, glass/translucent surfaces, warm gold accent, restrained borders and shadows), plus the four behavioural features the brief asked for: type-scoped browse routes, a filter bar, an account menu, and a provider picker that lists only real configured providers. **Nothing else changed** — no playback logic, no Supabase/auth logic, no TMDB integration, no API contract, and no provider architecture.

**One design system, no second one.** `src/app/globals.css` owns the tokens (already mapped in `tailwind.config.ts`, which was **not** touched) and every shared class: layout (`container-rh`, `row-scroll`), surfaces (`glass`, `panel`, `panel-label`, `menu-item`, `menu-divider`), controls (`btn`/`btn-primary`/`btn-ghost`, `chip`, `pill`/`pill-active`, `icon-btn`, `field`), media frames (`poster-frame` 2:3, `still-frame` 16:9, `frame-img`), utilities (`no-scrollbar`, `text-balance`, `mask-fade-b`). **No UI framework was added**, and no component invents its own radius, spacing or accent.

**Sections delivered**

- **Provider picker rewritten** (`src/components/playback/ProviderSelector.tsx`). Compact trigger — source icon + the provider's own configured display name + chevron — opening a `panel` popover with a "Provider" label, one row per provider (name + "Provider's own player"), a gold-tinted active row with a check, and disabled rows that state the configured reason. **It lists exactly the operator's configured slots and nothing else:** no counts are shown anywhere (so "5 available" cannot appear with 2 configured), unconfigured slots are omitted upstream in `getPlaybackPlan()`, internal ids (`provider-1` …) and `VIDEO_PROVIDER_*` names are never rendered, and every label comes from the registry — nothing is hardcoded. With no slot configured the component returns `null`, so the control does not exist rather than showing an empty menu. There is **no "Playback settings" entry**, because no such feature exists.
- **Every demo/placeholder provider is gone** from both the UI and the plan. `getPlaybackPlan()` now skips an untouched slot entirely (`src/lib/providers.ts`), Reelhouse's own built-in surface is filtered out of the listing twice (never pushed into `plan.providers`; also filtered in the component), and the local embed test fixture is **not registered as a provider** — it is a URL you can point a spare slot at. The five-slot architecture, registry, manager, priority, fallback, embed surface, template handling and provider-independent progress are all **unchanged**.
- **No "Demo" wording ships to the browser** from Reelhouse's own code. The sample-clip constants, the `isSample` flag on `VideoSource`, the two bundled subtitle fixtures (`public/media/subtitles/sample-{en,es}.vtt`) and the on-player badge ("Licensed sample") were all reworded; internal comments and docs were kept (and corrected), and the **legal/authorization messaging was deliberately retained** — the badge, the footer authorization line, and the bundled-source note are project requirements, not demo language.
- **Home + hero** (`src/components/hero/Hero.tsx`, `src/app/page.tsx`): the featured title, backdrop, rating, year, genres, description, Play / More Info / My List all kept, with a reworked type scale, a readable backdrop gradient, aligned button heights and no awkward cropping at any width.
- **Poster cropping fixed** (the reported top-cut on series posters): every image now sits in a fixed-ratio frame (`poster-frame` / `still-frame`) with `frame-img` (`absolute inset-0 object-cover object-center`), so cards share one ratio and nothing is distorted — applied across `MediaCard`, `MediaRow`, `ContinueWatching`, `BrowseView`, `CastRow`, `EpisodeList`, `DetailHero`.
- **Navbar** (`src/components/navigation/Navbar.tsx`): translucent glass with backdrop blur, a hairline border, and a scroll-driven transition so it reads over the hero. Logo · Home · Movies · TV Shows · My List · search · account. Below `sm` it becomes two tiers with a scrollable link row and a search takeover.
- **Account menu** (`src/components/auth/AuthStatus.tsx`): the trigger is avatar + display name + chevron — **the address never appears in the navbar**; it is inside the menu, one deliberate click away. Falls back to the neutral label "Account" when the account has no name. The menu contains only destinations that exist: My List, Watch History, Sign out. **No Profile or Settings entry**, because Reelhouse has neither page — no backend functionality was invented. Renders nothing at all when Supabase is unconfigured, so local mode still looks like Phase 1.
- **Search** (`src/components/search/SearchClient.tsx` + the navbar field): rounded glass field with a leading icon, gold focus ring via `field`, and an icon-triggered takeover on small screens. The search API is unchanged.
- **Type-scoped routes** (`/movies`, `/tv-shows`, `/browse`): `/movies` returns movies only, `/tv-shows` series only, and Home / My List are untouched. All three render the same `BrowseView` over the existing TMDB layer.
- **Filter bar** (`src/components/browse/FilterBar.tsx` over the pure model in `src/lib/browse.ts`): "Browse" + type pills (All / Movies / TV Shows, which navigate between the three routes) + Genre / Year / Sort dropdowns + "Clear filters" (shown only when something is actually narrowing). Sort is Popularity / Latest / Rating / Oldest — **every option maps to something the metadata source can genuinely do**; nothing is offered that cannot be applied. One URL contract (`?type=&genre=&year=&sort=&page=`), pinned type on the two scoped routes, and paging reset on any filter change. Horizontal bar on `md+`, one compact sheet below.
- **Cards** (`src/components/media/MediaCard.tsx`): one poster ratio, subtle border and radius, rating badge, content-type badge, restrained hover lift/glow, title + year — and nothing more.
- **Footer** (`src/components/common/Footer.tsx`): Reelhouse + a one-line description, then Browse (Movies, TV Shows, All Titles, New Releases, Top Rated) and My Stuff (My List, Watch History, Continue Watching, Search). **Every link resolves to a real route** — the Support column and the social icons were left out rather than shipped as dead links, and there are no social destinations to point at.
- **Responsive** at desktop / laptop / tablet / mobile: navbar, search, account menu, provider picker, filter bar, hero, grids and footer all reflow, and nothing overflows horizontally (the provider trigger is `max-w-[70vw]`, its panel `max-w-[86vw]`, the account menu and filter sheets clamp to `calc(100vw - …)`, and the pill strips scroll inside `no-scrollbar`).
- **Accessibility:** popovers share one behaviour module (`src/lib/use-popover.ts`) — outside-click and Escape close, focus returns to the trigger, and arrow keys rove within `listbox`/`menu` roles with correct `aria-haspopup`/`aria-expanded`/`aria-selected`. Focus rings are visible against the dark ground on every control.

**Files added:** `src/lib/browse.ts` · `src/lib/use-popover.ts` · `src/components/browse/{BrowseView,FilterBar}.tsx` · `src/app/{browse,movies,tv-shows}/page.tsx` · `src/lib/__tests__/browse.test.ts`.

**Files modified:** `src/app/globals.css` · `src/app/{layout,page}.tsx` · `src/app/{login,my-list}/page.tsx` · `src/app/watch/[type]/[id]/page.tsx` · `src/components/navigation/Navbar.tsx` · `src/components/auth/{AuthStatus,LoginForm}.tsx` · `src/components/common/Footer.tsx` · `src/components/hero/Hero.tsx` · `src/components/media/{MediaCard,MediaRow,ContinueWatching}.tsx` · `src/components/detail/{DetailHero,EpisodeList,CastRow}.tsx` · `src/components/search/SearchClient.tsx` · `src/components/playback/{ProviderSelector,PlaybackContainer,EmbedSurface}.tsx` · `src/lib/playback/{registry,builtin,manager,types,adapters}.ts` · `src/lib/{providers,tmdb}.ts` · `src/types/index.ts` · `src/components/player/{VideoPlayer,QualityPanel,ServerPanel}.tsx` · `public/media/mock-embed/player.html` · the two subtitle fixtures (renamed) · `docs/video-provider-setup.md` · `README.md` · this file.

**Deliberately untouched:** `tailwind.config.ts` · `src/lib/library.ts` · the Supabase clients, routes, RLS and migrations · `src/proxy.ts` · `next.config.mjs` · `src/lib/{mock,utils,opensubtitles,env,config-summary}.ts` · the API route handlers · the player's own controls, timeline, settings, subtitle and episode panels.

**One flagged deviation from D1:** `src/components/player/VideoPlayer.tsx` was frozen by decision D1, and three tokens in it changed — the `isDemo`→`isSample` flag and the badge text. Justified because that flag is serialized into the browser payload and gates the visible badge, so the wording could not be corrected anywhere else; it is a pure rename with no behavioural change. `QualityPanel`/`ServerPanel` were touched only for the demo-provider removal.

**Verified**

- `npx tsc --noEmit` → exit 0.
- `npm run test` → exit 0, **109 tests across 8 files** (was 86; +18 for the browse filter model, +5 for the provider-listing rules), all green.
- `npm run build` → clean (Compiled successfully, TypeScript passed, 10/10 static pages, 18 routes + `ƒ Proxy (Middleware)`).
- **Dev smoke, 12 routes, all HTTP 200**, with per-page assertions: `/movies` → 20 movie links / **0** TV links; `/tv-shows` → **0** / 20; `/browse` → 20 / 20 (strict type separation). Filter markers present, "Clear filters" appearing **only** when a filter is active. Poster/still frame classes present in the expected counts (`/movie/550` → 14 × `poster-frame`+`frame-img`; `/tv/1399` → 10 × `still-frame`). Navbar/account markers present, the address absent from navbar markup. `VIDEO_PROVIDER` → **0 occurrences** and `provider-1` → **0** on every page. Case-insensitive "demo" → **0** hits from Reelhouse's own code (the remaining matches are TMDB titles such as *Demon Slayer*).
- **Blank provider env:** `/watch/movie/550` and `/watch/tv/1399?s=2&e=5` render the native surface (`<video>`), `<iframe>` count 0, and the provider picker is **not rendered at all**.
- **Provider picker with slots configured** — verified by injecting two temporary slots into a dev server's **process env only** (`.env.local` never written): the startup summary reported "2 of 5 enabled (2 configured)", the picker rendered with both configured display names, the embed surface received the correct template expansion for a movie (`…?type=movie&id=550`) and for a TV episode (`…?type=tv&id=1399&season=2&episode=5`), `<video>` count 0 (the provider's own player took over), no count text, and `VIDEO_PROVIDER` still absent from the HTML. Slots were removed afterwards; the shipped state is still **0 of 5**.
- **Not executed (needs a real browser):** hover/scale transitions, the account-menu open + sign-out round trip (needs an auth cookie), My List add/remove, real-device responsive checks, and the embed `postMessage`/automatic-fallback walkthrough. Runbooks: `docs/phase-3.md` §5–§6 and `docs/video-provider-setup.md` §11–§14.

## Playback/history bugfix — a partly-watched title went missing (2026-08-20)

**Reported:** start a movie or TV episode, watch a while, then stop or leave the watch page before finishing → the title does **not** appear in Watch History / Continue Watching.

**Root cause — nothing wrote a history entry when playback *started*.** The library store had exactly two writers, and neither one fires at the moment a viewer presses play:

1. `VideoPlayer.persist()` — reached first at the **first `timeupdate`**, throttled to one save per 5 s (`SAVE_INTERVAL_MS`).
2. `createProgressRecorder().write()` — fires **only on a provider progress report**, and `createProgressRecorder({ enabled: false })` returns an all-no-op recorder, which is exactly how a provider **without documented progress events** is handled (`src/lib/playback/progress.ts`, unchanged).

Confirmed by driving the real player in jsdom rather than by inference — the store was empty after mount, after `loadedmetadata`, and after `play`; the first row appeared only at the first `timeupdate` (`position ≈ 0.25 s`), and leaving at 8.4 s still stored 6.20 s. Three distinct defects fell out of that trace:

- **(A) Provider/embed surfaces recorded nothing, ever.** With a provider that documents no progress events there were zero writes, so the title never entered history on *any* provider surface — the reported behaviour is provider-independent, and so is the fix.
- **(B) Even on the built-in surface, the first write landed at ~0.25 s**, and `useContinueWatching` filtered `position > 5`. A title started and stopped early was therefore recorded but **invisible** in Continue Watching.
- **(C) Leaving the page did not save the position reached.** React detaches `videoRef.current` on unmount **before** the passive-effect cleanup runs, so the cleanup's `persist()` read a null element and returned early; SPA navigation also never fires `pagehide`/`visibilitychange`. With the two bundled 10-second sample clips this repeatedly left the stored position at ≤ 5 s (hidden by (B)) or already `completed`.

**Not the cause — ruled out with evidence, so no change was made:** the schema and RLS (`supabase/migrations/0001_init.sql` — `episode_key` *is* a generated stored column with a matching `unique (user_id, media_id, episode_key)`, so the upsert's `onConflict` target is valid; `duration_seconds` is nullable); `syncOnSignOut()` wiping local state (guarded by `syncedUser.current !== null` in `LibrarySync.tsx`); `mergeLibrary` letting an empty server erase local history (local-newer always wins); the read side filtering history (`useHistory()` is unfiltered); `/my-list` not rendering `HistoryList`, or the home page dropping `<ContinueWatching />` (both render). `src/lib/playback/progress.ts`, the provider registry/manager, the migrations and RLS are all **untouched**.

**The fix (smallest correct change, 6 files)**

- **`src/lib/library.ts`** — new **`markPlaybackStarted({ media, episode })`**: idempotent, records the title/episode *before* any position or duration is known (`position: 0`, `duration: 0` = "length not reported yet"), preserves an existing entry's position/`completed` and only bumps `updatedAt`, and pushes to the server when signed in. Also relaxed `useContinueWatching`'s `position > 5` gate to `!completed` — that threshold was hiding genuinely-started titles.
- **`src/components/player/VideoPlayer.tsx`** — `onPlay` now calls `markPlaybackStarted(...)` (a real play event, so no event is invented); added a `durationRef` fed by `loadedmetadata`/`durationchange`; `persist()` now falls back to `durationRef`/`currentTimeRef` when the element is already detached, which is what makes the leave-the-page save land. The player's own controls, timeline, settings, subtitle and episode panels are untouched.
- **`src/components/playback/PlaybackContainer.tsx`** — marks the start for `surfaceKind === "embed"`, the one thing Reelhouse knows for certain about an external surface (the title was handed to a provider's player). **No provider progress event is assumed or invented** — a position still arrives only from a provider that documents one. `surfaceKind` joined the effect deps because a progress-less embed provider yields the same `recordEnabled: false` as the native surface, so the effect would otherwise not re-run on a native→embed switch.
- **`src/app/api/history/route.ts`** — POST validation rejected any entry with `duration <= 0`, i.e. every start marker. Now it validates finite, non-negative `position`/`duration` and stores `duration_seconds: entry.duration > 0 ? entry.duration : null`; GET already maps `NULL → 0`, so a start entry round-trips exactly. **No migration or RLS change** — `duration_seconds` was already nullable.
- **`src/app/my-list/page.tsx`** and **`src/components/media/ContinueWatching.tsx`** — divide-by-zero guards for the new `duration: 0` state (`pct` → 0), and Watch History labels such an entry **"Started"** instead of "NaN% watched".

**Regression tests — 14 new, and each was confirmed to fail against the old behaviour**

- **`src/lib/__tests__/library-history.test.ts`** (9 tests, jsdom): movie started → stopped midway; TV episode started → stopped midway (asserts the key `tv-1399:s2e5` plus `media.tmdbId`, season and episode); two episodes of one show stay separate entries; a repeat start never rewinds a saved position; a **completed title stays completed** and out of Continue Watching when re-started (no resurrection); a finished title is still in Watch History; **provider switching produces exactly one entry**, not a duplicate; Continue Watching ordering; and the signed-in leg — with `fetch` stubbed, both the start marker (`position: 0, duration: 0`) and the later progress reach `POST /api/history`.
- **`src/components/player/__tests__/video-player-history.test.ts`** (5 tests, jsdom + `createElement`, media-element stubs on `HTMLMediaElement.prototype`): **this is the verification of the real write path** — pressing play records the title before any progress event; leaving mid-title saves the position actually reached (12 s saved → 180 s reached inside the throttle window → 180 s stored on unmount); pause saves without waiting for the throttle; a finished title is `completed` and the unmount flush does not undo it; and a TV episode records with the right season/episode/TMDB id while touching no sibling episode.
- **Negative control:** with the two player-side fixes temporarily reverted, 3 of the 5 player tests failed with exactly the reported symptom (`expected undefined to be defined` for the start marker, and **`position: 12` instead of `180`** for the leave-the-page save). Both fixes were restored and the suite re-run green.

**Verified**

- `npx tsc --noEmit` → exit 0.
- `npm run test` → exit 0, **123 tests across 10 files** (was 109; +14), all green.
- `npm run build` → clean (Compiled successfully, TypeScript passed, 10/10 static pages, 18 routes + `ƒ Proxy (Middleware)`).
- **Not executed (needs a real browser):** the signed-in round trip against live Supabase (the client→`/api/history` leg is asserted with a stubbed `fetch`; the server leg's schema/RLS path was already validated in Phase 3), and progress writes from a real embed provider.

**Observed, deliberately not changed (out of scope — no invented requirements):** the first-load resume gate `start > 5 && start < v.duration - 15` can never fire for the two bundled **10-second** sample clips, so a restored position is not visibly resumed with sample content; and `useLibraryActions()` was left as-is (it does not expose `markPlaybackStarted`, and nothing needs it to).

## Password reset — "Forgot password?" (2026-08-20)

**Asked for:** a complete forgot-password / reset flow on top of the *existing* Supabase auth, without replacing or redesigning it.

**What shipped (5 new files, 1 component edited)**

- **`src/components/auth/LoginForm.tsx`** — a **"Forgot password?"** link directly below the password field (sign-in mode only; it means nothing while creating an account). Everything else about the form is untouched: same sign-in/sign-up calls, same validation order, same messages, same styling. The one internal change is that the min-length check now comes from the shared helper below instead of an inline `password.length < 8`, so the rule has one home — the message and the field hint are byte-identical to before.
- **`src/lib/auth.ts`** (new, pure, client-safe) — `MIN_PASSWORD_LENGTH = 8`, `PASSWORD_HINT`, `passwordRuleError()`, and `safeRedirectPath()`. **No new password rule was invented:** the reset screen enforces exactly the min-8 rule sign-up has always used.
- **`src/app/forgot-password/page.tsx`** + **`src/components/auth/ForgotPasswordForm.tsx`** — email field → `supabase.auth.resetPasswordForEmail()` on the **existing browser client**, with loading / validation / error / success states in the same card shell and glass-dark styling as `/login`.
- **`src/app/reset-password/page.tsx`** + **`src/components/auth/ResetPasswordForm.tsx`** — new password + confirm, a single **Show/Hide** toggle for both fields (a text button in the existing accent-link style — the icon set has no eye glyph and the login form has no such control, so nothing new was invented visually), and four states: *checking the link* → *ready* / *link expired* / *done*. It updates via `supabase.auth.updateUser({ password })` on the **recovery session**.
- **`src/app/auth/callback/route.ts`** — the project's first auth callback. It reuses `createClient()` from `@/lib/supabase/server`, so there is still exactly **one** auth client and one session mechanism.

**Why the exchange happens server-side.** Both Supabase clients in this project default to `flowType: "pkce"` (verified in `node_modules/@supabase/ssr/dist/main/{createBrowserClient,createServerClient}.js`), and `@supabase/ssr` stores the PKCE verifier in a **cookie** — so the emailed `?code=` can be redeemed in a Route Handler, where `cookies().set` is legal (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`). The callback also accepts `?token_hash=…&type=recovery` via `verifyOtp`, which is the shape that works when the link is opened on a **different device** than the one that requested it. `src/proxy.ts` needed no change — its matcher already covers `/auth/callback` and both new pages.

**Security properties, deliberately**

- **No enumeration.** `resetPasswordForEmail` answers identically for a known and an unknown address, and so does the UI: the same "if this address has an account, a link is on its way" panel either way. Nothing branches on existence, and the only errors surfaced are account-neutral (send-rate limit → "too many requests"; anything else → a generic failure).
- **No password in a URL, a log, or storage.** The password exists only in component state and the one `updateUser` request body. Nothing is logged anywhere in the flow.
- **No custom token system, nothing in `localStorage`.** Supabase's own recovery credential and session cookie do all the work.
- **Open-redirect guard.** `next=` is sanitised by `safeRedirectPath()`: relative same-origin paths only — an absolute URL, `//host`, the `/\host` variant, and any control character (CRLF header-injection shapes) all fall back. A failed link redirects with a **fixed** `?error=link_invalid` code, never Supabase's raw error text and never anything the visitor typed.
- **RLS/auth architecture unchanged.** No migration, no policy, no service-role key, no second client, no new env var (`redirectTo` is derived from `window.location.origin`, so dev and production are each correct without one).
- `/reset-password` deliberately does **not** copy `/login`'s "already signed in → redirect home" guard: a recovery session *is* a signed-in session, so that guard would bounce every visitor out of the flow.

**Two dashboard settings this code cannot set for you** (Supabase → Authentication → URL Configuration):

1. **Redirect URLs allow-list** must include your callback: `http://localhost:3000/auth/callback` for dev and `https://<your-domain>/auth/callback` for production (a wildcard such as `https://<your-domain>/**` also covers it). Without it Supabase ignores `redirectTo` and falls back to the Site URL.
2. **Optional, for cross-device resets:** the default recovery template (`{{ .ConfirmationURL }}`) produces a PKCE `?code=` link, which must be opened **in the same browser** that requested it. Switching the template to `{{ .SiteURL }}/auth/callback?next=/reset-password&token_hash={{ .TokenHash }}&type=recovery` makes a link work from any device. The callback handles **both** shapes, so this is a preference, not a code change.

**Verified**

- `npx tsc --noEmit` → exit 0.
- `npm run test` → exit 0, **131 tests across 11 files** (was 123; +8 in `src/lib/__tests__/auth.test.ts` covering the password rule at its boundary and `safeRedirectPath` against `https://evil.example`, `//evil.example`, `/\evil.example`, `javascript:`, a bare relative segment, and CRLF injection).
- `npm run build` → clean (Compiled successfully, TypeScript passed, 13/13 pages, with `/auth/callback`, `/forgot-password`, `/reset-password` registered and `ƒ Proxy (Middleware)` unchanged).
- **Prod smoke** (`next start`): `/login` serves the `href="/forgot-password"` link; `/forgot-password` → 200 with its form, and `?error=link_invalid` renders "That reset link is invalid or has expired."; `/reset-password` → 200. Callback matrix — no credential → `/login?error=link_invalid`; `next=/reset-password` with no credential, with Supabase's own `error`/`error_description` params, with a bogus `code`, and with a bogus `token_hash` → all `/forgot-password?error=link_invalid`; `next=https://evil.example/` and `next=//evil.example/` → both dropped to the local page (**no open redirect**).
- **Not executed (needs a real inbox):** the happy path end-to-end — receiving the mail, redeeming the link into a recovery session, saving the new password, then signing in with the new one and confirming the old one fails. That is your manual checklist; the two dashboard settings above are its prerequisites.

**Out of scope, untouched:** playback, the provider registry/manager/picker, the player, the library store, every API route, all migrations and RLS.

## Mobile interaction audit (2026-08-20)

**Asked for:** a complete mobile interaction audit — every interactive element in
the app, not only the three controls reported dead on a real Android device
(Search, Sign In, provider selector) — with the root cause identified *before* any
code changed, one shared fix rather than per-button hacks, no redesign, and no
z-index escalation.

### Root causes (four, all measured before anything was edited)

1. **`allowedDevOrigins` — this is the reported bug.** `next dev` allowlists
   `localhost` only and answers **403** to every `/_next/*` request from any other
   origin, including the `Network: http://<lan-ip>:3000` URL it prints itself
   (`next/dist/server/lib/router-utils/block-cross-site-dev.js`). The failure is
   silent and extremely misleading: HTML and CSS still stream, so the page looks
   *perfect* on the phone, but every client chunk is blocked, **React never
   hydrates**, and every `onClick`/`onSubmit` in the app is inert while plain
   `<a href>` navigation keeps working. That asymmetry explains the report exactly,
   including the two puzzles in it — **Search worked in landscape** because ≥`sm`
   renders the field inline and submitting the form is a native GET navigation,
   whereas portrait needs an `onClick` toggle to reveal the field first; and
   **Sign In and the provider selector failed in both orientations** because both
   are `onClick`-only, with nothing for the browser to do natively. Tap-and-hold
   producing no feedback is the same thing: `:active` styling is CSS, but every
   handler was gone. **`next start` never runs this check**, so production was
   never affected — which is also why emulation reproduced nothing until the audit
   used a LAN origin instead of `127.0.0.1`.
   *Fix:* `next.config.mjs` derives `allowedDevOrigins` from this machine's own
   addresses (loopback literals, live interface addresses, hostname) — narrow by
   construction, dev-only, with a regression suite in
   `src/lib/__tests__/next-config.test.ts`.

2. **`opacity-0` without `pointer-events-none`** — an element at `opacity: 0` is
   invisible but still hit-tested, so every poster's hover-only quick-add was
   answering taps aimed at the title beneath it, and every Continue Watching
   tile's remove button was firing instead of resuming the episode. Touch-only: a
   mouse reveals the control before it can ever click it, which is why this never
   showed up on desktop. *Fix:* one shared `.hover-reveal` utility
   (`src/app/globals.css`) pairing `opacity-0` with `pointer-events-none` and
   restoring both on `:hover`/`:focus-within`, adopted by the three call sites that
   had the pattern (`MediaCard`, `MediaRow`, `ContinueWatching`). The hero dots
   also got `relative z-20` and 24px targets — they sit under the next section's
   `-mt-4` pull.

3. **Playback chrome above a modal drawer** — on the embed surface the chrome bar
   sat at `z-60` over `EpisodeDrawer`'s `z-40` layer *inside the same* `fixed
   inset-0 z-50` context, so the drawer's own top row was covered: "Close
   episodes" by the chrome's Episodes button, the autoplay switch by the provider
   selector. Measured in **all three** profiles, desktop included. *Fix:* the
   chrome bar and fallback notice drop to `z-30` — below the modal layer, above the
   frame (`PlaybackContainer.tsx`). Nothing moved visually; no z-index was raised.

4. **Native control bar below the fold on a phone held sideways** — the overlay is
   a fixed-height flex column; at 915×412 its top band and centre transport take
   172px while the bottom band asks for **328px**, and since nothing there can
   shrink, `justify-between` pushed the timeline and the whole control row (play,
   seek, volume, subtitles, settings, fullscreen) to y≈446 — off-screen, where no
   finger can reach. Landscape is the worst case rather than the mildest, because
   915px wide activates `sm:` and *adds* copy. *Fix:* on a short viewport
   (`[@media(max-height:520px)]`) the band drops its padding and the decorative
   title/synopsis block — which the detail page already shows — and keeps **every
   control** (`PlayerOverlay.tsx`). No change at any other size.

### Files changed

`next.config.mjs`, `src/app/globals.css`, `src/components/media/MediaCard.tsx`,
`src/components/media/MediaRow.tsx`, `src/components/media/ContinueWatching.tsx`,
`src/components/hero/Hero.tsx`, `src/components/playback/PlaybackContainer.tsx`,
`src/components/player/PlayerOverlay.tsx`, plus the new
`src/lib/__tests__/next-config.test.ts`. Provider architecture, provider URLs, the
manager, the registry, fallback logic, and the progress/history path were **not**
touched — the investigation traced none of the four causes there.

### Verified

- **Functional tap matrix** (`tools/mobile-audit/`, real touch events under device
  emulation, desktop 1440×900 / Android portrait 412×915 / Android landscape
  915×412, each row asserting a *named* state change rather than "the page still
  looks fine"), run against the **production build**:
  - embed surface — **82 cells, 0 failing, 12 n/a, zero retries**;
  - native surface — **15 cells, 0 failing, 0 n/a**.
  - The 12 n/a are honest: Account ×3 (no signed-in session — creating one would
    write to the hosted Supabase project) and Fullscreen/Subtitles/Settings ×3 on
    the embed surface, which belong to the provider's own player inside the iframe
    per `CLAUDE.md` — those three are covered by the native run instead.
- **Desktop reveal contract** (`hover-probe.mjs`): for both the card quick-add and
  the row arrows — inert at rest with the poster link taking the tap, revealed and
  hit-testable on hover, revealed on keyboard focus, still a real focusable
  `<button>`. Accessibility was not traded away for the touch fix.
- `npx tsc --noEmit` → exit 0.
- `npm run test` → **136 tests across 12 files** (was 131/11; +5). The gate caught
  a bug in one of those new tests: its "no port" pattern (`:\d+$`) was not
  IPv6-aware and rejected the legitimate `::1` entry. Fixed in the **test**, not
  the config — and while confirming which form is correct, `new URL(…).hostname`
  turns out to bracket IPv6 (`[::1]`), which is what Next compares, so the
  bracketed form is now asserted as the functional one.
- `npm run build` → clean (compiled, TypeScript passed, 13/13 pages, 21 routes +
  `ƒ Proxy (Middleware)`).

### Still owed / deliberately not fixed

- **Real-device retest** on the Android phone against a restarted `npm run dev`
  using the printed `Network:` URL, in both orientations. Emulation is evidence,
  not proof, and the original symptom was origin-dependent. The restart matters:
  `allowedDevOrigins` is read at server start. Walk this list portrait **and**
  landscape — (1) the navbar search toggle, then a real query; (2) **Sign in**;
  (3) `/movies` → genre, year, sort, clear filters, a page change; (4) a poster
  card, then its **Play** and **My List**; (5) a TV title → an episode; (6) on
  `/watch/*`: the provider selector, **Episodes** → close the drawer, autoplay,
  and **Back**; (7) footer links. Anything that responds visually but changes
  nothing is the interesting case — that is what the matrix asserts against.
- **Reported, out of this milestone's scope:** `/watch/*` renders over the site as
  `fixed inset-0 z-50` without removing the page beneath from the tab order, so
  14–17 site-chrome controls stay focusable behind the player (a focus-order and
  screen-reader defect, desktop included; the correct fix is route-group
  restructuring, not `tabindex` patching); 9–15 controls per route/profile have a
  touch target under 24px; and `PlayerSettings`' tab strip uses plain `<button>`s
  without `role="tab"`/`aria-selected`.
- The audit harness is kept in `tools/mobile-audit/` (see its README) so a
  regression is one command away. It ships nothing: outside the build, outside
  `tsc`, outside Vitest's `src/**/*.test.ts` collection.

## What has been implemented

- **Pages:** `/`, `/browse`, `/movies`, `/tv-shows`, `/movie/[id]`, `/tv/[id]`, `/search`, `/my-list`, `/login`, `/forgot-password`, `/reset-password`, `/watch/[type]/[id]`.
- **API routes:** `search`, `playback`, `watchlist`, `history`, `progress`, `subtitles/search`, `subtitles/download`. Plus `/auth/callback` — the Supabase email-link handler (outside `/api` because Supabase redirects a browser to it).
- **Metadata:** mock catalog default; live TMDB behind env (server-only).
- **Player:** custom UI, position persistence, subtitle overlay (custom-rendered, not native `<track>`), built-in playback servers (Aurora/Meridian/Harbor/Cobalt/Summit/Zephyr — original names), same-origin Creative-Commons sample clip.
- **Playback container:** provider-agnostic surround for the above — Provider Manager, five (empty) provider slots, provider picker, embed surface, loading/error/controlled-fallback states, provider-independent progress. Section above; setup guide in `docs/video-provider-setup.md`.
- **Subtitles:** `src/lib/opensubtitles.ts` (`server-only`) — search (API key only) + download (login → bearer token → `/download` → fetch signed link → WebVTT). Client wraps returned VTT text in a Blob URL and loads it via the existing `uploadedTracks` path.
- **Library:** watchlist / history / continue-watching — **Supabase-backed when configured** (RLS-scoped, with the one-time `localStorage`→server migration), falling back to `localStorage` (synced across tabs) otherwise.

## What remains unfinished

- **Password reset needs two Supabase dashboard settings + a live run-through, both yours:** add `<origin>/auth/callback` to the **Redirect URLs** allow-list (dev and production), optionally switch the recovery email template to the `token_hash` form for cross-device links, then walk the flow once with a real inbox. Details and the exact template string are in the password-reset section above.
- **Browser-UX slice of Phase 3, for you to confirm:** the backend data/auth/RLS layer is validated by direct API calls, but the in-app flows I can't drive headless remain for you — the Navbar "Sign in" control, in-app sign-up/in via `LoginForm`, the one-time `localStorage`→server migration + owner-marker bleed protection, and sign-out→local-mode. Runbook: `docs/phase-3.md` §5–§6.
- **Real-device mobile retest, yours:** the mobile-audit fixes are verified by real touch events under Android emulation against the production build, but the reported symptom was origin-dependent, so the phone itself has the final word. Retest list is in the mobile-audit section above — restart `npm run dev`, open the printed `Network:` URL on the phone, and walk it in both orientations.
- **Real playback provider:** still gated, and nothing is connected — playback runs on Reelhouse's own built-in surface with the bundled Creative-Commons clip. The *architecture* is ready — five empty slots, manager, picker, embed surface, fallback, provider-independent progress (section above), activated by `.env.local` per `docs/video-provider-setup.md` — but no provider is connected, and none will be until you supply a genuinely licensed one with its own official documentation. An adapter (for documented progress/failure events) and a CSP `frame-src` entry (when the policy is enforced) are the only code changes an activation should ever need.

## Known issues

- **`/watch/*` leaves the page beneath it in the tab order.** The playback surface is `fixed inset-0 z-50` over the site rather than its own route group, so 14–17 site-chrome controls stay focusable behind the player — a focus-order and screen-reader defect on desktop as much as on touch. Found by the mobile audit; not fixed there because the correct fix is route-group restructuring, not `tabindex` patching.
- **Small touch targets:** 9–15 controls per route (measured per profile) present a target under 24px — mostly icon-only chrome and inline text links. Nothing is unreachable; they are simply below the comfortable minimum.
- **`PlayerSettings` tab strip uses plain `<button>`s** without `role="tab"`/`aria-selected`, so the panel's tabs are announced as ordinary buttons.
- **Intermittent `ECONNRESET` to OpenSubtitles from this network.** Confirmed the same request flips between success and connection-reset seconds apart, affecting both search and the download-link host. Mitigated in the download pipeline with retry + per-attempt timeout; if all retries still reset, the user gets a clear host-specific message.
- **The subtitle download link is on a different host** (`www.opensubtitles.com`) than the API (`api.opensubtitles.com`); that hop can fail even when search works. This was the cause of the earlier "Couldn't fetch the subtitle file."
- **Two historical dev-log lines** (`/tmp/reelhouse-dev.log`, pre-fix) contain an expired **single-use** download token in a URL path. Logging is now **hostname-only**; the old lines are harmless (token consumed/expired) and were left in place to avoid racing the live log writer. Safe to delete the log if desired.
- **OpenSubtitles official docs are a client-rendered SPA** (not scrapable); request/response shape was verified against a maintained client library + the live API responses instead.
- **TMDB hostname** `api.themoviedb.org` is blocked by some ISPs (notably India); workaround is `TMDB_API_BASE=https://api.tmdb.org/3`.

## Phase 3 — backend activation: DONE, validated & CLOSED (2026-08-19)

**Approved and closed by the user on 2026-08-19.** Steps 1–5 are complete against the live hosted project (ref `zhttohwjhtrrtsxnqsqs`). Validation was run by direct API calls against the project's REST + Auth endpoints (more exhaustive than clicking the dashboard, which can't be scripted here), with **Confirm email OFF** so sign-up issues a session immediately.

1. ✅ Hosted Supabase project created.
2. ✅ Schema applied — `0001_init.sql` run; all tables, the `on_auth_user_created` trigger, and every RLS policy present.
3. ✅ Env wired — `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in `.env.local`; `service_role` left commented (not needed). App boots in configured mode.
4. ✅ Persistence verified end-to-end: sign-up issued a session → `profiles` row auto-created by the trigger → `watchlist` insert persisted and read back by its owner → `watch_history` upsert on the **generated** `episode_key` succeeded (position saved) → `playback_events` append-only insert succeeded.
5. ✅ RLS verified with two accounts: user B reads **none** of user A's watchlist/history, and user B's attempt to insert rows as user A is rejected (`403`, `42501 new row violates row-level security`).

**Left for you (browser-only, can't be driven headless):** the in-app "Sign in" control, and the one-time `localStorage`→server migration + owner-marker bleed test (`docs/phase-3.md` §6). Optional cleanup: delete the QA test users in **Authentication → Users** (FK cascade clears their rows), and you may turn **Confirm email** back ON now that scripted validation is done.

6. ⏸️ **Phase 3b — playback provider: not started, no actionable work.** The `VIDEO_PROVIDER_*` seam — now the five generic slots (see "Provider-agnostic playback architecture" above) — remains **unused and unconfigured** until a genuinely licensed source exists. This is a hard project rule, not a pending task.

## Framework upgrade — Next 16 + React 19 (2026-08-19)

**User-approved hardening upgrade**, done as an isolated change after Phase 3 closed. Previously deferred (the app was pinned to Next 14.2.35 to keep `params`/`searchParams` synchronous); this clears the residual Next 14 `npm audit` advisories that had no in-line patch.

- **Versions:** `next` 14.2.35 → **16.3.1** (Turbopack is the default build/dev engine), `react`/`react-dom` 18.3.1 → **19.2.8**, `@types/react` → 19.2.18, `@types/react-dom` → 19.2.4. Other deps unchanged (`@supabase/ssr` 0.12.4 was already current; `typescript` 5.5.4, `tailwindcss` 3.4.13). `postcss` override retained.
- **Async request APIs (Next 15/16):** every dynamic route now awaits its inputs — `movie/[id]`, `tv/[id]`, `watch/[type]/[id]` (`params` + `searchParams`), and `search` (`searchParams`). `src/lib/supabase/server.ts` `createClient()` is now `async` (awaits `cookies()`); its two internal callers (`getUser`, `getSessionContext`) await it.
- **`middleware` → `proxy` convention:** `src/middleware.ts` renamed to **`src/proxy.ts`**, export `middleware` → `proxy`. Same matcher and same guarded dynamic-import of the Supabase helper (which is unchanged and still lives at `src/lib/supabase/middleware.ts`). Build shows `ƒ Proxy (Middleware)`.
- **Caching:** safe across the upgrade — TMDB fetches already pass explicit `next: { revalidate }`, so the Next 15/16 "fetch no longer cached by default" change is a no-op here. No risky React-19 patterns present; `next.config.mjs` has no webpack hooks, so it's Turbopack-clean.
- **Verified:** `npm run typecheck` exit 0; a clean `next build` ("Compiled successfully", TypeScript passed, 7/7 static pages, all routes listed, no warnings); dev boot "✓ Ready in 2.7s"; live smoke test — `/`, `/login`, `/search?q=matrix` all HTTP 200 with correct rendered content.
- **Rollback artifacts:** the pre-upgrade snapshots `package.json.pre-upgrade.bak` and `package-lock.json.pre-upgrade.bak` were **deleted on 2026-08-19** at the user's request, once the upgrade was confirmed working. (No VCS here, so there is no longer an automatic rollback path — the versions are recorded above if a manual downgrade is ever needed.)
- **Doc note:** Next 16 requires **Node.js 20.9+** (was 18.18+).

## Environment variables

Secrets are **server-only** unless prefixed `NEXT_PUBLIC_`. Every feature is off (falls back) when its vars are blank. See `.env.local.example`.

| Variable | Purpose | Notes |
| --- | --- | --- |
| `TMDB_API_KEY` | Live TMDB metadata | Server-only. Blank → mock catalog. v3 key or v4 token. |
| `TMDB_IMAGE_BASE` | TMDB image base URL | Optional; rarely changed. |
| `TMDB_API_BASE` | TMDB API host override | Optional; set to `https://api.tmdb.org/3` if your ISP blocks the default. |
| `OPENSUBTITLES_API_KEY` | Subtitle **search** | Server-only. Blank → search UI shows "not configured". |
| `OPENSUBTITLES_USERNAME` | Subtitle **download** (login) | Server-only. Required (with password) to load a subtitle. |
| `OPENSUBTITLES_PASSWORD` | Subtitle **download** (login) | Server-only. Counts against a daily per-account quota. |
| `OPENSUBTITLES_APP_NAME` | User-Agent to OpenSubtitles | Optional; defaults to `Reelhouse v1.0`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | **Phase 3 activation.** Browser-exposed by design. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | **Phase 3 activation.** Browser-safe (protected by RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server tasks | Server-only, optional. Bypasses RLS — never `NEXT_PUBLIC_`. |
| `REDIS_URL` | Shared metadata cache (scale-out) | Optional; built-in Next.js Data Cache used otherwise. |
| `VIDEO_PROVIDER_BASE` / `VIDEO_PROVIDER_KEY` | Legacy playback-provider seam | Server-only; kept for compatibility, unread by the slot system. |
| `VIDEO_PROVIDER_N_NAME` (N = 1–5) | Provider display name | Server-only. Default `Provider N`. |
| `VIDEO_PROVIDER_N_ENABLED` | Make the slot selectable | `1`/`true`/`yes`/`on`. Default off → greyed out as `Disabled`. |
| `VIDEO_PROVIDER_N_PRIORITY` | Selection order, **lower wins** | Default `N × 10`; Reelhouse's own built-in player surface sits at `10000`. |
| `VIDEO_PROVIDER_N_MOVIE_URL` | Movie player URL template | `{id}` = TMDB id. Must be `https://` or a same-origin `/path` (dev also allows `http://localhost`). |
| `VIDEO_PROVIDER_N_TV_URL` | TV player URL template | `{id}`, `{season}`, `{episode}`. Same URL restrictions. |
| `VIDEO_PROVIDER_N_MEDIA_TYPES` | Narrow what the slot serves | `movie`, `tv`, or `movie,tv`. Default: derived from the URLs set. |
| `VIDEO_PROVIDER_N_REPORTS_PROGRESS` | Provider **documents** progress events | Default off → no progress recorded for that provider (never invented). |
| `VIDEO_PROVIDER_N_REPORTS_FAILURE` | Provider **documents** a reliable failure signal | Default off → **automatic fallback off** for that provider; failures surface as retry/switch. |

No api-key/token/auth variable exists for the slots by design — one gets added only if a real provider's documentation requires it, server-side, and never inside a URL template (an embed URL is visible to the browser). Full guide: `docs/video-provider-setup.md`.

## Decisions already made

- **Branding:** original "Reelhouse" only — not affiliated with, and uses no assets/names of, any real streaming service. Mock catalog is invented.
- **Auth + DB = Supabase** (Postgres + row-level security + built-in auth). Schema in `supabase/migrations/0001_init.sql`.
- **Graceful degradation everywhere:** a feature activates only when its env vars are present; otherwise it falls back to the Phase 1 behavior (mock / anonymous / `localStorage`). A fresh clone boots with zero setup.
- **Framework:** upgraded to **Next.js 16.3.1** (Turbopack) + **React 19.2.8** on 2026-08-19 (user-approved) — dynamic routes use async `params`/`searchParams`, server helpers await `cookies()`, and the request middleware uses the Next 16 `proxy` file convention (`src/proxy.ts`).
- **Playback:** bundled Creative-Commons sample clip (`public/media/`, e.g. Big Buck Bunny, CC-BY) served same-origin so playback works offline.
- **Playback architecture (2026-08-19):** five **generic** provider slots, activated by `.env.local` alone; the existing custom player is kept unchanged as Reelhouse's own built-in surface (never listed as a provider, never part of switching or fallback), while a future provider supplies its **own complete player UI** inside the embed surface (Reelhouse never recreates provider controls). Capabilities default to false: no progress is recorded unless the provider documents it, and **automatic fallback happens only when the failing provider declares a reliable failure signal**. Progress is keyed by media/episode, never by provider. **No provider is named or scaffolded for**, and no unauthorized TMDB-id embed aggregator will ever be connected, referenced, or modelled on — a future provider must be genuinely licensed and integrated from its own official documentation.
- **Secrets stay server-side**, never `NEXT_PUBLIC_` (the sole browser-exposed values are the Supabase URL + anon key, safe under RLS).
- **API error contract (M5):** the Supabase-backed routes (`watchlist`/`history`/`progress`) return a **generic** `{ error: "Server error" }` on a DB failure and log the real cause server-side via `dbErrorResponse()` — never echo a raw driver message to the client. Safe because the library treats these routes as **status-only**. Baseline security headers ship from `next.config.mjs` `headers()`; a Content-Security-Policy ships **Report-Only** (M6) — reports violations without blocking, enforced later via a one-line header-key flip after browser validation.
- **Player UX:** custom player (not native `<video controls>`); subtitles rendered as a custom overlay so appearance controls apply; 2-letter country text badges (Windows renders flag emoji as letters); amber accent for active states.
- **Subtitle pipeline:** subtitle downloaded server-side, handed to the client as VTT text, wrapped in a Blob URL; download uses a resilient fetch (retry + timeout) for intermittent networks; diagnostics log **hostname-only** and never log the API key, JWT, signed-link token, or subtitle text.
- **Phase gate:** backend **activation** (2026-08-19), the **Next 16 + React 19 upgrade** (2026-08-19), and the **provider-agnostic playback architecture** (2026-08-19) are all done and user-approved. The gate still stands for **Phase 3b — connecting an actual playback provider** — which requires explicit approval and a genuinely licensed source before any work begins.
