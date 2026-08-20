-- Reelhouse — Phase 2 initial schema (PRD §4 data model)
-- ---------------------------------------------------------------------------
-- Apply this in the Supabase SQL editor (Dashboard → SQL → New query → paste →
-- Run), or via the Supabase CLI (`supabase db push` after `supabase link`).
--
-- Design notes:
--   * Auth is handled by Supabase's built-in `auth.users`. We keep an app-level
--     `profiles` row 1:1 with each auth user (PRD "users").
--   * `media` / `episodes` are an OPTIONAL local cache of TMDB metadata so that
--     watchlist/history rows can be rendered without a TMDB round-trip. They are
--     provider-agnostic and hold only public catalog metadata (no media files).
--   * All per-user tables (`watchlist`, `watch_history`, `playback_events`) are
--     protected by ROW-LEVEL SECURITY: a signed-in user can only ever see and
--     mutate their OWN rows. This is what makes the public anon key safe to ship
--     to the browser.
-- ---------------------------------------------------------------------------

-- Needed for gen_random_uuid().
create extension if not exists "pgcrypto";

-- ------------------------------- profiles ----------------------------------
-- One row per auth user. Created automatically by the trigger below on signup.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------- media cache -------------------------------
-- Keyed by the app's internal id, e.g. 'movie-603' / 'tv-1399'.
create table if not exists public.media (
  id           text primary key,
  tmdb_id      integer not null,
  type         text not null check (type in ('movie', 'tv')),
  title        text not null,
  overview     text,
  poster_url   text,
  backdrop_url text,
  rating       numeric(4,1),
  release_date text,
  genres       text[] not null default '{}',
  updated_at   timestamptz not null default now(),
  unique (type, tmdb_id)
);

-- ------------------------------- episodes ----------------------------------
create table if not exists public.episodes (
  id             text primary key,             -- e.g. 'tv-1399:s1e1'
  media_id       text not null references public.media (id) on delete cascade,
  season_number  integer not null,
  episode_number integer not null,
  title          text,
  overview       text,
  still_url      text,
  air_date       text,
  runtime        integer,
  unique (media_id, season_number, episode_number)
);

-- ------------------------------- watchlist ---------------------------------
create table if not exists public.watchlist (
  user_id        uuid not null references auth.users (id) on delete cascade,
  media_id       text not null,
  -- Denormalized MediaSummary snapshot so a row renders without a `media`-table
  -- join or a TMDB round-trip. This keeps watchlist fully functional with only
  -- the anon key + RLS (no service-role dependency). The normalized `media`
  -- cache above remains available for future server-side enrichment.
  media_snapshot jsonb not null default '{}'::jsonb,
  added_at       timestamptz not null default now(),
  primary key (user_id, media_id)
);

-- ----------------------------- watch_history -------------------------------
-- One row per (user, media, episode). NULL season/episode => a movie.
-- `episode_key` is a generated, non-null discriminator so the unique index
-- treats "no episode" as a single value (NULLs would otherwise all be distinct).
create table if not exists public.watch_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  media_id         text not null,
  season_number    integer,
  episode_number   integer,
  episode_key      text generated always as (
                     coalesce(season_number::text, '') || ':' || coalesce(episode_number::text, '')
                   ) stored,
  -- Denormalized snapshots (see watchlist note). `media_snapshot` renders the
  -- row; `episode_snapshot` carries the EpisodeRef (title etc.) for TV.
  media_snapshot   jsonb not null default '{}'::jsonb,
  episode_snapshot jsonb,
  position_seconds double precision not null default 0,
  duration_seconds double precision,
  completed        boolean not null default false,
  -- The client is the source of truth for "when watched", so the app sets this
  -- explicitly (no touch trigger) — original timestamps survive the one-time
  -- localStorage → server migration on first sign-in.
  updated_at       timestamptz not null default now(),
  unique (user_id, media_id, episode_key)
);

create index if not exists watch_history_user_updated_idx
  on public.watch_history (user_id, updated_at desc);

-- ----------------------------- playback_events -----------------------------
-- Append-only analytics stream (PRD §4). Useful for "continue watching" and
-- future recommendations. Never updated, only inserted.
create table if not exists public.playback_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  media_id         text not null,
  season_number    integer,
  episode_number   integer,
  event_type       text not null check (event_type in ('play','pause','ended','seek','progress')),
  position_seconds double precision,
  created_at       timestamptz not null default now()
);

create index if not exists playback_events_user_created_idx
  on public.playback_events (user_id, created_at desc);

-- ------------------------- new-user profile trigger ------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------- updated_at trigger ----------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

-- NOTE: watch_history.updated_at is set explicitly by the application (it is the
-- source of truth for "when watched"), so it deliberately has NO touch trigger.
drop trigger if exists touch_watch_history on public.watch_history;

-- ============================ ROW-LEVEL SECURITY ===========================
alter table public.profiles        enable row level security;
alter table public.watchlist       enable row level security;
alter table public.watch_history   enable row level security;
alter table public.playback_events enable row level security;
-- media/episodes are public catalog metadata: RLS on, readable by anyone,
-- writable only by the service role (which bypasses RLS).
alter table public.media           enable row level security;
alter table public.episodes        enable row level security;

-- profiles: a user may read/update only their own profile.
drop policy if exists "profiles: self read"   on public.profiles;
drop policy if exists "profiles: self write"  on public.profiles;
create policy "profiles: self read"  on public.profiles for select using (auth.uid() = id);
create policy "profiles: self write" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- watchlist: full CRUD limited to the owner.
drop policy if exists "watchlist: owner all" on public.watchlist;
create policy "watchlist: owner all" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- watch_history: full CRUD limited to the owner.
drop policy if exists "history: owner all" on public.watch_history;
create policy "history: owner all" on public.watch_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- playback_events: owner may insert and read their own; no update/delete.
drop policy if exists "events: owner read"   on public.playback_events;
drop policy if exists "events: owner insert" on public.playback_events;
create policy "events: owner read"   on public.playback_events for select using (auth.uid() = user_id);
create policy "events: owner insert" on public.playback_events for insert with check (auth.uid() = user_id);

-- media/episodes: world-readable catalog metadata (writes go through the
-- service-role key on the server, which bypasses RLS).
drop policy if exists "media: public read"    on public.media;
drop policy if exists "episodes: public read" on public.episodes;
create policy "media: public read"    on public.media    for select using (true);
create policy "episodes: public read" on public.episodes for select using (true);
