# Cricket data

Status: **28 October 2026**. The `/cricket` page runs on free, keyless public
feeds. There is no demo dataset and no sample-data fallback.

## Sources

| Feature | Source | Transport | Cache |
| --- | --- | --- | --- |
| India men's and women's fixtures | BCCI match feed | `/api/bff/feed/v1/matches/list` | 60 s |
| Results and scorecards | BCCI match feed | `/api/bff/feed/v1/matches/{gid}/scorecard` | 2 min (5 min edge) |
| Live scores | BCCI live feed | `/api/bff/feed/v1/matches/live` | 30 s |
| Player directory | BCCI CMS | `/api/bff/cms/players-directory` | 12 h |
| Player profile facts | BCCI player page | server-rendered profile page | 24 h in-process |
| ICC team and player rankings | ICC rankings page | server-rendered RSC payload | 6 h |
| ICC player directory (headshots) | ICC stats feed | `/cricket/v1/player` | 6 h |

BCCI has no published API key for these routes; the page calls the same public
feeds its own match centre reads. ICC has no public ranking JSON; its table data
is parsed from the RSC payload on the public rankings page. Its player directory
is the public feed behind ICC's own player search. Every parser returns `null`
or an empty list when the source changes, so a section can be empty but never
fabricated.

## Routes

| Route | Returns | Cache |
| --- | --- | --- |
| `/api/cricket?gender=men\|women` | Fixtures, results and player directory | `s-maxage=30`, SWR 90 |
| `/api/cricket/rankings?gender=men\|women` | ICC team, batting, bowling and all-rounder tables | `s-maxage=600`, SWR 6 h |
| `/api/cricket/scorecard?gid=…` | Batting, bowling, extras and fall of wickets | 15 s live / 10 min finished |
| `/api/cricket/player?gid=…&slug=…` | Born date, batting and bowling style, debut | 1 h edge, 24 h in-process |
| `/api/cricket/player-photos` | Verified ICC headshots for the player directory | 6 h edge |

The dashboard route deliberately excludes rankings so the countdown and match
centre are not delayed by the larger ICC payload. The page polls the dashboard
route every 60 seconds; scorecards and player facts are fetched on demand.

## Live playback

`/watch/cricket` is the cricket counterpart of `/watch/f1`: same stage, dock and
Servers panel, no episodes, no watchlist and no resumable history. The hero's
**Watch Live** button opens it during the channel's live window (15 minutes
before the scheduled start through the session end).

Servers are environment-backed, up to five slots:

```sh
CRICKET_SERVER_1_NAME=Server 1
CRICKET_SERVER_1_URL=https://example.com/live
CRICKET_SERVER_1_MEDIA_TYPES=cricket
```

`NAME` and `URL` are the only required values. `MEDIA_TYPES` may be omitted or
must include `cricket`; `ENABLED` defaults to on; `PRIORITY` is lower first.
Without explicit priorities, Server 2 is preferred because it is the currently
healthy source; the other slots remain visible for source-side recovery. A
configured slot with a missing/unsafe URL stays visible in the panel but cannot
be selected, so a typo is visible rather than silent.

The watch page never frames a source directly. Each candidate is the same-origin
`/api/cricket/embed?url=…`, which fetches only an allowlisted origin — the
configured servers plus the known nested `newball.pages.dev` /
`dekhobhai.pages.dev` players — and then serves one of three documents:

1. **Player page** — the source carries a `CONFIG = { streamUrl, keyId, key,
   cookieUrl }` object, so the route serves its own Shaka page with that
   manifest, the ClearKey pair and the signed-URL token filter. None of the
   source's HTML or JavaScript reaches the browser.
2. **Shell frame** — the page is only a full-bleed iframe around another
   allowlisted page (dekhobhai/HIN wraps newball/HIN1HD). The route serves a
   first-party frame around the nested URL, so the nested player page is not
   trapped in the shell's sandbox.
3. **Sanitized page** — anything else (channel indexes). The source's
   `confirm`/`alert`/`prompt` shim, its neutralized `isSandboxedEnv()` probe, its
   removed ad scripts and hidden Telegram banners are kept, and the result is
   returned with `Cache-Control: no-store` and
   `Content-Security-Policy: sandbox allow-scripts`.

The first two matter because the streams are ClearKey-encrypted: Encrypted
Media Extensions are refused on a unique origin, which is exactly what a
sandboxed proxy is, so the source's own player can never start there (Shaka
error 6002, "EME use is not allowed on unique origins"). The first-party player
is our markup, so it is served without the sandbox and EME works. The watch
page frames every cricket embed with `sandbox="allow-scripts
allow-same-origin"` — no popups, modals, forms, downloads or top navigation, but
a real origin. The sanitized third-party fallback stays isolated by its own
response policy, which the iframe attribute cannot lift.

A source can still be down on its own. If a server shows a player but never
starts, check whether the source's own token endpoint has rotated; the proxy is
not the cause.

## Composition

- `src/lib/cricket/providers/bcci.ts` — fixture, live, scorecard, player
  directory and player-page parsing.
- `src/lib/cricket/providers/icc-rankings.ts` — ICC RSC payload parser.
- `src/lib/cricket/providers/icc-players.ts` — ICC player-directory headshots.
- `src/lib/cricket/shared.ts` — client-safe formatters and selectors.
- `src/lib/cricket/index.ts` — server-only dashboard and rankings composition.
- `src/components/cricket/` — dashboard, hero, calendar, match centre, rankings
  and player directory.

## Request budget

A cold dashboard read is one fixture page set (current and next season), one
results page set, one live read and one player-directory read. Scorecards and
player profiles are only requested when selected. The BCCI player directory is
capped at 100 active records; the provider metadata reports the full directory
size. The photo index is a separate background read: it intersects the ICC
directory with those 200 records and discards the grey silhouette ICC serves
when it has no portrait.

Next's fetch cache deduplicates requests across visitors on one server instance.
The in-process ICC and player caches are also per instance, so a multi-instance
deployment can duplicate one upstream read per instance.

## Career, head-to-head and team records

The ICC tables publish a rating, not a career. The stats, head-to-head and
compare views therefore use a generated index built from
[Cricsheet](https://cricsheet.org/)'s ball-by-ball international archive
(men's and women's Tests, ODIs and T20Is; 9,968 matches at the 29 October 2026
build).

| Route | Returns | Cache |
| --- | --- | --- |
| `/api/cricket/stats/roster?gender=men\|women` | Active players and teams (`bat`/`bowl`/`all` index lists) | 1 h |
| `/api/cricket/stats/player?index=…` | Career, per-format and season totals | 1 h |
| `/api/cricket/stats/h2h?batter=…&bowler=…` | Every ball the pair faced, dismissal mix, last encounter | 1 h |
| `/api/cricket/stats/team-h2h?a=…&b=…` | All-time match record, by format and last meeting | 1 h |

The index is written by `scripts/build-cricket-stats.py` to
`src/lib/cricket/generated/cricket-stats.json`. Re-run the script after
refreshing the archives in `.tmp/cricsheet`; it downloads the five zip files
itself when they are missing. `next.config.mjs` adds the generated file to the
serverless trace because the reader opens it with `fs` rather than importing it.

Cricsheet names players by initials ("RG Sharma"), which is not what anyone
types into the player picker. `scripts/build-cricket-names.mjs` matches each
short name against the ICC player directory by surname, first initial, country
and gender, and writes the unambiguous expansions to
`src/lib/cricket/generated/player-names.json`. The same entry keeps the ICC id
when ICC publishes a portrait for that player (verified against the
untransformed asset, because the face transform serves a grey silhouette for
players without one). `stats-db.ts` prefers that map for every summary it
returns, so the head-to-head pickers, compare view and player cards all print
and search the everyday name ("Rohit Sharma") and show the official headshot.
Rows that are ambiguous or absent from the ICC directory keep their initials and
monogram. Re-run it after regenerating the stats index:

```sh
node scripts/build-cricket-names.mjs
```

The comparison is deliberately international-only: two players who represent
the same country cannot have faced each other, so the player head-to-head shows
"no recorded meeting" rather than borrowing an IPL match-up. Team records count
completed matches; abandoned and no-result games are kept in their own bucket.
