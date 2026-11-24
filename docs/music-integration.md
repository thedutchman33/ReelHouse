# Reelhouse Music — implementation notes

> This document described the earlier Audius/Jamendo prototype. That prototype
> is no longer the active catalog or playback path. The current implementation
> uses the independent Kotlin/InnerTubeX backend and the official Spotify Web
> API. See the repository root [`MUSIC_SETUP.md`](../MUSIC_SETUP.md) for the
> authoritative setup, SQL, deployment and limitations.

Current split:

- `music-backend/` — Kotlin/JVM service using InnerTubeX/YouTube Music for
  catalog and audio, LRCLIB → BetterLyrics → LyricsPlus for lyrics,
  MusicBrainz for enrichment, and the official Spotify API/OAuth for imports.
- `src/app/api/music/*` and `src/app/api/spotify/[...path]` — same-origin
  Next.js proxies. Private backend URLs and Spotify credentials stay server-side.
- Supabase migrations `0003`, `0004`, `0005` — existing library tables plus
  Spotify connections, imports, matching and listening-profile tables.
- Spotify ZIP import can be used without Spotify OAuth and never stores raw ZIP
  archives permanently.

Legacy Audius/Jamendo helper modules and tests may still exist in the tree for
historical compatibility, but they are not called by the active catalog,
search, stream or playback paths and are not configured in the production CSP.
