package com.reelhouse.music

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

class MusicRoutes(
    private val config: AppConfig,
    private val youtube: YouTubeMusicService,
    private val lyrics: LyricsService,
    private val musicBrainz: MusicBrainzService,
    private val analytics: MusicAnalyticsService,
    private val spotify: SpotifyService,
    private val matcher: SpotifyMatchingService,
    private val imports: SpotifyImportService,
    private val auth: SupabaseAuth,
    private val http: ExternalHttp,
    private val logger: AppLogger,
) {
    fun install(router: Router) {
        router.get("/v1/health") {
            HttpResponse.json(
                HealthDto(
                    status = "ok",
                    supabase = config.supabaseConfigured,
                    spotify = config.spotifyConfigured,
                ),
                cacheControl = "no-store",
            )
        }
        router.get("/v1/music/home") {
            HttpResponse.json(
                youtube.home(),
                cacheControl = "public, max-age=60, stale-while-revalidate=300",
            )
        }
        router.get("/v1/music/search") { request ->
            val query = request.query("q")?.trim().orEmpty()
            if (query.length < 2) {
                HttpResponse.json(MusicSearchResultsDto(emptyList(), emptyList(), emptyList(), emptyList()))
            } else {
                val limit = request.queryInt("limit", 10, 1, 30)
                val offset = request.queryInt("offset", 0, 0, 200)
                HttpResponse.json(
                    youtube.search(query, limit, offset),
                    cacheControl = "public, max-age=60, stale-while-revalidate=300",
                )
            }
        }
        router.get("/v1/music/artists/:id") { request ->
            val id = request.query("id").orEmpty()
            HttpResponse.json(
                youtube.artist(id),
                cacheControl = "public, max-age=300, stale-while-revalidate=1800",
            )
        }
        router.get("/v1/music/collections/:id") { request ->
            val id = request.query("id").orEmpty()
            val kind = if (request.query("kind") == "album") "album" else "playlist"
            HttpResponse.json(
                youtube.collection(id, kind),
                cacheControl = "public, max-age=300, stale-while-revalidate=1800",
            )
        }
        router.get("/v1/music/tracks/:videoId") { request ->
            val videoId = request.query("videoId").orEmpty()
            HttpResponse.json(
                youtube.track(videoId),
                cacheControl = "public, max-age=300, stale-while-revalidate=1800",
            )
        }
        router.get("/v1/music/related") { request ->
            val videoId = request.query("videoId")?.trim().orEmpty()
            HttpResponse.json(
                mapOf(
                    "tracks" to youtube.related(
                        videoId,
                        request.query("title")?.trim()?.take(200),
                        request.query("artist")?.trim()?.take(200),
                    ),
                ),
                cacheControl = "public, max-age=120, stale-while-revalidate=600",
            )
        }
        router.get("/v1/music/lyrics") { request ->
            var title = request.query("track")?.trim()?.take(200).orEmpty()
            var artist = request.query("artist")?.trim()?.take(200).orEmpty()
            var album = request.query("album")?.trim()?.take(200)
            var duration = request.query("duration")?.toIntOrNull()
            val videoId = request.query("videoId")?.trim()
            if ((title.isBlank() || artist.isBlank()) && !videoId.isNullOrBlank()) {
                val track = runCatching { youtube.track(videoId) }.getOrNull()
                if (track != null) {
                    title = track.title
                    artist = track.artistName
                    album = album ?: track.albumTitle
                    duration = duration ?: track.duration
                }
            }
            if (title.isBlank() || artist.isBlank()) {
                throw ApiException(400, "lyrics_query_required", "Track title and artist are required")
            }
            HttpResponse.json(
                lyrics.lyrics(title, artist, album, duration),
                cacheControl = "public, max-age=3600, stale-while-revalidate=86400",
            )
        }
        router.get("/v1/music/enrich") { request ->
            val title = request.query("track")?.trim()?.take(200).orEmpty()
            val artist = request.query("artist")?.trim()?.take(200).orEmpty()
            if (title.isBlank() || artist.isBlank()) {
                throw ApiException(400, "enrich_query_required", "Track title and artist are required")
            }
            val result = musicBrainz.enrich(
                title = title,
                artist = artist,
                album = request.query("album")?.trim()?.take(200),
                durationSeconds = request.query("duration")?.toIntOrNull(),
                isrc = request.query("isrc")?.trim()?.take(20),
            ) ?: throw ApiException(404, "enrichment_not_found", "No reliable MusicBrainz match was found")
            HttpResponse.json(result, cacheControl = "public, max-age=86400")
        }

        router.get("/v1/stream/:videoId") { request ->
            streamResponse(request, headOnly = false)
        }
        router.head("/v1/stream/:videoId") { request ->
            streamResponse(request, headOnly = true)
        }

        router.get("/v1/music/profile") { request ->
            val user = requireUser(request)
            val refresh = request.query("refresh") == "1"
            if (refresh) analytics.recompute(user.id)
            HttpResponse.json(analytics.personalized(user.id), cacheControl = "no-store")
        }
        router.get("/v1/music/recommendations") { request ->
            val user = requireUser(request)
            HttpResponse.json(analytics.personalized(user.id), cacheControl = "no-store")
        }
        router.get("/v1/music/stats") { request ->
            val user = requireUser(request)
            val refresh = request.query("refresh") == "1"
            val stats = if (refresh) analytics.recompute(user.id) else analytics.stats(user.id)
            HttpResponse.json(stats, cacheControl = "no-store")
        }

        router.post("/v1/spotify/connect") { request ->
            spotify.requireConfigured()
            val user = requireUser(request)
            HttpResponse.json(mapOf("url" to spotify.authorizationUrl(user.id)), cacheControl = "no-store")
        }
        router.get("/v1/spotify/callback") { request ->
            spotify.requireConfigured()
            HttpResponse.redirect(
                spotify.handleCallback(
                    code = request.query("code"),
                    state = request.query("state"),
                    error = request.query("error"),
                ),
            )
        }
        router.get("/v1/spotify/status") { request ->
            val user = requireUser(request)
            val status = spotify.status(user.id)
            HttpResponse.json(status, cacheControl = "no-store")
        }
        router.delete("/v1/spotify/connection") { request ->
            val user = requireUser(request)
            spotify.disconnect(user.id)
            HttpResponse.json(mapOf("disconnected" to true), cacheControl = "no-store")
        }
        router.delete("/v1/spotify/data") { request ->
            val user = requireUser(request)
            spotify.deleteImportedData(user.id)
            HttpResponse.json(mapOf("deleted" to true), cacheControl = "no-store")
        }
        router.get("/v1/spotify/playlists") { request ->
            val user = requireUser(request)
            if (request.query("refresh") == "1") {
                if (!spotify.status(user.id).connected) {
                    throw ApiException(409, "spotify_not_connected", "Connect Spotify to refresh playlists")
                }
                spotify.syncPlaylists(user.id)
            }
            val playlists = spotify.storedPlaylists(user.id)
            HttpResponse.json(
                SpotifyLibraryDto(
                    playlists = playlists,
                    likedCount = spotify.likedCount(user.id),
                    lastSyncAt = playlists.maxOfOrNull { it.lastSyncedAt.orEmpty() }?.takeIf { it.isNotBlank() },
                ),
                cacheControl = "no-store",
            )
        }
        router.get("/v1/spotify/playlists/:id") { request ->
            val user = requireUser(request)
            val id = request.query("id")?.trim().orEmpty()
            if (!SPOTIFY_PLAYLIST_ID.matches(id)) throw ApiException(400, "invalid_playlist_id", "Invalid Spotify playlist id")
            val detail = spotify.playlist(
                userId = user.id,
                spotifyPlaylistId = id,
                refresh = request.query("refresh") == "1",
                matcher = matcher,
            ) ?: throw ApiException(404, "spotify_playlist_not_found", "Spotify playlist not found")
            HttpResponse.json(detail, cacheControl = "no-store")
        }
        router.post("/v1/spotify/playlists/:id/matches") { request ->
            val user = requireUser(request)
            val id = request.query("id")?.trim().orEmpty()
            if (!SPOTIFY_PLAYLIST_ID.matches(id)) throw ApiException(400, "invalid_playlist_id", "Invalid Spotify playlist id")
            val limit = request.queryInt("limit", 30, 1, 100)
            HttpResponse.json(spotify.matchPlaylist(user.id, id, limit, matcher), cacheControl = "no-store")
        }
        router.get("/v1/spotify/liked") { request ->
            val user = requireUser(request)
            val offset = request.queryInt("offset", 0, 0, 100_000)
            val limit = request.queryInt("limit", 50, 1, 100)
            HttpResponse.json(
                spotify.likedPage(user.id, offset, limit, request.query("refresh") == "1", matcher),
                cacheControl = "no-store",
            )
        }
        router.post("/v1/spotify/liked/matches") { request ->
            val user = requireUser(request)
            val limit = request.queryInt("limit", 30, 1, 100)
            HttpResponse.json(spotify.matchLiked(user.id, limit, matcher), cacheControl = "no-store")
        }
        router.post("/v1/spotify/matches/:trackId/manual") { request ->
            val user = requireUser(request)
            val trackId = request.query("trackId")?.trim().orEmpty()
            if (!SPOTIFY_TRACK_ID.matches(trackId)) throw ApiException(400, "invalid_track_id", "Invalid Spotify track id")
            val body = request.readJson(256 * 1024)
            val trackJson = body["track"].asObjectOrNull()
                ?: throw ApiException(400, "invalid_match", "A YouTube Music track is required")
            val track = runCatching {
                AppJson.decodeFromJsonElement(MusicTrackDto.serializer(), trackJson)
            }.getOrNull() ?: throw ApiException(400, "invalid_match", "The selected match is invalid")
            matcher.manualMatch(user.id, trackId, track)
            HttpResponse.json(mapOf("matched" to true), cacheControl = "no-store")
        }
        router.post("/v1/spotify/refresh") { request ->
            val user = requireUser(request)
            val playlists = spotify.syncPlaylists(user.id)
            val liked = runCatching { spotify.likedPage(user.id, 0, 50, true, matcher).total }.getOrElse { spotify.likedCount(user.id) }
            HttpResponse.json(
                mapOf("playlists" to playlists.size, "likedSongs" to liked),
                cacheControl = "no-store",
            )
        }

        router.post("/v1/spotify/import/preview") { request ->
            val user = requireUser(request)
            validateUploadSize(request)
            val name = archiveName(request)
            HttpResponse.json(
                imports.preview(user.id, name, request.bodyStream()),
                cacheControl = "no-store",
            )
        }
        router.post("/v1/spotify/import") { request ->
            val user = requireUser(request)
            validateUploadSize(request)
            val categoriesRaw = request.header("x-import-categories")
            val categories = if (categoriesRaw.isNullOrBlank()) {
                SpotifyImportService.CATEGORIES
            } else {
                categoriesRaw.split(',').map { it.trim().lowercase() }.filter(String::isNotBlank).toSet()
                    .intersect(SpotifyImportService.CATEGORIES)
                    .ifEmpty { throw ApiException(400, "invalid_categories", "Select at least one import category") }
            }
            val jobId = request.header("x-import-job-id")?.trim()?.takeIf {
                it.isNotBlank() && UUID_PATTERN.matches(it)
            }
            val final = request.header("x-import-final")?.equals("true", ignoreCase = true) == true
            HttpResponse.json(
                imports.import(
                    userId = user.id,
                    archiveName = archiveName(request),
                    body = request.bodyStream(),
                    categories = categories,
                    jobId = jobId,
                    final = final,
                ),
                cacheControl = "no-store",
            )
        }
        router.get("/v1/spotify/import/jobs/:id") { request ->
            val user = requireUser(request)
            val id = request.query("id")?.trim().orEmpty()
            if (!UUID_PATTERN.matches(id)) throw ApiException(400, "invalid_job_id", "Invalid import job id")
            val row = supabaseSingleImportJob(user.id, id)
            HttpResponse.json(row, cacheControl = "no-store")
        }
        router.get("/v1/spotify/search-history") { request ->
            val user = requireUser(request)
            val rows = supabaseSelectSearchHistory(user.id)
            HttpResponse.json(mapOf("searches" to rows), cacheControl = "no-store")
        }
        router.delete("/v1/spotify/search-history") { request ->
            val user = requireUser(request)
            deleteSearchHistory(user.id, null)
            HttpResponse.json(mapOf("deleted" to true), cacheControl = "no-store")
        }
        router.delete("/v1/spotify/search-history/:id") { request ->
            val user = requireUser(request)
            val id = request.query("id")?.trim().orEmpty()
            if (!UUID_PATTERN.matches(id)) throw ApiException(400, "invalid_search_id", "Invalid search id")
            deleteSearchHistory(user.id, id)
            HttpResponse.json(mapOf("deleted" to true), cacheControl = "no-store")
        }
    }

    private suspend fun streamResponse(request: HttpRequest, headOnly: Boolean): HttpResponse {
        val videoId = request.query("videoId").orEmpty()
        if (!VIDEO_ID.matches(videoId)) throw ApiException(400, "invalid_video_id", "Invalid video id")
        val range = request.header("range")?.takeIf { RANGE.matches(it) }
        if (headOnly) {
            val info = youtube.stream(videoId)
            return HttpResponse(
                status = 200,
                body = ByteArray(0),
                contentType = info.mimeType ?: "application/octet-stream",
                headers = buildMap {
                    put("Accept-Ranges", "bytes")
                    put("Cache-Control", "private, max-age=3600")
                },
            )
        }
        var info = youtube.stream(videoId)
        var upstream = runCatching {
            openUpstream(info, range)
        }.getOrElse {
            throw ApiException(502, "stream_unavailable", "The audio stream is temporarily unavailable")
        }
        if (upstream.status == 403 || upstream.status == 410) {
            upstream.close()
            youtube.invalidateStream(videoId)
            info = youtube.stream(videoId)
            upstream = runCatching { openUpstream(info, range) }.getOrElse {
                throw ApiException(502, "stream_unavailable", "The audio stream is temporarily unavailable")
            }
        }
        if (upstream.status !in 200..299) {
            val status = upstream.status
            upstream.close()
            logger.warn("stream_proxy_rejected", mapOf("videoId" to videoId, "upstream" to status))
            throw ApiException(502, "stream_unavailable", "The audio stream is temporarily unavailable")
        }
        val contentLength = upstream.header("Content-Length")?.toLongOrNull() ?: 0L
        val headers = buildMap {
            put("Accept-Ranges", "bytes")
            put("Cache-Control", "private, max-age=3600")
            upstream.header("Content-Range")?.let { put("Content-Range", it) }
            upstream.header("Content-Encoding")?.takeIf { it != "identity" }?.let { put("Content-Encoding", it) }
        }
        return HttpResponse(
            status = upstream.status,
            body = ByteArray(0),
            contentType = upstream.header("Content-Type") ?: info.mimeType ?: "application/octet-stream",
            headers = headers,
            bodyStream = upstream.stream,
            contentLength = contentLength,
        )
    }

    private suspend fun openUpstream(info: YouTubeStreamInfo, range: String?): StreamHttpResponse {
        val headers = buildMap {
            putAll(info.requestHeaders)
            if (range != null) put("Range", range)
        }
        return http.openGet(info.url, headers, 30_000)
    }

    private suspend fun requireUser(request: HttpRequest): AuthUser {
        if (!config.supabaseConfigured) {
            throw ApiException(503, "supabase_not_configured", "Supabase authentication is not configured")
        }
        val header = request.header("authorization")
            ?: throw ApiException(401, "authentication_required", "Sign in to use this feature")
        val token = header.removePrefix("Bearer ").removePrefix("bearer ").trim()
        if (token.isBlank()) throw ApiException(401, "authentication_required", "Sign in to use this feature")
        return auth.authenticate(token)
            ?: throw ApiException(401, "invalid_session", "Your session has expired. Sign in again.")
    }

    private fun validateUploadSize(request: HttpRequest) {
        val contentLength = request.header("content-length")?.toLongOrNull() ?: 0L
        if (contentLength > config.maxImportBytes) {
            throw ApiException(413, "archive_too_large", "The Spotify archive is larger than the upload limit")
        }
    }

    private fun archiveName(request: HttpRequest): String {
        val raw = request.header("x-import-archive-name") ?: "spotify-export.zip"
        val decoded = runCatching { URLDecoder.decode(raw, StandardCharsets.UTF_8) }.getOrDefault(raw)
        return decoded.substringAfterLast('/').substringAfterLast('\\').take(220).ifBlank { "spotify-export.zip" }
    }

    private suspend fun supabaseSingleImportJob(userId: String, jobId: String): JsonObject {
        val rest = SupabaseRest(config, http)
        return rest.maybeSingle(
            "spotify_import_jobs",
            "user_id=${rest.eq(userId)}&id=${rest.eq(jobId)}",
        ) ?: throw ApiException(404, "import_job_not_found", "Import job not found")
    }

    private suspend fun supabaseSelectSearchHistory(userId: String): List<JsonObject> {
        val rest = SupabaseRest(config, http)
        return rest.select(
            "spotify_imported_searches",
            "user_id=${rest.eq(userId)}&select=id,query,searched_at,platform,result_uri,created_at&order=searched_at.desc.nullslast&limit=200",
        )
    }

    private suspend fun deleteSearchHistory(userId: String, searchId: String?) {
        val rest = SupabaseRest(config, http)
        val query = buildString {
            append("user_id=").append(rest.eq(userId))
            if (searchId != null) append("&id=").append(rest.eq(searchId))
        }
        rest.delete("spotify_imported_searches", query)
    }

    private companion object {
        val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
        val SPOTIFY_TRACK_ID = Regex("^[A-Za-z0-9]{16,64}$")
        val SPOTIFY_PLAYLIST_ID = Regex("^[A-Za-z0-9_-]{1,128}$")
        val UUID_PATTERN =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        val RANGE = Regex("^bytes=\\d{0,12}-\\d{0,12}$")
    }
}
