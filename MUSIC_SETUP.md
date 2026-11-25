# Reelhouse Music backend and Spotify setup

The music page now uses a separate Kotlin/JVM service in `music-backend/`. The
existing Next.js music UI, routes, movie/TV sections and Supabase auth remain in
place. The browser talks only to Next.js; private backend URL, Spotify secret,
service-role key and tokens never reach client JavaScript.

## Architecture

- `music-backend/` — Kotlin/JVM REST service using InnerTubeX, Ktor client,
  JDK HTTP server, LRCLIB, BetterLyrics, LyricsPlus, MusicBrainz and the official
  Spotify Web API.
- `src/app/api/music/*` — same-origin Next.js proxy to the backend.
- `src/app/api/spotify/[...path]` — authenticated proxy for Spotify, matching
  and ZIP imports. It forwards the Supabase access token; it never stores it.
- `supabase/migrations/0005_spotify_music.sql` — private Spotify tables,
  imported listening history, match cache, import jobs and library provenance.
- Imported playlists and liked songs are mirrored into the existing
  `music_playlists` / `music_playlist_tracks` / `music_liked_tracks` tables so the
  existing library and player keep working. Items are marked `source='spotify'`.

## 1. Run locally

```bash
# backend
cd music-backend
cp .env.example .env        # fill values, do not commit
set -a; . ./.env; set +a    # export the values into this shell
./gradlew run

# frontend (another terminal)
MUSIC_BACKEND_URL=http://localhost:8080 npm run dev
```

Health check: `GET http://localhost:8080/v1/health`.

## 2. Supabase SQL

Apply these migrations in order in the Supabase SQL editor (or with the Supabase
CLI):

1. `supabase/migrations/0003_music.sql`
2. `supabase/migrations/0004_music_preferences.sql`
3. `supabase/migrations/0005_spotify_music.sql`

`0005` adds `source`, `external_id`, `external_owner`, `image_url` and
`imported_at` to playlists, provenance columns to liked/album/artist snapshots,
`listening_history`, Spotify connection/token tables, Spotify playlist/track
tables, match cache, import jobs, imported searches, listening events, taste
profiles and computed statistics. Spotify tables have RLS enabled with **no
browser policies** and are accessible only through the backend service role.

Existing Reelhouse data is not deleted or rewritten.

## 3. Environment variables

### Backend (`music-backend/.env` or Render dashboard)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | HTTP port, default `8080`; Render supplies it. |
| `PO_TOKEN_PROVIDER_URL` | no | Must be the loopback sidecar, default `http://127.0.0.1:4416`. Non-loopback values are rejected. |
| `PO_TOKEN_PROVIDER_TIMEOUT_MS` | no | Sidecar request timeout, default `15000`. |
| `MUSIC_BACKEND_PUBLIC_URL` | recommended | Public backend origin; used for deployment metadata. |
| `SUPABASE_URL` | yes | Existing Supabase project URL. |
| `SUPABASE_ANON_KEY` | yes | Used only to verify user access tokens. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side writes/reads of private Spotify/import tables. Never expose it. |
| `MUSIC_TOKEN_ENCRYPTION_KEY` | yes for Spotify | 32 random bytes, base64 (`openssl rand -base64 32`). AES-GCM key for Spotify tokens. |
| `SPOTIFY_CLIENT_ID` | yes for OAuth | Spotify Developer app client id. |
| `SPOTIFY_CLIENT_SECRET` | yes for OAuth | Spotify Developer app secret. Never expose it. |
| `SPOTIFY_REDIRECT_URI` | yes for OAuth | Exact callback URL, e.g. `https://reelhouse-music.onrender.com/v1/spotify/callback`. |
| `SPOTIFY_CONNECT_REDIRECT_PATH` | no | Frontend path after callback, default `/music?spotify=connected`. |
| `REELHOUSE_APP_URL` | yes | Public frontend URL, e.g. `https://reelhouse.app`. |
| `REELHOUSE_ALLOWED_ORIGINS` | no | Comma-separated additional CORS origins. |
| `LRCLIB_USER_AGENT` | recommended | Identifies the client to LRCLIB. |
| `LRCLIB_APP_ID`, `LRCLIB_API_KEY` | no | Registered LRCLIB credentials. |
| `BETTERLYRICS_API_KEY` | no | Optional BetterLyrics key. |
| `MUSICBRAINZ_USER_AGENT` | recommended | Must identify the app to MusicBrainz. |
| `LYRICSPLUS_BASE_URL` | no | Override LyricsPlus base URL if the public instance moves. |
| `MUSIC_MAX_IMPORT_BYTES` | no | Upload limit, default 100 MiB. |
| `MUSIC_MAX_IMPORT_UNCOMPRESSED_BYTES` | no | ZIP expansion limit, default 400 MiB. |
| `MUSIC_MAX_JSON_ENTRY_BYTES` | no | Per-file limit, default 48 MiB. |
| `MUSIC_MAX_IMPORT_ENTRIES` | no | ZIP entry limit, default 20,000. |

### Frontend (`.env.local`)

Set the server-only backend URL. Do **not** use a `NEXT_PUBLIC_` prefix:

```dotenv
MUSIC_BACKEND_URL=https://reelhouse-music.onrender.com
```

The existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, TMDB,
video and cricket variables are unchanged.

## 4. Spotify Developer application

1. Open the Spotify Developer Dashboard and create an app.
2. Add a Redirect URI exactly matching `SPOTIFY_REDIRECT_URI`, for example:
   `https://reelhouse-music.onrender.com/v1/spotify/callback`
   For local development use `http://localhost:8080/v1/spotify/callback`.
3. Request only these scopes (the backend sends exactly these):
   `playlist-read-private`, `playlist-read-collaborative`,
   `user-library-read`, `user-read-private`.
4. Copy the Client ID and Client Secret to the backend environment.
5. Connect through **Music → Your Library → Spotify & imports**.

OAuth uses Authorization Code on the server. Access and refresh tokens are
AES-GCM encrypted before being written to `spotify_connections`. The backend
refreshes access tokens and asks the user to reconnect if Spotify returns
`invalid_grant`. Disconnecting deletes the encrypted connection row.

## 5. Render deployment

The repository includes `music-backend/Dockerfile` and a root `render.yaml`
Blueprint definition.

1. Push the repository to GitHub (not done by this implementation).
2. In Render choose **New → Blueprint** and select the repository, or create a
   Web Service with:
   - Environment: Docker
   - Dockerfile path: `music-backend/Dockerfile`
   - Docker context: `music-backend`
   - Docker Command: **leave empty**
   - Health check path: `/v1/health`
   - Plan: Free
3. Add every required environment variable above. Free instances sleep after
   inactivity, so the first request can be a cold start. The Docker image starts
   the pinned PO-token sidecar beside the JVM; leave `PO_TOKEN_PROVIDER_URL` at
   its loopback default. Leave Render's Docker Command empty so the image
   ENTRYPOINT can start that sidecar. The free plan has 512 MB total, so the JVM
   heap is capped at 256 MB. Imports are streamed through a temporary file, not
   kept as a permanent archive. Startup logs should include
   `po_token_sidecar_start`, `po_token_sidecar_ready`, and
   `po_token_provider_initialized`.
4. After deployment succeeds, verify:
   `curl https://<service>.onrender.com/v1/health`
5. Put that URL in the frontend `MUSIC_BACKEND_URL` and redeploy the frontend.

Deployment is **not** claimed here: no Render account/authorization was
available during implementation.

## 6. Downloading Spotify data

1. Go to <https://www.spotify.com/in-en/account/privacy/>.
2. Request **Account Data**. Request **Extended Streaming History** for the full
   listening history (Spotify may deliver it in a later email).
3. Download the ZIP file(s) from Spotify's email.
4. Open **Music → Your Library → Spotify & imports → Import data**.
5. Upload one or many ZIPs. Preview is computed before saving; choose categories
   and confirm.
6. Raw ZIPs are written only to a temporary file, processed, and deleted. Only
   supported music/listening fields are stored.

Supported exports include current Account Data files (`Playlist1.json`,
`YourLibrary.json`, `StreamingHistory*.json`, `SearchQueries.json`,
`TasteProfiles.json` / Wrapped files where Spotify includes them) and Extended
Streaming History (`Streaming_History_Audio_*.json`). Filename and JSON shape
detection is content-assisted because Spotify changes exports over time.
Payment, billing, address, phone, precise location, messages and advertising
inferences are never imported. Missing files and unavailable categories are
reported instead of invented.

## 7. What works without Spotify OAuth

Spotify credentials are optional. The backend starts normally when
`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` or
`MUSIC_TOKEN_ENCRYPTION_KEY` is absent; `/v1/health` reports
`"spotify": false`. InnerTubeX, lyrics, MusicBrainz, Supabase and existing
library features are unaffected.

- ZIP preview and import: yes, for any signed-in Reelhouse user.
- Imported playlists, liked songs, saved albums/artists, history, searches and
  taste data: yes.
- Spotify OAuth connect/callback and live Spotify API sync: no. Those endpoints
  return HTTP 503 with `spotify_not_configured` and a clear message instead of
  failing at startup.
- The Spotify status endpoint still returns `{"connected":false}` so the import
  UI continues to load, and previously imported data remains available.
- Track matching and manual matching: yes, using InnerTubeX search.
- Personalized home recommendations: generated from imported listening data.
- Live Spotify playlist/Liked Songs sync, refresh and disconnect: only after OAuth.

## 8. Known limitations

- Spotify audio is **not** played. Spotify is used only for importing/browsing
  metadata through the official Web API. Reelhouse playback uses the best
  YouTube Music match through InnerTubeX.
- InnerTubeX/YouTube playback is unofficial and may be affected by YouTube
  changes, regional restrictions, age gates or terms. Every track can fall back
  to "unavailable" rather than a fake stream.
- Spotify Web API apps in development mode have user allow-list limits. The
  Client Secret and refresh tokens must stay on the backend.
- Spotify data exports vary by account, region and date. Extended history and
  search history are not guaranteed to be included.
- Matching is confidence-scored; remasters, live versions, regional-language
  titles and duplicate versions can require a manual match, which the Spotify
  Liked Songs screen supports.
- Recommendations are Reelhouse's own search-based recommendations, not a
  reproduction of Spotify's internal algorithm.
- MusicBrainz requires one request per second and is cached; it enriches
  metadata but never overwrites a confident YouTube Music title/artist.
- LyricsPlus public instances can move; configure `LYRICSPLUS_BASE_URL` if
  needed. BetterLyrics word timestamps are used when present.
- Render free instances sleep and have limited memory; first-request latency and
  large imports are constrained by the documented limits.
- Spotify OAuth, Supabase RLS and live imports could not be end-to-end verified
  without deployment credentials. The code paths and live InnerTubeX/lyrics/
  MusicBrainz/audio-range tests are implemented independently.

## 9. API surface

Catalog: `/v1/music/home`, `/v1/music/search`, `/v1/music/artists/:id`,
`/v1/music/collections/:id`, `/v1/music/tracks/:videoId`,
`/v1/music/related`, `/v1/music/lyrics`, `/v1/music/enrich`,
`/v1/stream/:videoId`.

Spotify: `/v1/spotify/connect`, `/v1/spotify/callback`,
`/v1/spotify/status`, `/v1/spotify/playlists`,
`/v1/spotify/playlists/:id`, `/v1/spotify/playlists/:id/matches`,
`/v1/spotify/liked`, `/v1/spotify/liked/matches`,
`/v1/spotify/matches/:trackId/manual`, `/v1/spotify/refresh`,
`/v1/spotify/import/preview`, `/v1/spotify/import`,
`/v1/spotify/import/jobs/:id`, `/v1/spotify/search-history`,
`/v1/spotify/data`, `/v1/music/profile`, `/v1/music/stats`.

All non-public routes require a Supabase bearer token. The service verifies it
against Supabase Auth before using its user id.
