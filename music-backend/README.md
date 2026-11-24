# Reelhouse Music backend

Kotlin/JVM REST service for the existing Reelhouse music frontend.

- InnerTubeX / YouTube Music: search, artist, album, playlist, related and
  browser-playable audio range proxy.
- LRCLIB → BetterLyrics → LyricsPlus fallback with line/word timing.
- MusicBrainz enrichment with the required 1 request/second limit and cache.
- Official Spotify OAuth, encrypted token storage, playlist and Liked Songs
  synchronization, confidence-scored YouTube Music matching and manual matching.
- Streaming Spotify Account Data / Extended Streaming History ZIP import with
  ZIP-bomb, path traversal, entry-size and expansion limits. Raw archives are
  never retained.
- Imported history analytics and personalized recommendation sections.
- Supabase JWT verification and service-role-only private tables.

## Build and test

```bash
./gradlew compileKotlin --console=plain
./gradlew test --console=plain
# export .env values first; Gradle does not load .env automatically
set -a; . ./.env; set +a
./gradlew run
```

Live network probes are opt-in:

```bash
MUSIC_LIVE_TESTS=true ./gradlew test --console=plain
```

Unit tests cover token encryption, OAuth state signing and text matching without
external services.

## Docker

```bash
docker build -t reelhouse-music .
docker run --rm -p 8080:8080 --env-file .env reelhouse-music
```

The repository root `render.yaml` contains the free-tier deployment template,
and `MUSIC_SETUP.md` documents environment variables, the Supabase SQL order,
the Spotify redirect URI, export download steps and known limitations.

## Health

`GET /v1/health` returns:

```json
{"status":"ok","service":"reelhouse-music-backend","innerTube":true,"supabase":false,"spotify":false}
```

`supabase` and `spotify` are configuration booleans, not secret values. They
become `true` when the corresponding required environment variables are set.
