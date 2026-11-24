-- Reelhouse Music — listener library
-- ---------------------------------------------------------------------------
-- Apply after 0001_init.sql in the Supabase SQL editor (Dashboard → SQL →
-- New query → paste → Run) or with the Supabase CLI.
--
-- Catalog metadata comes from the free Audius API and is not stored here.
-- Every row below belongs to a signed-in listener and is protected by RLS:
-- auth.uid() = user_id on every read and write. Track/album/artist snapshots
-- are denormalized so the library still renders when the upstream catalog
-- changes (and so the player never needs a second metadata request).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ------------------------------ playlists ----------------------------------
create table if not exists public.music_playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  accent      text not null default '#1ed760',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists music_playlists_user_created_idx
  on public.music_playlists (user_id, created_at desc);

drop trigger if exists touch_music_playlists on public.music_playlists;
create trigger touch_music_playlists
  before update on public.music_playlists
  for each row execute function public.touch_updated_at();

-- --------------------------- playlist tracks -------------------------------
create table if not exists public.music_playlist_tracks (
  id             uuid primary key default gen_random_uuid(),
  playlist_id    uuid not null references public.music_playlists (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  track_id       text not null,
  track_snapshot jsonb not null default '{}'::jsonb,
  position       integer not null default 0,
  added_at       timestamptz not null default now(),
  unique (playlist_id, track_id)
);

create index if not exists music_playlist_tracks_order_idx
  on public.music_playlist_tracks (playlist_id, position, added_at);

create index if not exists music_playlist_tracks_user_idx
  on public.music_playlist_tracks (user_id, added_at desc);

-- ----------------------------- liked songs ---------------------------------
create table if not exists public.music_liked_tracks (
  user_id        uuid not null references auth.users (id) on delete cascade,
  track_id       text not null,
  track_snapshot jsonb not null default '{}'::jsonb,
  liked_at       timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index if not exists music_liked_tracks_user_liked_idx
  on public.music_liked_tracks (user_id, liked_at desc);

-- ----------------------------- saved albums --------------------------------
create table if not exists public.music_saved_albums (
  user_id        uuid not null references auth.users (id) on delete cascade,
  album_id       text not null,
  album_snapshot jsonb not null default '{}'::jsonb,
  saved_at       timestamptz not null default now(),
  primary key (user_id, album_id)
);

create index if not exists music_saved_albums_user_saved_idx
  on public.music_saved_albums (user_id, saved_at desc);

-- ---------------------------- followed artists -----------------------------
create table if not exists public.music_followed_artists (
  user_id         uuid not null references auth.users (id) on delete cascade,
  artist_id       text not null,
  artist_snapshot jsonb not null default '{}'::jsonb,
  followed_at     timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create index if not exists music_followed_artists_user_idx
  on public.music_followed_artists (user_id, followed_at desc);

-- -------------------------- saved collections ------------------------------
-- Editorial Reelhouse mixes and Audius playlists a listener adds to their
-- library. The snapshot includes the tracks, so a saved mix remains playable
-- even after the upstream discovery feed rotates.
create table if not exists public.music_saved_collections (
  user_id             uuid not null references auth.users (id) on delete cascade,
  collection_id       text not null,
  collection_snapshot jsonb not null default '{}'::jsonb,
  saved_at            timestamptz not null default now(),
  primary key (user_id, collection_id)
);

create index if not exists music_saved_collections_user_idx
  on public.music_saved_collections (user_id, saved_at desc);

-- ---------------------------- recently played ------------------------------
create table if not exists public.music_recently_played (
  user_id        uuid not null references auth.users (id) on delete cascade,
  track_id       text not null,
  track_snapshot jsonb not null default '{}'::jsonb,
  played_at      timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index if not exists music_recently_played_user_played_idx
  on public.music_recently_played (user_id, played_at desc);

-- ============================ ROW-LEVEL SECURITY ===========================
alter table public.music_playlists          enable row level security;
alter table public.music_playlist_tracks    enable row level security;
alter table public.music_liked_tracks       enable row level security;
alter table public.music_saved_albums       enable row level security;
alter table public.music_followed_artists   enable row level security;
alter table public.music_saved_collections  enable row level security;
alter table public.music_recently_played    enable row level security;

-- Playlists: the owner can read, create, edit and delete only their rows.
drop policy if exists "music playlists: owner all" on public.music_playlists;
create policy "music playlists: owner all" on public.music_playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Playlist tracks: additionally require the parent playlist to belong to the
-- caller, so a forged playlist_id cannot attach rows to someone else's list.
drop policy if exists "music playlist tracks: owner all" on public.music_playlist_tracks;
create policy "music playlist tracks: owner all" on public.music_playlist_tracks
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.music_playlists p
      where p.id = music_playlist_tracks.playlist_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.music_playlists p
      where p.id = music_playlist_tracks.playlist_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "music liked tracks: owner all" on public.music_liked_tracks;
create policy "music liked tracks: owner all" on public.music_liked_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "music saved albums: owner all" on public.music_saved_albums;
create policy "music saved albums: owner all" on public.music_saved_albums
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "music followed artists: owner all" on public.music_followed_artists;
create policy "music followed artists: owner all" on public.music_followed_artists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "music saved collections: owner all" on public.music_saved_collections;
create policy "music saved collections: owner all" on public.music_saved_collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "music recently played: owner all" on public.music_recently_played;
create policy "music recently played: owner all" on public.music_recently_played
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
