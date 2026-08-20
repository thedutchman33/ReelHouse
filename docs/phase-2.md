# Reelhouse — Phase 2 (backend)

Phase 2 adds **accounts and server-side persistence** on top of the Phase 1
front end, without breaking the "runs with zero setup" promise.

## Guiding principle: graceful degradation

Phase 2 mirrors the pattern already used for metadata in `src/lib/tmdb.ts`:
a feature turns on **only when its environment variables are present**, and
falls back to the Phase 1 behavior otherwise. Concretely:

| Feature | Configured (env set) | Not configured (blank) |
| --- | --- | --- |
| Metadata | Live TMDB | Built-in mock catalog |
| Accounts | Supabase Auth (sign in / up) | Anonymous, no accounts |
| Watchlist / history / progress | Persisted in Supabase (follows you across devices) | `localStorage` (this browser only) |
| Metadata caching | Next.js fetch Data Cache (built-in); Redis optional (`REDIS_URL`) for a shared cache across instances | Next.js Data Cache (in-process) |

So a fresh clone with no `.env.local` still boots and works exactly like V1.

## Decisions (made autonomously for this phase)

1. **Auth + DB: Supabase** (chosen by the user). Postgres + row-level security +
   built-in auth. Schema lives in `supabase/migrations/0001_init.sql`.
2. **Dev runtime: graceful-degrade** (above). No Docker or hosted account is
   required to run the app; adding Supabase is opt-in.
3. **Framework: stay on Next.js 14.2.35 for Phase 2.** Supabase SSR auth works
   cleanly on the App Router with synchronous `params`/`searchParams`. The
   Next 15.5+/16 + React 19 upgrade (async params) remains **production
   hardening**, tracked in the README's Security notes — it is orthogonal to the
   backend work and best done as its own isolated change.
   > **Update (2026-08-19):** this upgrade has since been completed — the app is
   > now on **Next.js 16.3.1 + React 19.2.8** (async `params`/`searchParams`,
   > `async cookies()`, `middleware`→`proxy`). See PROGRESS.md → "Framework
   > upgrade". The Supabase SSR wiring migrated without issue.
4. **Playback: authorized / Creative-Commons only.** The bundled demo clip stays
   the default. The `VideoProvider` abstraction in `src/lib/providers.ts` already
   exposes a seam (`VIDEO_PROVIDER_BASE`/`KEY`) for a licensed partner. No
   scrapers, unauthorized streams, or DRM circumvention — ever.

## Architecture

```
Browser ──▶ Server Components / Route Handlers ──▶ Supabase (Postgres + Auth)
                     │                                   ▲
                     └── getUser() from cookies ─────────┘   (RLS scopes every row to auth.uid())
```

- `src/lib/supabase/` — client factories:
  - `server.ts` — `createServerClient` bound to Next cookies (Server Components,
    Route Handlers, Server Actions). `import "server-only"`. Returns `null` when
    unconfigured.
  - `client.ts` — `createBrowserClient` (anon key) for client-side session state.
  - `config.ts` — `isSupabaseConfigured()` (mirrors `isLiveMetadata()`).
- **Auth** — middleware to refresh the session cookie; a `/login` route (email
  magic-link or password); sign-out action; a signed-in indicator in the navbar.
- **Persistence API** (analysis §13), all RLS-scoped to the current user:
  - `GET/POST /api/watchlist` (POST body `{action:"add"|"remove", item}`)
  - `GET/POST/DELETE /api/history` (POST `{entry}`; DELETE `?media_id=&season=&episode=` for one, no params to clear all)
  - `POST /api/progress` (append-only `playback_events` analytics)
- **Library store** (`src/lib/library.ts`) — gains a server-sync path: signed in,
  every mutation still writes `localStorage` (the synchronous source the hooks
  read) AND is pushed to the API above; on sign-in the store hydrates from the
  server, merging any anonymous local data up (one-time migration) with
  newest-wins on progress and an owner marker to prevent cross-user bleed on a
  shared browser. Same hook API, so the UI is unchanged. `src/components/auth/
  LibrarySync.tsx` bridges Supabase auth state to the store.
- **Caching** — TMDB responses are cached by **Next.js's built-in fetch Data
  Cache** (`fetch(url, { next: { revalidate } })` in `tmdb.ts`), which persists
  across requests and dedupes within them. That already satisfies the metadata
  caching requirement in both modes, so no separate in-process cache module is
  shipped. For a **shared** cache across multiple server instances, wire a Redis
  client keyed by `REDIS_URL` — the documented scale-out path.

## Activation (when you're ready to turn accounts on)

1. Create a project at https://supabase.com.
2. **Run the schema:** open Supabase → SQL editor → paste
   `supabase/migrations/0001_init.sql` → Run. (Or `supabase db push` via the CLI.)
3. Copy `.env.local.example` → `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (and optionally `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`).
4. Restart `npm run dev`. A "Sign in" control appears; your list/history now
   persist to the database. Existing `localStorage` data can be migrated on first
   sign-in (one-time upsert).

## Security invariants (unchanged from V1)

- Service-role key and any provider credentials are **server-only** — never
  `NEXT_PUBLIC_`, never imported by a client component.
- Every user-data table has **row-level security**; the browser only ever holds
  the anon key, which cannot read another user's rows.
- Playback remains authorized-only.

## Status

- [x] Env config (`.env.local.example`) — Supabase + Redis vars, documented.
- [x] Database schema + RLS (`supabase/migrations/0001_init.sql`), incl.
      denormalized `media_snapshot`/`episode_snapshot` so per-user rows render
      without a service-role key.
- [x] Install `@supabase/supabase-js` + `@supabase/ssr`.
- [x] Supabase client factories (`src/lib/supabase/{config,server,client}.ts`).
- [x] Auth: session middleware + `/login` + sign-out + navbar indicator
      (`AuthStatus`).
- [x] Persistence API routes (`/api/watchlist`, `/api/history`, `/api/progress`).
- [x] Library store server-sync path + one-time localStorage → server migration
      (`LibrarySync`, owner-marker bleed protection).
- [x] Caching: satisfied by Next.js's fetch Data Cache; Redis documented as the
      shared/scale-out path (no separate module shipped — see Caching above).

Verified: `npm run typecheck` and `npm run build` pass, and the app runs in
degraded (local) mode with no Supabase env — identical to Phase 1.

> All Phase 2 code is graceful: with no `.env.local` the middleware is a
> passthrough, the client factories return `null`, the API routes 401, and the
> library store stays on `localStorage` — so a fresh clone still behaves exactly
> like V1.
