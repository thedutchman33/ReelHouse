-- Reelhouse — remove the Music feature schema
-- ---------------------------------------------------------------------------
-- DESTRUCTIVE: this drops every table created by 0003_music.sql,
-- 0004_music_preferences.sql, 0005_spotify_music.sql and
-- 0006_spotify_playlist_links.sql, including all listener playlists, likes,
-- follows, listening history, imported Spotify data and stored Spotify tokens.
--
-- Version note: 0003–0006 were removed from this repository when the Music
-- feature was deleted. They may already be recorded in
-- supabase_migrations.schema_migrations on existing projects, so this rollback
-- keeps a higher version (0007) to ensure it still runs there. `if exists`
-- makes it a no-op on a fresh database that never applied the music schema.
--
-- Dropping these tables also removes their indexes, RLS policies, triggers and
-- grants. The shared public.touch_updated_at() function stays: it belongs to
-- 0001_init.sql and is used by public.profiles. The pgcrypto extension is also
-- left in place because 0001_init.sql uses gen_random_uuid().
-- ---------------------------------------------------------------------------

drop table if exists
  -- Spotify import/detail tables first; foreign keys are handled by cascade.
  public.spotify_listening_events,
  public.spotify_imported_searches,
  public.spotify_import_jobs,
  public.spotify_track_matches,
  public.spotify_saved_tracks,
  public.spotify_playlist_tracks,
  public.spotify_playlists,
  public.spotify_connections,
  public.spotify_taste_profiles,
  public.user_music_statistics,
  public.listening_history,
  public.user_music_preferences,
  public.music_playlist_tracks,
  public.music_playlists,
  public.music_liked_tracks,
  public.music_saved_albums,
  public.music_followed_artists,
  public.music_saved_collections,
  public.music_recently_played
cascade;
