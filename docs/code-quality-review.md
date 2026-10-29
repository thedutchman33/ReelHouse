# Code quality & maintainability review — Reelhouse

**Date:** 2026-10-29  
**Scope:** entire `src/` tree, configuration, `public/`, `scripts/`, dependency manifest, and the current working tree (including uncommitted work).  
**Method:** automated import-graph reachability from every App Router entry point, export/symbol reference counting, CSS selector usage scan, public-asset reference scan, targeted greps for dynamic class/route construction, plus a manual read of the hot paths.  
**Baseline:** `tsc --noEmit` passes; `vitest run` passes (29 files, 320 tests). `src/` contains 268 TS/TSX/CSS files, 59,390 lines; cricket alone is 61 files / 16,248 lines (27%).

This is a review, not a patch. Everything below is ordered by value-to-risk, with the evidence needed to act on it.

---

## Executive summary

| # | Finding | Size | Runtime impact | Risk | Priority |
|---|---------|------|----------------|------|----------|
| 1 | Two orphaned cricket screens (`IccStatistics`, `PlayerCompare`) | 1,555 LOC | none (dead) | very low | P1 |
| 2 | Orphaned `/api/f1/weekend` chain | 232 LOC | none (dead) | low | P1 |
| 3 | Dead exports/functions across libs and UI | ~86 LOC | none | very low | P1 |
| 4 | Unreachable games UI branches + never-read data fields | ~25 LOC | none | very low | P1 |
| 5 | Dead CSS in the cricket design kit | 244–282 LOC | smaller CSS payload | low | P1 |
| 6 | Four countdown implementations, two session selectors, two cricket hero pickers | ~150 LOC duplicated | drift risk | medium | P2 |
| 7 | `/f1` fetches the same schedule three times per page view | 3× route work | real | low | P2 |
| 8 | `/api/live` composes entire dashboards for two badge windows | heavy repeated work | real | medium | P2 |
| 9 | Two TMDB anime calls always run, used only as fallback | 2 upstream calls | cold-cache latency | very low | P2 |
| 10 | `standings.ts assemble()` is a 568-line function; three F1 view files exceed 1,300 lines | ~4,700 LOC in 4 files | maintainability | medium | P3 |
| 11 | 19 MB generated JSON is untracked and unignored; whole features uncommitted | repo/build | deployment risk | high if mishandled | P0 |

**Safe-deletion total: ≈ 2,140 lines** (≈ 3.6% of `src/`, ≈ 13% of the cricket vertical), with no runtime behaviour change expected. The biggest structural win is not line count: it is removing a second, divergent implementation of the cricket stats screens and collapsing the duplicated time/session logic before it drifts further.

---

## 1. Dead code

### 1.1 Two orphaned cricket screens (P1, 1,555 LOC)

**Files**

- `src/components/cricket/IccStatistics.tsx` — 862 lines / 35 KB
- `src/components/cricket/PlayerCompare.tsx` — 693 lines / 30 KB

**Evidence**

- Reachability from all 64 App Router entry points and all 29 test files never reaches either file.
- The only reference to `PlayerCompare` anywhere is `IccStatistics.tsx:4` (`import PlayerCompare`); the only reference to `IccStatistics` is nowhere.
- The live equivalents are mounted in `Rankings.tsx:497–502` through the view switcher (`rankings | player-stats | head-to-head | compare`, `Rankings.tsx:20–25`):
  - `PlayerStatsSection.tsx` (447 lines)
  - `HeadToHeadSection.tsx` (815 lines)
  - `CompareSection.tsx` (716 lines)

**Why it is unnecessary:** these are the previous implementation of the three views that now live in `Rankings`, left behind when the section was redesigned. They duplicate stat aggregation, chart wiring and player picking, and they will silently rot (they already import a narrower slice of `stats-charts` than the live sections).

**Impact of removal:** −1,555 lines of dead code, two fewer 600–900-line files in review and TypeScript scope, no runtime change. Nothing else becomes orphaned: `stats-charts` is still used by the three live sections, `PlayerPicker` is still used by `RosterPlayerPicker`, and every `ui.tsx` export remains in use.

**Risks:** very low. The only real risk is an external deep link or bookmark to markup that no longer exists, and there is no route or anchor for these screens. Verify by grepping for the component names after deletion and clicking through `/cricket` → Rankings → each view.

**Cleanup:** delete both files, run `tsc`/`vitest`/`next build`, then remove the now-orphaned `.ck-table` CSS block (see §1.5).

---

### 1.2 Orphaned F1 weekend-records endpoint (P1, 232 LOC)

**Files / lines**

- `src/app/api/f1/weekend/route.ts` — 29 lines
- `getF1WeekendRecords` — `src/lib/f1.ts:941–1119` (179 lines)
- `F1WeekendRecordRow` / `F1WeekendPayload` — `src/lib/f1.ts:917–939` (23 lines)

**Evidence:** no string `/api/f1/weekend` exists anywhere in `src/`; `getF1WeekendRecords` is referenced only by that route. The session-records UI loads `/api/f1/results` instead (`SessionRecords.tsx:423`), and `ResultsCentre.tsx:132` does the same.

**Why it is unnecessary:** it is the superseded data path for the session-records strip. Keeping it means an extra public endpoint, an extra OpenF1 read path, and a second definition of “session winner/fastest lap” that no screen exercises.

**Impact:** −232 LOC, one fewer route in the build and API surface, no behaviour change.

**Risks:** low. If the deployment is public, a third party could be calling the route; there is no documentation reference to it. Check access logs once before deleting if this is live; otherwise delete.

**Cleanup:** delete the route and the function, then the two types. **Do not** delete `F1TestWeekend` (used by the schedule model) or `F1CarSample` (used by telemetry).

---

### 1.3 Dead exports and functions (P1, ~86 LOC)

Verified by symbol-reference counts across `src/` (definition-only = zero other references):

| Symbol | File | Lines | Notes |
|---|---|---|---|
| `formatDateTime` | `src/lib/cricket/shared.ts` | 78–82 | old list/date helper |
| `matchTitle` | `src/lib/cricket/shared.ts` | 250–253 | superseded by `format…` helpers |
| `featuredMatch` | `src/lib/cricket/shared.ts` | 259–278 | superseded by `pickFeaturedMatch` |
| `seriesMatches` | `src/lib/cricket/shared.ts` | 280–285 | unused |
| `rankingFor` | `src/lib/cricket/shared.ts` | 287–293 | unused |
| `getStatsPlayersByIndex` | `src/lib/cricket/stats-db.ts` | 304–310 | no caller |
| `FlagByCode` | `src/components/cricket/TeamFlag.tsx` | 99–111 | unused wrapper; `flagCodeFor` stays |
| `PosBadge` | `src/components/f1/standings/parts.tsx` | 67–74 | unused |
| `CountBadge` | `src/components/f1/standings/parts.tsx` | 253–259 | unused |
| `clockF` | `src/components/f1/format.ts` | 19–21 | unused |
| `openF1TelemetryView` | `src/components/f1/SessionTabs.tsx` | 50–54 | dead event helper |
| `BrowseSearchParams` | `src/components/browse/BrowseView.tsx` | 20 | unused type alias |

**Why unnecessary:** nothing imports or calls them; they are leftovers from earlier iterations (`featuredMatch`/`seriesMatches` predate the live `watch-window.ts` model).

**Impact:** −86 LOC, fewer false affordances for future contributors (“this must be the hero picker” — it is not).

**Risks:** none, provided the reference count is re-run after deleting the two orphan screens (§1.1) — a symbol currently “used” only by dead code will then become dead too.

**Do not delete these — they only look unused:** `nextF1Session` (used by `f1LiveWindow`), `bucketBySector`/`sampleAt` (used inside `f1-telemetry-math`), `supportsMediaType` (used by `playableCandidates`), `isSafeCricketSourceUrl`/`CRICKET_SERVER_SLOTS` (used inside `cricket-playback`), `pruneEndedAt` (used by storage helpers). They are over-exported, not dead; drop the `export` keyword only if you want to narrow the module API.

**Dev-only fixture, keep:** `EMBED_TEST_PATH` and `mockEmbedAdapter` in `src/lib/playback/adapters.ts` are the documented `public/media/mock-embed/player.html` test harness (`docs/video-provider-setup.md` §14). They are not production code paths, but they are intentional tooling; mark them `@dev` rather than deleting.

---

### 1.4 Unreachable games UI and never-read fields (P1, ~25 LOC)

**Evidence**

- `src/lib/games.ts:228–232` hard-codes `note: null`, `score: null`, `sourceUrl: null` for every parsed game; `origin` is assigned but never read.
- `src/components/games/GamesHub.tsx:178–184` renders a description paragraph only when `game.note` is truthy — unreachable.
- `GamesHub.tsx:195–204` renders a “Source” link only when `game.sourceUrl` is truthy — unreachable.
- `game.score` and `game.origin` have zero reads anywhere.

**Why unnecessary:** the parser cannot produce these values today, so the UI is dead by construction and the `Game` interface advertises capabilities the page does not have.

**Impact:** ~25 LOC plus a simpler `BrowserGame` contract; the search haystack (`GamesHub.tsx:82`) keeps working.

**Risks:** low. If the upstream catalogue later exposes descriptions or repo links, the fields would need re-adding — the better product fix is to map the real feed fields in `parseBitrunlogGames` instead of deleting the UI. Choose one: wire the parser, or remove the branch. Do not leave it half-wired.

---

### 1.5 Dead CSS in the cricket design kit (P1, 244–282 LOC)

**File:** `src/app/cricket/cricket.css` (737 lines). 30 `.ck-*` classes have zero references in TSX/HTML, including dynamic-template checks:

`ck-btn`, `ck-btn-primary`, `ck-btn:hover/active`, `ck-card`, `ck-card-glow`, `ck-chip`, `ck-eyebrow`, `ck-field`, `ck-in-1/2/3`, `ck-link`, `ck-modal`, `ck-no-scrollbar`, `ck-rule`, `ck-select`, `ck-subcard`, `ck-sweep`, `ck-tab`, `ck-tab-active`, `ck-text-blue/gold/muted/dim`, `ck-title`, `ck-tone-done/idle/live/warn`, `ck-watch-live`, `ck-well`.

**Why unnecessary:** the page now uses Tailwind utilities + the shared `f1-card` surface. This is the old bespoke component kit; only a handful of its classes survived (`ck-player-card`, `ck-player-reveal`, `ck-bar`, `ck-live-dot`, `ck-stadium-scene`, `ck-modal-root`, `ck-table`).

**Impact:** 244 lines removed immediately; after deleting the dead screens (§1.1), `.ck-table`/`.ck-num` (~35 more lines, used only by `PlayerCompare`) also goes. This is shipped CSS, so it is a real (small) payload win on `/cricket`.

**Risks:** low, but CSS deletion is exactly where false positives hide. The scan covered literal class strings and dynamic interpolation; re-grep `ck-` in `src` and visually check `/cricket` at desktop and mobile widths before/after.

**Cleanup:** delete the rule blocks and their entries in the responsive overrides (`cricket.css:730`, `740–741`), keep the live list above, then run `next build` and compare a screenshot of `/cricket`.

---

### 1.6 Checked and **not** dead (avoid false positives)

- `/api/seasons/[tvId]/[season]` — called via template strings in `EpisodeList.tsx:124` and `PlaybackContainer.tsx:156`.
- `/movie/[id]`, `/tv/[id]`, `/watch/[type]/[id]`, `/providers/[id]` — linked with template strings; the audit's “unlinked page” flag is a false positive.
- `public/cricket/flags/*.svg` — loaded dynamically from `FLAG_CODES` in `TeamFlag.tsx:8–34`.
- `jsdom` — used by two per-file `// @vitest-environment jsdom` suites, not globally.
- `IccStatistics`’ `.ck-table` — dead only *after* the screen removal; cascade it.

---

## 2. Duplicate logic that should be consolidated

### 2.1 Countdown math and hooks — four implementations (P2, ~80 LOC removable)

| Location | What is duplicated |
|---|---|
| `src/components/f1/Countdown.tsx:9–48` | `useNow`, `countdownTo`, `CountdownCells`, `MiniCountdown` |
| `src/components/cricket/Countdown.tsx:6–61` | `useNow`, `CountdownCells`, `MiniCountdown` |
| `src/lib/cricket/shared.ts:213–235` | a second `countdownTo` / `CountdownParts` |
| `src/components/f1/WatchLiveButton.tsx:36–48` | a fourth split-into-D/H/M/S implementation |

Behaviour already differs: cricket hides seconds when the target is more than a day away (`cricket/Countdown.tsx:54–56`), F1 always shows them; the screen-reader labels differ (“Session started” vs “Scheduled start time has passed”); the accent colour is hard-coded in each.

**Why it should change:** the same arithmetic exists four times, so a change to DST/rounding/negative-time handling must be made four times.

**Plan:** extract `src/lib/countdown.ts` with pure `split(ms)`/`countdownTo(iso, now)` and `useNow` (client hook in a `"use client"` module). Keep the two presentational wrappers (`f1` and `cricket`) but parameterize the accent and the “hide seconds” rule. Delete the duplicate `countdownTo` from `cricket/shared.ts` (it is re-exported by `cricket/index.ts`, so update imports).

**Risk:** medium-low; visual/AT copy changes are the only user-visible difference. Existing suites (`watch-live-phase.test.ts`) cover the phase logic, not the formatting — add a small table test for `split`.

### 2.2 “Next F1 session” — three definitions (P2, latent inconsistency)

| Location | Rule | End fallback |
|---|---|---|
| `src/lib/f1.ts:163–173` (`schedule.nextSession`) | first session with `date_end ?? date_start >= now` | none |
| `src/components/f1/F1Dashboard.tsx:169–176` | same, re-derived in the browser | `date_end ?? date_start` |
| `src/lib/live-windows.ts:49–57` (`nextF1Session`) | same, sorted list | `date_start + 3h` |
| `src/lib/f1.ts:256` and `:714` | session end used by results/telemetry | `start + 2h` |

**Why it matters:** when OpenF1 omits `date_end`, the hero button (`WatchLiveButton.tsx:171–173`, fallback `target + 3h`), the LIVE badge (`live-windows.ts`, 3h) and the results/telemetry code (2h) disagree about when the session ends. That is a real “LIVE stays on / switches off early” bug waiting for a missing field, not just code duplication.

**Why it is duplicated:** `F1Dashboard` re-derives the value even though `getF1Schedule` already returns `nextSession`; `live-windows` re-derives it again for the navbar.

**Plan:** one `nextSession(schedule, now)` + `sessionEnd(session)` in `src/lib/f1-session.ts` (pure, no fetch), used by `getF1Schedule`, `F1Dashboard`, `f1LiveWindow`. Pick one fallback duration (3h matches the button/badge today) and test it. The schedule payload can then drop `nextSession` if the client derives it, or keep it as the single source and delete the client copies.

**Risk:** medium — boundary behaviour around session end changes. Cover with the existing `live-windows.test.ts` and `watch-live-phase.test.ts` fixtures before changing.

### 2.3 Cricket “featured match” — two precedence implementations (P2, tested twice)

- `src/lib/live-windows.ts:93–116` `featuredCricketMatch(data, now)` — server, uses `match.endedAt` (ISO from BCCI scorecard).
- `src/lib/cricket/watch-window.ts:85–110` `pickFeaturedMatch(matches, endedAt, now)` — client, uses the localStorage `endedAt` map.

Both implement: live → within 30-min grace → next upcoming → latest completed. They are both live and both tested (`live-windows.test.ts`, `watch-window.test.ts`), so this is not dead code — it is two sources of truth for “which match is the hero”.

**Impact:** divergent hero/badge after a refresh (server has scorecard `endedAt`; client has observed end times). **Plan:** extract the ordering into one pure function that takes an `endedAt(match) => number | null` resolver; keep the two storage adapters thin. **Risk:** medium — the two end-time sources are genuinely different; write a shared table test with fixtures before refactoring.

### 2.4 Two `ServerPanel` components (P2, review before touching)

- `src/components/playback/ServerPanel.tsx` — provider picker, Cloudflare speed test, reachability probes; rendered by `PlaybackContainer.tsx:598`.
- `src/components/player/ServerPanel.tsx` — mock playable-server cards with favourites; rendered through `VideoPlayer` → `PlayerSettings` (`VideoPlayer.tsx:724`).

**Why it is a smell:** the same watch page can show two different “choose a server” UIs with different data models (`ProviderDescriptor` vs `PlaybackServer`). **Plan:** decide which surface owns server selection (the provider panel is the real one; the built-in player is the fallback surface). If the built-in player remains, extract the card/row presentation and keep the data adapters separate. **Risk:** medium; this is user-facing playback UX, not dead code. Do not delete either without exercising `/watch/[type]/[id]` in both native and embed modes.

### 2.5 Route-handler boilerplate (P2, ~100 LOC)

8 F1 and 11 cricket route handlers (plus the library routes) repeat the same `NextResponse.json` + `try/catch` + `Cache-Control` string pattern. Only Supabase has a helper (`dbErrorResponse`). **Plan:** `src/lib/api-response.ts` with `jsonCached(data, { sMaxAge, swr })` and `apiError(status, code)`. Keep each route's TTL explicit; do not unify the TTLs. **Risk:** low, but cache headers are behaviour — assert them in one route test per family.

### 2.6 Smaller duplicates (low priority)

- `EmptyState` exists in `cricket/ui.tsx:287` and `f1/standings/parts.tsx`; different styling by design, but the API is the same.
- Tooltip/dismiss logic is shared from `f1/standings/charts.tsx`, yet `f1/charts.tsx` (940 lines) and `f1/standings/charts.tsx` (1,358 lines) each carry chart scaffolding. Consolidate only the tooltip/axis primitives, not the chart types.
- `formatNumber`/`formatDecimal` (cricket) vs `fmt*` helpers in `f1/format.ts` — different locales/units; not worth merging.

---

## 3. Unused UI components

| Component | File | Status |
|---|---|---|
| `IccStatistics` (default) | `src/components/cricket/IccStatistics.tsx` | entire screen unreachable (§1.1) |
| `PlayerCompare` (default) | `src/components/cricket/PlayerCompare.tsx` | entire screen unreachable (§1.1) |
| `FlagByCode` | `src/components/cricket/TeamFlag.tsx:99` | no references |
| `PosBadge` | `src/components/f1/standings/parts.tsx:67` | no references |
| `CountBadge` | `src/components/f1/standings/parts.tsx:253` | no references |
| `CardSkeleton` | `src/components/common/Skeleton.tsx` | exported but used only inside its own file — drop the `export`, not the component |

**No cascade into the shared UI kit:** after removing the two screens, every remaining `ui.tsx` export (`SectionHeading`, `TeamBadge`, `Select`, `EmptyState`, `PlayerAvatar`, `Modal`) is still imported by at least one live component. `PlayerPicker` remains used by `RosterPlayerPicker`; `stats-charts` remains used by the three live cricket sections.

---

## 4. Overly complex implementations that can be simplified

1. **`src/lib/standings.ts:437–1005` — `assemble()` is a 568-line function.** It builds drivers, teams, head-to-head, stats, editorial cards and portraits in one scope. Split into `assembleDrivers`, `assembleTeams`, `assembleHeadToHead`, `assembleStats`, `assembleEditorial` over a shared raw model. **Impact:** the single hardest file to review; **risk:** medium (pure refactor), **mitigation:** snapshot `getSeasonPayload` output for 2–3 seasons before touching it (there is no such test today — `standings-format.test.ts` covers formatting only).

2. **`src/lib/f1.ts` — 1,420 lines / 6 responsibilities:** OpenF1 client, schedule assembly, telemetry, race extras, results, weekend records. Deleting §1.2 removes one; split telemetry and results into their own modules. **Impact:** faster navigation, smaller diffs; **risk:** low (pure moves), but keep the public import surface stable or update the 12+ consumers.

3. **F1 view mega-files:** `analytics.tsx` 1,804 lines, `pace-views.tsx` 1,501, `race-views.tsx` 1,384, `TelemetryCentre.tsx` 1,209. Each mixes data shaping, SVG chart drawing and layout. Extract the pure shaping functions into `src/lib/f1-*.ts` (testable) and keep the components presentational. **Impact:** high maintainability; **risk:** medium; do it incrementally, one view per PR.

4. **Chart layers:** `f1/charts.tsx` (940), `f1/standings/charts.tsx` (1,358), `cricket/stats-charts.tsx` (573), `cricket/MatchCharts.tsx` (832). There is real reuse already (cricket imports the standings tooltip); the remaining duplication is axis/legend/tooltip scaffolding. Consolidate primitives, not chart types. **Risk:** medium (visual regression); **mitigation:** screenshot the standings/telemetry tabs before/after.

5. **`getCricketDashboard`** mixes four sources, normalization, dedupe and a conditional scorecard enrichment in ~80 lines (`cricket/index.ts:47–124`). It is readable, but the scorecard call (below) makes it a performance hotspot. Extracting `loadCricketCore` (fixtures/results/live) and `enrichLatestResult` would make the cheap/expensive split explicit.

---

## 5. Legacy code that is no longer needed

| Item | Replacement | Action |
|---|---|---|
| `/api/f1/weekend` + `getF1WeekendRecords` + its two types | `/api/f1/results`, `SessionRecords` | delete (§1.2) |
| `IccStatistics` / `PlayerCompare` | `PlayerStatsSection` / `HeadToHeadSection` / `CompareSection` | delete (§1.1) |
| `.ck-*` component kit in `cricket.css` | Tailwind + `f1-card` | delete unused blocks (§1.5) |
| Old cricket helpers `featuredMatch`, `seriesMatches`, `rankingFor`, `matchTitle`, `formatDateTime` | `watch-window.ts`, `live-windows.ts`, current format helpers | delete (§1.3) |
| `openF1TelemetryView` event helper | session tabs now switch view directly | delete (§1.3) |
| `mock-embed` fixture + `mockEmbedAdapter` | none — **intentional developer tool** | keep; document as dev-only |
| `src/lib/mock.ts` catalog | live fallback when TMDB is unconfigured | keep (used by `getHomeRows`) |

---

## 6. Redundant data queries / API calls

> There is no SQL database in this app. “Queries” here are Supabase REST calls (auth, watchlist, history) and third-party feeds (TMDB, AniList, BCCI, ICC, OpenF1, FlyEmbed).

### 6.1 `/api/live` pays for two full dashboards to return two windows (P2, real load)

`src/app/api/live/route.ts:16–21` calls `getF1Schedule()` **and** `getCricketDashboard("men")` on every poll. The navbar mounts `useLiveWindows` on every page and polls every 60 s (`use-live-windows.ts:72–78`), and the home hero shares that poll.

`getCricketDashboard` fetches two fixture seasons, results, live matches and the full player roster (`cricket/index.ts:50–55`), then may fetch a scorecard. Only the featured match is needed. The F1 side fetches the whole season of meetings/sessions for one session window.

**Impact:** the most frequently called endpoint in the app does the most work, including third-party calls to BCCI on every uncached poll. **Fix:** add a light composer (`getCricketLiveSummary` → fixtures + results only; no players) and a cached `LiveFeed` (e.g. `unstable_cache`, 30 s) so concurrent tabs share one composition. **Risk:** medium — the cricket window needs `endedAt`, which comes from the scorecard enrichment; keep that enrichment but gate it to the recent-result branch, and cover with the existing `live-windows.test.ts`.

### 6.2 `/f1` fetches the schedule three times per page view (P2)

- `F1Dashboard.tsx:115` — `/api/f1/schedule` (and every 60 s)
- `ResultsCentre.tsx:88` — `/api/f1/schedule?year=…`
- `SessionRecords.tsx:333` — `/api/f1/schedule?year=…`

All three mount in the same page tree. The response is `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (`api/f1/schedule/route.ts:20`) — there is no `max-age`, so the browser does not reuse it; each component hits the route separately.

**Impact:** 3 route invocations + 3 JSON payloads per visit (plus one per minute from the dashboard poll). **Fix:** own `schedule` + `year` in one context (or pass the dashboard's schedule down), and let `ResultsCentre`/`SessionRecords` consume it. Add `max-age=30` to the response if the data contract allows. **Risk:** low-medium; the year selector must move into the provider, and `preset`/session hand-off must keep working.

### 6.3 Two TMDB anime calls always run, only used as a fallback (P2)

`liveHomeRows` (`tmdb.ts:278–353`) includes `animeTv` and `animeMovie` in the initial `Promise.all`, but they are consumed only when `anilistTrending(18)` returns empty (`tmdb.ts:409–415`). AniList normally answers.

**Impact:** two extra TMDB requests per home composition/cold fetch cache; no user-visible benefit. **Fix:** move the two discover calls into the fallback branch after AniList resolves empty. **Risk:** very low; the fallback path becomes slightly slower, which is acceptable because it is already the failure path.

### 6.4 Scorecard fetched only to learn `endedAt` (P3)

`cricket/index.ts:95–102` calls `fetchBcciScorecard(latestResult.gid)` whenever the latest result is within 12 h, solely to set `endedAt` (the 30-minute post-match window). That is a full scorecard fetch/parse on a ~30 s cache cadence. **Fix:** memoize per `gid` for 30 minutes, or read the end time from the list feed if BCCI exposes it. **Risk:** low; the existing `try/catch` already tolerates failure.

### 6.5 Library loads two endpoints, each authenticating independently (P3)

`library.ts:321–323` fetches `/api/watchlist` and `/api/history` in parallel; each route calls `getSessionContext()` (Supabase auth) and queries separately. **Impact:** 2 auth round trips + 2 queries per My List load. **Fix (optional):** a single `/api/library` that resolves the session once and runs both selects in parallel. **Risk:** low, but it changes the client contract; not worth it unless My List feels slow.

---

## 7. Abandoned / disconnected files and artefacts

1. **`IccStatistics.tsx` + `PlayerCompare.tsx`** — the clearest “disconnected from the application” case (§1.1).
2. **`src/lib/cricket/generated/cricket-stats.json` — 19 MB, untracked, not gitignored.** `next.config.mjs:49–52` traces it into the serverless bundle; `stats-db.ts:140–143` reads it with `fs` once per process. Committing it permanently bloats git history and every clone; ignoring it breaks builds unless the generation step runs. **Decide now:** either (a) commit it via Git LFS/release artifact, or (b) add it to `.gitignore`, make `scripts/build-cricket-stats.py` a build prerequisite, and fail fast with a clear error when it is absent. Also `player-names.json` (154 KB) is generated — same decision.
3. **`scripts/__pycache__/` is untracked and not ignored.** Add `__pycache__/` and `*.pyc` to `.gitignore`.
4. **19 MB JSON + 25 modified + 27 untracked paths are unreviewed by CI.** CI (`.github/workflows/ci.yml`) runs `tsc`, tests and a build on pushes only; none of the cricket/games/live work has ever been through it. This is the single largest process risk in the repository.
5. **Two env templates:** `.env.example` is untracked and new; `.env.local.example` is modified. Keep one canonical template and link the other.
6. **Root scratch files:** `.tmp-sched.json`, `cineby-technical-analysis.md`, `prd-… (1).md`, `CLAUDE.md` — ignored or local, but they make the workspace ambiguous. Move to `.tmp/` (already ignored) or delete.

---

## 8. Opportunities to reduce technical debt

1. **Add a dead-code gate.** `knip` (or `ts-prune`) as a dev dependency plus a CI step would have caught every symbol in §1.3 and both orphan screens. It is read-only, fast, and needs no config beyond `src/`.
2. **Add ESLint.** There is no ESLint config or dependency; CI validates types but not unused variables/imports/hooks. Next's flat config plus `@typescript-eslint/no-unused-vars` would catch drift as it happens.
3. **Make cache headers honest.** `s-maxage` without `max-age` means “CDN only”; on a single Node deployment every navbar poll reaches the route. Add `max-age` where data tolerates it, or add in-process memoization for composed feeds (`/api/live`, `/api/f1/schedule`).
4. **Commit in slices.** Suggested order: (a) shared libs/data providers, (b) API routes, (c) UI, (d) docs/scripts. That makes the generated-JSON decision explicit and gives CI a chance to run before more code lands on top.
5. **Normalize the per-section API error contract.** `{ error: "cricket_data_unavailable" }`, `{ error: "f1_weekend_unavailable" }`, `{ error: "bad_meeting" }` etc. are stringly typed; a shared `ApiErrorCode` union + one response helper makes the client handling predictable.
6. **Document the “provider vs built-in player” boundary.** The two `ServerPanel`s and two server models are the main place where a future contributor can add a third variant by accident.

---

## Recommended cleanup plan

### Phase 0 — make the work reviewable (before deleting anything)

1. Decide the generated-JSON strategy (§7.2); add `__pycache__/` to `.gitignore`.
2. Commit the current work in four slices; let CI run.
3. Add `knip` to CI (report-only first) and record its baseline.

**Exit criteria:** clean `git status` (or a deliberate, documented exception for generated data), green CI on the branch.

### Phase 1 — safe deletions (≈ 2,140 LOC, ~1 day)

1. Delete `IccStatistics.tsx`, `PlayerCompare.tsx`.
2. Delete `/api/f1/weekend/route.ts`, `getF1WeekendRecords`, `F1WeekendRecordRow`, `F1WeekendPayload`.
3. Delete the twelve dead exports in §1.3 (start with `cricket/shared.ts`, then the F1 badges/helpers).
4. Remove the games `note`/`sourceUrl` branches and `score`/`origin` fields (or wire the parser — choose one).
5. Delete the 244 dead CSS lines + the `.ck-table` cascade (~282 total).
6. Re-run `tsc --noEmit`, `vitest run`, `next build`; grep each deleted symbol; click `/cricket` (all four Rankings views), `/f1`, `/games`.

**Expected result:** no behaviour change, smaller `/cricket` CSS, ~2.1k fewer lines, one fewer public endpoint.

### Phase 2 — duplication and hot-path calls (2–3 days)

1. Extract `src/lib/countdown.ts` (+ shared `useNow`); migrate the four call sites.
2. Extract `nextSession`/`sessionEnd` into one module; make the 2h/3h fallback consistent; add tests.
3. Unify cricket hero precedence behind an `endedAt` resolver; keep both storage adapters.
4. Fetch the F1 schedule once per `/f1` page (context/provider); add `max-age`.
5. Slim `/api/live` (no player roster; no scorecard unless needed) and cache the composed feed for 30 s.
6. Move the two anime TMDB calls to the AniList failure branch.
7. Add `jsonCached`/`apiError` helpers and migrate one route family at a time.

**Verify:** run the app and watch the network panel for `/f1` (expect one schedule request per view, not three) and `/api/live` (expect the same payload with a shallower server path); re-run the existing suites.

### Phase 3 — structural refactors (incremental, one PR each)

1. Snapshot `getSeasonPayload` for 2–3 seasons, then split `assemble()` into section builders.
2. Split `f1.ts` into `f1-schedule`, `f1-results`, `f1-telemetry`.
3. Extract pure shaping out of `analytics.tsx` / `pace-views.tsx` / `race-views.tsx`.
4. Decide the `ServerPanel` ownership and consolidate the card presentation.
5. Add ESLint with the unused-vars rule; keep `knip` in CI.

---

## Risk register

| Change | Risk | Why | Mitigation |
|---|---|---|---|
| Delete orphan screens | Very low | no importers | grep + `tsc` + visual pass on Rankings |
| Delete weekend endpoint | Low | possible external caller | check access logs; no docs reference |
| Delete dead CSS | Low | dynamic class names could hide usage | dynamic-pattern grep done; screenshot `/cricket` |
| Remove games fields | Very low | no reader today | choose delete vs parser wiring explicitly |
| Countdown consolidation | Medium-low | AT copy + seconds visibility differ | parameterize both; unit test split |
| Session-end consolidation | Medium | changes live/ended boundaries | table tests before/after; pick 3h |
| Schedule single-fetch | Medium | year selector + session hand-off | move year into provider; test preset flow |
| `/api/live` slimming | Medium | cricket grace window needs `endedAt` | keep scorecard branch; existing tests |
| `assemble()` split | Medium | 568-line pure logic, weak tests | snapshot payloads first |

---

## Appendix — reproducibility

The audit was produced with throwaway scripts under `.tmp/` (gitignored):

- `audit-graph.mjs` — App Router reachability + unreferenced exports.
- `audit-routes.mjs` — API route references (including template-string callers).
- `audit-components.mjs` — component import counts + duplicate exported names.
- `audit-symbols.mjs` / `audit-export-usage.mjs` — per-symbol reference counts (definition-only vs internal-only).
- `audit-css.mjs` / `audit-css-lines.mjs` — CSS selector usage and dead-rule line counts.
- `audit-assets.mjs` — public asset references.

Re-run them after Phase 1; several “unused” symbols will change state once the orphan screens are gone.
