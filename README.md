# Reelhouse

A streaming **discovery & playback** web app — a warm, film‑house‑themed front end for browsing films and series, building a watchlist, and resuming what you were watching. It runs entirely on your machine with **zero external accounts or API keys**, using a built‑in mock catalog. Live [TMDB](https://www.themoviedb.org/) metadata and Supabase‑backed accounts/library are wired behind environment variables, and turn on as soon as you supply them.

> Reelhouse is original branding. It is **not** affiliated with, and does not use the name or assets of, any existing streaming site. All catalog titles, artwork, and copy in mock mode are invented.

---

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. That's it — no `.env` file, no API key, no database. The app boots against the mock catalog and works **fully offline**, including video playback — the sample clips are bundled in the repo (`public/media/`) and served from the app's own origin, so nothing on the watch page depends on a remote host.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (hot reload) on port 3000. |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build (run `build` first). |
| `npm run typecheck` | `tsc --noEmit` — full TypeScript check, no output. |

Requires **Node 20.9+** (Node 20 LTS or newer) — Next.js 16 dropped Node 18.

---

## What's implemented (V1)

- **Home** — auto‑rotating hero, "Continue Watching" rail, and curated rows (Trending, a ranked Top 10, New, genre rows, etc.).
- **Browse** — `/browse`, `/movies`, and `/tv-shows` with a filter bar (content type, genre, year, sort). Every option maps to data the metadata layer can actually serve.
- **Search** — debounced, server‑backed search at `/search` with genre suggestion chips.
- **Detail pages** — `/movie/[id]` and `/tv/[id]` with backdrop hero, cast, and "More Like This". TV pages add a **season selector and episode list** with per‑episode progress.
- **Player** — `/watch/[type]/[id]`: an HTML5 player that **saves and restores playback position** (per movie and per episode), shows an "up next" prompt for series, and has error/retry handling.
- **Personal library** — watchlist, watch history, and continue‑watching, persisted to **Supabase** when configured and to **`localStorage`** otherwise (synced across browser tabs). Find it under **My List**.
- **Metadata** — a mock catalog by default; a live TMDB path behind an env var (see below).
- **Playback** — bundled, freely‑licensed **sample clips** only, plus five configurable provider slots that ship empty (see [Playback & legality](#playback--legality)).

Deterministic SVG placeholder artwork is generated for every title, so the UI looks complete without downloading a single image.

---

## Metadata: mock now, real later

By default the app uses the offline mock catalog in `src/lib/mock.ts`. To switch to **live TMDB** data, copy the example env file and add a key:

```bash
cp .env.local.example .env.local
```

```dotenv
# .env.local
TMDB_API_KEY=your_tmdb_v3_key_or_v4_read_access_token
# optional: TMDB_IMAGE_BASE=https://image.tmdb.org/t/p
```

Restart the dev server. When `TMDB_API_KEY` is present the app fetches trending/detail/search from TMDB; when it's absent it silently falls back to mock. The home page shows a small banner while in mock mode so it's never ambiguous which one you're seeing.

Both TMDB v3 API keys and v4 read‑access tokens (JWTs) are supported automatically.

> **Credentials stay on the server.** `src/lib/tmdb.ts` and `src/lib/providers.ts` are marked `import "server-only"`, so the TMDB key (and any future video‑provider credentials) can never be bundled into client‑side JavaScript. The browser talks to metadata/playback only through the server (`/api/search`, `/api/playback`, and Server Components).

---

## Playback & legality

Reelhouse is a **discovery** app with a **legitimate** playback layer. The player is fed by a provider abstraction (`src/lib/providers.ts`) that, with nothing connected, returns **only** Creative‑Commons sample clips (Blender Foundation open movies such as *Big Buck Bunny*, CC‑BY). The clips are **bundled in the repo** under `public/media/` and served from the app's own origin — so playback works fully offline. Each source is clearly labeled **"Licensed sample"** in the UI.

Alongside that built‑in surface there are **five configurable provider slots** (`VIDEO_PROVIDER_1_*` … `_5_*`). They ship **completely empty**: an unconfigured slot is never listed, so the provider picker is not rendered at all until you configure one. Filling a slot in is an operator decision that requires a provider you are **authorized** to embed — see `docs/video-provider-setup.md`. No third‑party service is referenced, bundled, or scaffolded anywhere in this repo.

---

## Project structure

```
src/
  proxy.ts                    # Next 16 request proxy (Supabase session refresh)
  app/                        # Next.js App Router
    layout.tsx                # Root shell: Navbar + Footer, metadata, theme color
    page.tsx                  # Home (hero + continue-watching + rows)
    error.tsx                 # Error boundary
    not-found.tsx             # 404
    globals.css               # Theme tokens + base + component classes
    browse/page.tsx           # Browse everything (type/genre/year/sort filters)
    movies/page.tsx           # Movies only (same filter bar)
    tv-shows/page.tsx         # Series only (same filter bar)
    movie/[id]/page.tsx       # Movie detail
    tv/[id]/page.tsx          # TV detail (seasons/episodes)
    watch/[type]/[id]/        # Player page (reads ?t / ?s / ?e)
    my-list/page.tsx          # Watchlist + history
    search/page.tsx           # Search page
    login/page.tsx            # Sign in / sign up (Supabase)
    api/
      search/route.ts         # GET /api/search?q=
      playback/route.ts       # GET /api/playback?type=&id=&season=&episode=
      watchlist/ history/ progress/   # Library sync (Supabase, RLS-scoped)
      subtitles/search|download       # OpenSubtitles (credentials server-side)
  components/
    auth/ brand/ browse/ common/ detail/ hero/ media/
    navigation/ playback/ player/ search/
  lib/
    mock.ts                   # Offline catalog (original invented titles)
    tmdb.ts                   # Metadata: mock + live TMDB (server-only)
    browse.ts                 # Filter/sort model shared by the browse routes
    providers.ts              # Playback source abstraction (server-only)
    playback/                  # Provider slots: registry, manager, adapters,
                              #   built-in surface, progress (server-only entry)
    supabase/                 # Separated browser / server / proxy clients
    library.ts                # Watchlist/history/progress (Supabase + localStorage)
    env.ts config-summary.ts  # Env validation + boot summary
    use-popover.ts            # Shared popover/roving-focus behaviour
    utils.ts                  # ids, formatting, SVG placeholder art
  types/index.ts              # Shared domain types
public/
  favicon.svg
  media/                      # Bundled Creative-Commons sample clips + subtitles,
                              #   served same-origin; plus an embed test fixture
```

### Notable technical choices

- **Next.js 16 (App Router) + React 19.** Route `params`/`searchParams` are async (awaited), server helpers await `cookies()`, and the request middleware uses the Next 16 `proxy` file convention (`src/proxy.ts`). Upgraded from a deliberately-pinned Next 14 once V1 was otherwise stable — see [Security notes](#security-notes).
- **Server vs. Client split.** Secrets‑touching modules are `server-only`. The library store is a client module built on `useSyncExternalStore` with an empty server snapshot, so `localStorage` state never causes hydration mismatches.
- **Offline‑first.** Plain `<img>` with an `onError` fallback to generated SVG art (rather than `next/image`) keeps the app fully functional with no network and no remote image hosts.
- **Theming.** Tailwind color tokens are CSS variables (space‑separated RGB triplets), which keeps Tailwind's `/opacity` syntax working against a single source of truth in `globals.css`.

---

## Security notes

- **Dependencies are on current majors.** `next` **16.3.1** (Turbopack), `react`/`react-dom` **19.2.8**, with `postcss` pinned (via `overrides`, including Next's bundled copy) to a version that clears its advisories. Upgrading off Next 14 cleared the advisories that previously had no in‑line patch — their fix landed only in **Next ≥ 15.5.21 / 16.x** (rewrites SSRF, image‑optimizer DoS, i18n/CSP‑nonce handling, WebSocket upgrades, custom‑server Server Actions). The migration was bounded: async `params`/`searchParams`, `async cookies()`, and the `middleware`→`proxy` rename.
- **After any dependency change, run `npm audit`** and prefer targeted patches. Avoid `npm audit fix --force`, which can pull in unintended majors.
- **Secrets stay server‑side.** `src/lib/tmdb.ts` and `src/lib/providers.ts` are `server-only`; the only browser‑exposed values are the Supabase project URL + anon key, which are safe under row‑level security.

---

## Not in this version

Intentionally out of scope (candidate follow‑ups): dedicated profile/settings pages, per‑route loading skeletons for live‑metadata latency (the `Skeleton` components exist in `src/components/common` and are ready to wire up), and any real video provider — the five slots stay empty until an authorized provider is supplied.
