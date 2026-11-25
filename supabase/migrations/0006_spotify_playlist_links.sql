-- Reelhouse Music — Spotify playlist link provenance
-- ---------------------------------------------------------------------------
-- Apply after 0005_spotify_music.sql in the Supabase SQL editor or CLI.
--
-- A Spotify playlist URL can be linked without OAuth or the Spotify Web API.
-- The official embed is displayed inside Reelhouse, and the original share URL
-- is stored here. import_mode distinguishes an embed-only external playlist
-- from a native Reelhouse playlist built from user-supplied tracklist metadata.
--
-- 0005 already added source, external_id, external_owner, image_url and
-- imported_at to music_playlists. This migration only adds the missing URL and
-- import mode. It does not touch existing rows or delete any data.
-- ---------------------------------------------------------------------------

alter table public.music_playlists
  add column if not exists external_url text,
  add column if not exists import_mode text;

alter table public.music_playlists
  drop constraint if exists music_playlists_import_mode_check;
alter table public.music_playlists
  add constraint music_playlists_import_mode_check
  check (import_mode is null or import_mode in ('embed', 'tracklist'));

-- Lookups by Spotify playlist id already use music_playlists_external_idx.
-- Keep embed-only playlists easy to audit without scanning the library.
create index if not exists music_playlists_spotify_mode_idx
  on public.music_playlists (user_id, import_mode)
  where source = 'spotify';

grant all on table public.music_playlists to service_role;
