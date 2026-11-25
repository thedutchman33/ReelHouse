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

Spotify OAuth is optional. The service starts without Spotify credentials, and
catalog, lyrics, MusicBrainz, Supabase and ZIP-import routes remain available.
Only OAuth connect/callback and live Spotify synchronization require credentials;
they return HTTP 503 `spotify_not_configured` when the credentials are absent.

Live network probes are opt-in:

```bash
MUSIC_LIVE_TESTS=true ./gradlew test --console=plain
```

The live stream probe expects the PO-token sidecar on `127.0.0.1:4416`.

Unit tests cover token encryption, OAuth state signing, text matching, optional
Spotify configuration and ZIP preview parsing without external services.

## PO-token sidecar

YouTube web playback needs a real BotGuard PO token. The Docker image bundles
Metrolist's pinned `bgutil-ytdlp-pot-provider-rs` v0.8.1 loopback sidecar and
starts it with the backend. `BgutilTokenProvider` supplies the resulting
`WEB_BOTGUARD` player and streaming-data tokens to `InnerTubeExtractor`.

- `PO_TOKEN_PROVIDER_URL` defaults to `http://127.0.0.1:4416` and must remain a
  loopback URL. The service refuses non-loopback providers.
- `PO_TOKEN_PROVIDER_TIMEOUT_MS` defaults to `15000`.
- Tokens are cached only for their sidecar-reported lifetime (capped at 10
  minutes), never logged, and are retried after a 30-second failure cooldown.
- The backend's tokenless clients remain as a fallback when the sidecar is
  unavailable, but YouTube may reject them with `LOGIN_REQUIRED`.

For local non-Docker development, run the matching sidecar on port 4416
(`bgutil-pot server --host 127.0.0.1 --port 4416`), or point
`PO_TOKEN_PROVIDER_URL` at a compatible loopback instance.

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
