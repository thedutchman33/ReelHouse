-- Reelhouse Music — Spotify connection, imports and listening profile
-- ---------------------------------------------------------------------------
-- Apply after 0004_music_preferences.sql in the Supabase SQL editor or CLI.
--
-- Existing Reelhouse library tables remain the source of truth for the user's
-- visible library. Imported Spotify playlists are mirrored into those tables
-- (source = 'spotify') so the existing music UI does not need a second library.
--
-- Spotify OAuth tokens are encrypted by the Kotlin backend with AES-GCM before
-- they reach Postgres. The spotify_* tables have RLS enabled and deliberately
-- no browser-facing policies: only the backend service role can read them.
-- Never expose SUPABASE_SERVICE_ROLE_KEY or MUSIC_TOKEN_ENCRYPTION_KEY to the
-- browser. Imported listening history and searches are private in the same way.
--
-- This migration does not delete, rename or rewrite existing music data.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --------------------------- library provenance ----------------------------
alter table public.music_playlists
  add column if not exists source text not null default 'reelhouse',
  add column if not exists external_id text,
  add column if not exists external_owner text,
  add column if not exists image_url text,
  add column if not exists imported_at timestamptz;

alter table public.music_playlists
  drop constraint if exists music_playlists_source_check;
alter table public.music_playlists
  add constraint music_playlists_source_check
  check (source in ('reelhouse', 'spotify'));

create unique index if not exists music_playlists_external_idx
  on public.music_playlists (user_id, source, external_id)
  where external_id is not null;

alter table public.music_liked_tracks
  add column if not exists source text not null default 'reelhouse',
  add column if not exists external_id text;
alter table public.music_saved_albums
  add column if not exists source text not null default 'reelhouse',
  add column if not exists external_id text;
alter table public.music_followed_artists
  add column if not exists source text not null default 'reelhouse',
  add column if not exists external_id text;

-- -------------------------- playback history ------------------------------
-- Reelhouse playback events, independent of the seven snapshot tables. The
-- player only needs the existing recently-played row; this table is for deeper
-- stats and is owner-readable through RLS.
create table if not exists public.listening_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  track_id           text not null,
  track_snapshot     jsonb not null default '{}'::jsonb,
  played_at          timestamptz not null default now(),
  duration_played_ms integer not null default 0 check (duration_played_ms >= 0),
  completed          boolean not null default false,
  source             text not null default 'reelhouse',
  fingerprint        text
);

create unique index if not exists listening_history_user_fingerprint_idx
  on public.listening_history (user_id, fingerprint)
  where fingerprint is not null;

create index if not exists listening_history_user_played_idx
  on public.listening_history (user_id, played_at desc);
create index if not exists listening_history_user_track_idx
  on public.listening_history (user_id, track_id);

alter table public.listening_history enable row level security;
drop policy if exists "listening history: owner all" on public.listening_history;
create policy "listening history: owner all" on public.listening_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------------- Spotify connection ----------------------------
create table if not exists public.spotify_connections (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  spotify_user_id          text not null,
  display_name             text,
  country                  text,
  product                  text,
  scopes                   text[] not null default '{}'::text[],
  access_token_ciphertext  text not null,
  refresh_token_ciphertext text not null,
  token_expires_at         timestamptz not null,
  connected_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists touch_spotify_connections on public.spotify_connections;
create trigger touch_spotify_connections
  before update on public.spotify_connections
  for each row execute function public.touch_updated_at();

alter table public.spotify_connections enable row level security;
revoke all on table public.spotify_connections from anon, authenticated;

-- --------------------------- Spotify playlists ----------------------------
create table if not exists public.spotify_playlists (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  spotify_playlist_id text not null,
  name                text not null,
  description         text not null default '',
  artwork_url         text,
  owner_name          text,
  owner_id            text,
  track_count         integer not null default 0 check (track_count >= 0),
  snapshot_id         text,
  is_public           boolean,
  is_collaborative    boolean,
  origin              text not null default 'oauth' check (origin in ('oauth', 'import')),
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, spotify_playlist_id)
);

create index if not exists spotify_playlists_user_idx
  on public.spotify_playlists (user_id, updated_at desc);

alter table public.spotify_playlists enable row level security;
revoke all on table public.spotify_playlists from anon, authenticated;

create table if not exists public.spotify_playlist_tracks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  playlist_id        uuid not null references public.spotify_playlists (id) on delete cascade,
  spotify_track_id   text not null,
  spotify_uri        text,
  position           integer not null check (position >= 0),
  track_name         text not null,
  artist_names       text[] not null default '{}'::text[],
  album_name         text,
  artwork_url        text,
  duration_ms        integer not null default 0 check (duration_ms >= 0),
  added_at           timestamptz,
  is_local           boolean not null default false,
  is_available       boolean not null default true,
  match_status       text not null default 'pending'
    check (match_status in ('pending', 'matched', 'partial', 'unmatched', 'unavailable')),
  youtube_video_id   text,
  match_confidence   numeric(5,4),
  match_candidates   jsonb not null default '[]'::jsonb,
  youtube_track      jsonb,
  created_at         timestamptz not null default now(),
  unique (playlist_id, position)
);

create index if not exists spotify_playlist_tracks_user_idx
  on public.spotify_playlist_tracks (user_id, playlist_id, position);
create index if not exists spotify_playlist_tracks_pending_idx
  on public.spotify_playlist_tracks (user_id, match_status)
  where match_status in ('pending', 'partial');

alter table public.spotify_playlist_tracks enable row level security;
revoke all on table public.spotify_playlist_tracks from anon, authenticated;

create table if not exists public.spotify_saved_tracks (
  user_id            uuid not null references auth.users (id) on delete cascade,
  spotify_track_id   text not null,
  spotify_uri        text,
  track_name         text not null,
  artist_names       text[] not null default '{}'::text[],
  album_name         text,
  artwork_url        text,
  duration_ms        integer not null default 0 check (duration_ms >= 0),
  added_at           timestamptz,
  match_status       text not null default 'pending'
    check (match_status in ('pending', 'matched', 'partial', 'unmatched', 'unavailable')),
  youtube_video_id   text,
  match_confidence   numeric(5,4),
  match_candidates   jsonb not null default '[]'::jsonb,
  youtube_track      jsonb,
  last_synced_at     timestamptz not null default now(),
  primary key (user_id, spotify_track_id)
);

-- Supports re-running 0005 on a project where this table was created by an
-- earlier version of the migration.
alter table public.spotify_saved_tracks
  add column if not exists match_candidates jsonb not null default '[]'::jsonb;

alter table public.spotify_saved_tracks enable row level security;
revoke all on table public.spotify_saved_tracks from anon, authenticated;

-- ---------------------------- track matching ------------------------------
create table if not exists public.spotify_track_matches (
  user_id             uuid not null references auth.users (id) on delete cascade,
  spotify_track_id    text not null,
  youtube_video_id    text,
  youtube_title       text,
  youtube_artist      text,
  youtube_album       text,
  youtube_duration_ms integer,
  confidence          numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  status              text not null default 'pending'
    check (status in ('pending', 'matched', 'partial', 'unmatched', 'unavailable')),
  candidates          jsonb not null default '[]'::jsonb,
  youtube_track       jsonb,
  manual              boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (user_id, spotify_track_id)
);

create index if not exists spotify_track_matches_user_status_idx
  on public.spotify_track_matches (user_id, status);

alter table public.spotify_track_matches enable row level security;
revoke all on table public.spotify_track_matches from anon, authenticated;

-- ----------------------------- import jobs --------------------------------
create table if not exists public.spotify_import_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'processing'
    check (status in ('processing', 'preview', 'completed', 'failed', 'cancelled')),
  archive_names text[] not null default '{}'::text[],
  categories    text[] not null default '{}'::text[],
  stats         jsonb not null default '{}'::jsonb,
  errors        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists spotify_import_jobs_user_idx
  on public.spotify_import_jobs (user_id, created_at desc);

alter table public.spotify_import_jobs enable row level security;
revoke all on table public.spotify_import_jobs from anon, authenticated;

-- --------------------------- imported searches ----------------------------
create table if not exists public.spotify_imported_searches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  job_id       uuid references public.spotify_import_jobs (id) on delete set null,
  query        text not null check (char_length(query) between 1 and 500),
  searched_at  timestamptz,
  platform     text,
  result_uri   text,
  fingerprint  text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists spotify_imported_searches_user_idx
  on public.spotify_imported_searches (user_id, searched_at desc nulls last);

alter table public.spotify_imported_searches enable row level security;
revoke all on table public.spotify_imported_searches from anon, authenticated;

-- -------------------------- listening events ------------------------------
create table if not exists public.spotify_listening_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  job_id             uuid references public.spotify_import_jobs (id) on delete set null,
  fingerprint        text not null,
  track_name         text,
  artist_name        text,
  album_name         text,
  spotify_track_uri  text,
  played_at          timestamptz,
  ms_played          integer not null default 0 check (ms_played >= 0),
  platform           text,
  skipped            boolean,
  shuffle            boolean,
  offline            boolean,
  counts_as_play     boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists spotify_listening_events_user_time_idx
  on public.spotify_listening_events (user_id, played_at desc nulls last);
create index if not exists spotify_listening_events_user_track_idx
  on public.spotify_listening_events (user_id, artist_name, track_name);

alter table public.spotify_listening_events enable row level security;
revoke all on table public.spotify_listening_events from anon, authenticated;

-- --------------------------- taste + statistics ---------------------------
create table if not exists public.spotify_taste_profiles (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  top_artists          jsonb not null default '[]'::jsonb,
  top_tracks           jsonb not null default '[]'::jsonb,
  top_albums           jsonb not null default '[]'::jsonb,
  top_genres           jsonb not null default '[]'::jsonb,
  total_ms_played      bigint not null default 0,
  imported_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.spotify_taste_profiles enable row level security;
revoke all on table public.spotify_taste_profiles from anon, authenticated;

create table if not exists public.user_music_statistics (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  total_events        integer not null default 0,
  total_ms_played     bigint not null default 0,
  unique_tracks       integer not null default 0,
  unique_artists      integer not null default 0,
  top_artists         jsonb not null default '[]'::jsonb,
  top_tracks          jsonb not null default '[]'::jsonb,
  top_albums          jsonb not null default '[]'::jsonb,
  top_genres          jsonb not null default '[]'::jsonb,
  history_range       jsonb not null default '{}'::jsonb,
  computed_at         timestamptz not null default now()
);

alter table public.user_music_statistics enable row level security;
revoke all on table public.user_music_statistics from anon, authenticated;

-- Service-role access only for the backend-owned tables. The backend always
-- verifies the Supabase access token before using a user_id from the request.
grant all on table public.music_playlists to service_role;
grant all on table public.music_playlist_tracks to service_role;
grant all on table public.music_liked_tracks to service_role;
grant all on table public.music_saved_albums to service_role;
grant all on table public.music_followed_artists to service_role;
grant all on table public.listening_history to service_role;
grant all on table public.spotify_connections to service_role;
grant all on table public.spotify_playlists to service_role;
grant all on table public.spotify_playlist_tracks to service_role;
grant all on table public.spotify_saved_tracks to service_role;
grant all on table public.spotify_track_matches to service_role;
grant all on table public.spotify_import_jobs to service_role;
grant all on table public.spotify_imported_searches to service_role;
grant all on table public.spotify_listening_events to service_role;
grant all on table public.spotify_taste_profiles to service_role;
grant all on table public.user_music_statistics to service_role;
