# Reelhouse — Phase 3 (backend activation + real playback)

Phase 3 turns **on** the Supabase backend that Phase 2 shipped as dormant code,
and validates it end-to-end. It changes **no application code** — the code
already degrades gracefully, so activation is *configuration + verification*.

> **Which "Phase 2 / 3"?** `docs/phase-2.md` calls the Supabase *code* "Phase 2
> (backend)". The project's working gate model calls *activating and validating*
> that backend **Phase 3**. This document is the working-gate Phase 3.

## What Phase 3 is — and isn't

- **In scope:** stand up a hosted Supabase project, apply the schema, wire two
  public env vars, and verify accounts + server-side persistence + row-level
  security + the one-time `localStorage` → server migration, end to end.
- **Out of scope (hard project rule):** a "real" (non-CC) streaming source.
  There is no licensed provider, and Reelhouse is **authorized / Creative-Commons
  only**. The `VIDEO_PROVIDER_*` seam in `src/lib/providers.ts` stays unused and
  playback continues to serve the bundled CC demo clip. Never wire an
  unauthorized source, scraper, or DRM-circumvention endpoint.

## Prerequisites

- The app already runs (`npm run dev`) in local mode.
- **No Docker or Supabase CLI required** for this hosted path.

## Activation steps

### 1. Create the project
Sign in at <https://supabase.com> → **New project**. Wait for provisioning to
finish.

### 2. Apply the schema
Dashboard → **SQL Editor** → New query → paste the entire contents of
`supabase/migrations/0001_init.sql` → **Run**. Confirm "Success". This creates
`profiles`, `media`, `episodes`, `watchlist`, `watch_history`,
`playback_events`, the new-user trigger, and all RLS policies.

_CLI alternative:_ `supabase link --project-ref <ref>` then `supabase db push`.

### 3. Auth settings (matters for validation)
Dashboard → **Authentication**:
- **Email** provider enabled (default).
- **"Confirm email"** defaults to **ON** — `signUp` then returns *no session*
  until the user clicks an email link. `LoginForm` handles both modes (it shows
  "Account created. Check your email to confirm…" when confirmation is required).
  For a fast local validation either **turn Confirm email OFF** (immediate
  session on sign-up) or keep it on and confirm via a real inbox.
- If you keep confirmation on, set **Site URL** to `http://localhost:3000` under
  URL Configuration.

### 4. Wire the env vars
Fill the two placeholders already present in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```
Both come from Dashboard → **Project Settings → API**. The `service_role` key is
optional and must **never** carry a `NEXT_PUBLIC_` prefix.

**Restart `npm run dev`.** `NEXT_PUBLIC_` values are inlined at build time, so a
running dev server won't see them until restarted.

### 5. End-to-end verification checklist

| # | Check | Expected |
|---|---|---|
| 1 | Navbar | A **Sign in** control now appears (hidden in local mode). |
| 2 | Sign up | Confirmation OFF → signed in immediately; ON → "check your email", then confirm + sign in. |
| 3 | `profiles` row | Table editor → `profiles` has a row for the new user (created by the `on_auth_user_created` trigger). |
| 4 | Watchlist persist | Add a title to **My List** → a row appears in `watchlist` (`media_snapshot` populated). Reload → still there. Sign in as the same user in another browser → present (server-backed, cross-device). |
| 5 | Progress persist | Play a few seconds → `watch_history` row with `position_seconds`; "Continue watching" shows it; resume returns to position. |
| 6 | Remove / clear | Removing one history item (`DELETE /api/history?media_id=…`) and "Clear history" both reflect server-side. |
| 7 | Analytics | `playback_events` receives append-only rows on play/pause/seek/ended. |
| 8 | Sign out → local | Sign out → app reverts to anonymous `localStorage` mode and still works. |

### 6. One-time migration + owner-marker (the delicate part)
1. **Migration up:** In a fresh browser profile, while **signed out**, add a
   couple of watchlist items and watch a few seconds (writes `localStorage`).
   Then **sign in for the first time**. Expected: local watchlist/progress
   **merge up** (watchlist = union by id; progress = newest-`updatedAt` wins) and
   `reelhouse:owner` is set to your user id. Verify the rows exist server-side.
2. **Bleed protection:** Sign out, then sign in as a **different** user in the
   same browser. Expected: user A's leftover local data is **not** pushed into
   user B's account — the owner marker no longer matches, so local is ignored and
   replaced by B's server state.

### 7. RLS verification
Confirm a signed-in user reads/writes only their own rows:
- Create two accounts with distinct watchlist items; confirm each
  `GET /api/watchlist` returns only that user's items.
- Or, in the SQL editor, confirm the policies exist: `watchlist: owner all`,
  `history: owner all`, `events: owner read` / `events: owner insert`,
  `profiles: self read` / `self write`, `media/episodes: public read`.

## Rollback / degrade
Blank both `NEXT_PUBLIC_SUPABASE_*` values (or comment them) and restart
`npm run dev`. The app returns to Phase 1 local mode (middleware passthrough,
factories return `null`, routes 401, library on `localStorage`). No server-side
data loss.

## Audit notes (static review of the never-run path)
- **Apply the schema _before_ the first sign-in.** `fetchServerState()` treats a
  non-401 server error (e.g. missing tables → 500) as an *empty* server, which
  would set the owner marker and try to push local data before the DB is ready.
  It's best-effort and reconciles on the next hydrate, but applying the schema
  first avoids the noise.
- **`watch_history` upsert** targets the `(user_id, media_id, episode_key)`
  unique constraint, where `episode_key` is a generated column — valid PostgREST
  usage; check #5 confirms the first progress save succeeds.
- **Secrets:** only URL + anon key are browser-exposed (safe under RLS). The
  service-role key, TMDB key, and OpenSubtitles credentials stay server-only.

## After validation
- Mark Phase 3 activation complete in `PROGRESS.md`.
- Playback stays CC-only until a genuinely licensed provider exists; only then,
  wire it via `VIDEO_PROVIDER_*` as a separate, isolated step.
