package com.reelhouse.music

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Base64

class SpotifyService(
    private val config: AppConfig,
    private val http: ExternalHttp,
    private val supabase: SupabaseRest,
    private val logger: AppLogger,
) {
    private data class TokenSet(
        val accessToken: String,
        val refreshToken: String,
        val expiresAt: Instant,
        val scopes: List<String>,
    )

    private data class ApiResult(val status: Int, val body: String, val retryAfter: String?)

    private val refreshLocks = java.util.concurrent.ConcurrentHashMap<String, Mutex>()

    val enabled: Boolean
        get() = config.spotifyConfigured && supabase.enabled

    fun authorizationUrl(userId: String): String {
        requireConfigured()
        val key = config.tokenEncryptionKey!!
        val state = TokenCrypto.state(userId, key)
        return "https://accounts.spotify.com/authorize?" + form(
            mapOf(
                "client_id" to config.spotifyClientId!!,
                "response_type" to "code",
                "redirect_uri" to config.spotifyRedirectUri!!,
                "scope" to SCOPES.joinToString(" "),
                "state" to state,
                "show_dialog" to "false",
            ),
        )
    }

    suspend fun handleCallback(code: String?, state: String?, error: String?): String {
        val fallback = "${config.appUrl}${config.spotifyImportRedirectPath}"
        if (!error.isNullOrBlank()) {
            return appendQuery(fallback, "spotify=error", "reason=${enc(error.take(80))}")
        }
        if (code.isNullOrBlank() || state.isNullOrBlank()) {
            return appendQuery(fallback, "spotify=error", "reason=missing_code")
        }
        val key = config.tokenEncryptionKey ?: return appendQuery(fallback, "spotify=error", "reason=not_configured")
        val userId = TokenCrypto.verifyState(state, key)
            ?: return appendQuery(fallback, "spotify=error", "reason=invalid_state")
        return try {
            val token = exchangeCode(code)
            val profile = apiProfile(token.accessToken)
            val spotifyUserId = profile["id"].asStringOrNull()
                ?: throw ApiException(502, "spotify_profile_error", "Spotify did not return an account id")
            val scopes = token.scopes.ifEmpty { SCOPES }
            supabase.insert(
                table = "spotify_connections",
                rows = listOf(
                    buildJsonObject {
                        put("user_id", userId)
                        put("spotify_user_id", spotifyUserId)
                        put("display_name", profile["display_name"].asStringOrNull() ?: spotifyUserId)
                        put("country", profile["country"].asStringOrNull())
                        put("product", profile["product"].asStringOrNull())
                        put("scopes", JsonArray(scopes.map { kotlinx.serialization.json.JsonPrimitive(it) }))
                        put("access_token_ciphertext", TokenCrypto.encrypt(token.accessToken, key))
                        put("refresh_token_ciphertext", TokenCrypto.encrypt(token.refreshToken, key))
                        put("token_expires_at", token.expiresAt.toString())
                        put("connected_at", Instant.now().toString())
                        put("updated_at", Instant.now().toString())
                    },
                ),
                onConflict = "user_id",
            )
            appendQuery(fallback, "spotify=connected")
        } catch (exception: Exception) {
            logger.warn(
                "spotify_callback_failed",
                mapOf("type" to exception::class.simpleName, "detail" to (exception.message ?: "").take(160)),
            )
            appendQuery(fallback, "spotify=error", "reason=callback_failed")
        }
    }

    suspend fun status(userId: String): SpotifyConnectionDto {
        val row = supabase.maybeSingle("spotify_connections", "user_id=${supabase.eq(userId)}")
            ?: return SpotifyConnectionDto(connected = false)
        return SpotifyConnectionDto(
            connected = true,
            spotifyUserId = row["spotify_user_id"].asStringOrNull(),
            displayName = row["display_name"].asStringOrNull(),
            country = row["country"].asStringOrNull(),
            product = row["product"].asStringOrNull(),
            scopes = row.stringList("scopes"),
            connectedAt = row["connected_at"].asStringOrNull(),
        )
    }

    suspend fun disconnect(userId: String) {
        supabase.delete("spotify_connections", "user_id=${supabase.eq(userId)}")
    }

    suspend fun deleteImportedData(userId: String) {
        val user = supabase.eq(userId)
        supabase.delete("spotify_import_jobs", "user_id=$user")
        supabase.delete("spotify_imported_searches", "user_id=$user")
        supabase.delete("spotify_listening_events", "user_id=$user")
        supabase.delete("spotify_taste_profiles", "user_id=$user")
        supabase.delete("user_music_statistics", "user_id=$user")
        supabase.delete("spotify_track_matches", "user_id=$user")
        supabase.delete("spotify_saved_tracks", "user_id=$user")
        supabase.delete("spotify_playlist_tracks", "user_id=$user")
        supabase.delete("spotify_playlists", "user_id=$user")
        supabase.delete("music_playlists", "user_id=$user&source=eq.spotify")
        supabase.delete("music_liked_tracks", "user_id=$user&source=eq.spotify")
        supabase.delete("music_saved_albums", "user_id=$user&source=eq.spotify")
        supabase.delete("music_followed_artists", "user_id=$user&source=eq.spotify")
    }

    suspend fun syncPlaylists(userId: String): List<SpotifyPlaylistSummaryDto> {
        requireConfigured()
        var offset = 0
        var pages = 0
        val seen = LinkedHashSet<String>()
        while (pages < 40) {
            val root = api(userId, "/me/playlists", "limit=50&offset=$offset") ?: break
            val items = root["items"].asArrayOrNull() ?: break
            val rows = items.mapNotNull { item ->
                val obj = item.asObjectOrNull() ?: return@mapNotNull null
                val id = obj["id"].asStringOrNull() ?: return@mapNotNull null
                seen += id
                buildJsonObject {
                    put("user_id", userId)
                    put("spotify_playlist_id", id)
                    put("name", obj["name"].asStringOrNull() ?: "Spotify playlist")
                    put("description", obj["description"].asStringOrNull().orEmpty().take(1_000))
                    put("artwork_url", firstImage(obj["images"]))
                    put("owner_name", obj.str("owner", "display_name"))
                    put("owner_id", obj.str("owner", "id"))
                    put("track_count", obj.int("tracks", "total") ?: 0)
                    put("snapshot_id", obj["snapshot_id"].asStringOrNull())
                    put("is_public", obj["public"].asBooleanOrNull())
                    put("is_collaborative", obj["collaborative"].asBooleanOrNull())
                    put("origin", "oauth")
                    put("last_synced_at", Instant.now().toString())
                    put("updated_at", Instant.now().toString())
                }
            }
            if (rows.isNotEmpty()) {
                supabase.insert(
                    "spotify_playlists",
                    rows,
                    onConflict = "user_id,spotify_playlist_id",
                )
            }
            val next = root["next"].asStringOrNull()
            pages += 1
            if (next == null || items.size < 50) break
            offset += 50
        }
        return storedPlaylists(userId)
    }

    suspend fun storedPlaylists(userId: String): List<SpotifyPlaylistSummaryDto> {
        val query = "user_id=${supabase.eq(userId)}&select=*&order=name.asc&limit=500"
        return supabase.select("spotify_playlists", query).mapNotNull { row ->
            val spotifyId = row["spotify_playlist_id"].asStringOrNull() ?: return@mapNotNull null
            SpotifyPlaylistSummaryDto(
                id = "spotify:playlist:$spotifyId",
                spotifyPlaylistId = spotifyId,
                name = row["name"].asStringOrNull() ?: "Spotify playlist",
                description = row["description"].asStringOrNull().orEmpty(),
                artworkUrl = row["artwork_url"].asStringOrNull(),
                ownerName = row["owner_name"].asStringOrNull(),
                ownerId = row["owner_id"].asStringOrNull(),
                trackCount = row["track_count"].asIntOrNull() ?: 0,
                isPublic = row["is_public"].asBooleanOrNull(),
                isCollaborative = row["is_collaborative"].asBooleanOrNull(),
                snapshotId = row["snapshot_id"].asStringOrNull(),
                lastSyncedAt = row["last_synced_at"].asStringOrNull(),
                libraryPlaylistId = null,
            )
        }
    }

    suspend fun playlist(
        userId: String,
        spotifyPlaylistId: String,
        refresh: Boolean,
        matcher: SpotifyMatchingService,
    ): SpotifyPlaylistDto? {
        val playlistRow = supabase.maybeSingle(
            "spotify_playlists",
            "user_id=${supabase.eq(userId)}&spotify_playlist_id=${supabase.eq(spotifyPlaylistId)}",
        ) ?: return null
        val playlistDbId = playlistRow["id"].asStringOrNull()
            ?: throw ApiException(502, "supabase_error", "Spotify playlist row is missing its id")
        var trackRows = supabase.select(
            "spotify_playlist_tracks",
            "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(playlistDbId)}&select=*&order=position.asc&limit=5000",
        )
        if (refresh || trackRows.isEmpty()) {
            if (refresh) {
                supabase.delete("spotify_playlist_tracks", "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(playlistDbId)}")
            }
            var offset = 0
            var pages = 0
            var total = 0
            while (pages < 100) {
                val root = api(userId, "/playlists/${enc(spotifyPlaylistId)}/tracks", "limit=100&offset=$offset")
                    ?: break
                val items = root["items"].asArrayOrNull() ?: break
                val rows = items.mapIndexedNotNull { index, element ->
                    val item = element.asObjectOrNull() ?: return@mapIndexedNotNull null
                    val track = item["track"].asObjectOrNull()
                    if (track == null) {
                        val position = offset + index
                        buildJsonObject {
                            put("user_id", userId)
                            put("playlist_id", playlistDbId)
                            put("spotify_track_id", "unavailable-$position")
                            put("spotify_uri", null)
                            put("position", position)
                            put("track_name", "Unavailable Spotify track")
                            put("artist_names", JsonArray(emptyList()))
                            put("album_name", null)
                            put("artwork_url", firstImage(playlistRow["artwork_url"]))
                            put("duration_ms", 0)
                            put("is_local", false)
                            put("is_available", false)
                            put("match_status", "unavailable")
                        }
                    } else {
                        val data = parseSpotifyTrack(track, item["added_at"].asStringOrNull(), offset + index)
                        trackRow(userId, playlistDbId, data)
                    }
                }
                if (rows.isNotEmpty()) {
                    supabase.insert("spotify_playlist_tracks", rows, onConflict = "playlist_id,position")
                    total += rows.size
                }
                pages += 1
                val next = root["next"].asStringOrNull()
                if (next == null || items.size < 100) break
                offset += 100
            }
            if (total > 0) {
                supabase.update(
                    "spotify_playlists",
                    "user_id=${supabase.eq(userId)}&id=${supabase.eq(playlistDbId)}",
                    buildJsonObject {
                        put("track_count", total)
                        put("last_synced_at", Instant.now().toString())
                    },
                )
            }
            trackRows = supabase.select(
                "spotify_playlist_tracks",
                "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(playlistDbId)}&select=*&order=position.asc&limit=5000",
            )
        }

        val tracks = trackRows.map(::trackFromRow)
        val pendingBefore = tracks.count { it.matchStatus == "pending" && it.isAvailable && !it.isLocal }
        if (pendingBefore > 0) {
            matcher.ensureMatches(userId, tracks.filter { it.matchStatus == "pending" }.map { it.toTrackData() }, limit = 40)
            trackRows = supabase.select(
                "spotify_playlist_tracks",
                "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(playlistDbId)}&select=*&order=position.asc&limit=5000",
            )
        }
        val finalTracks = enrichTracks(userId, trackRows.map(::trackFromRow))
        matcher.mirrorPlaylist(userId, playlistRow, finalTracks)
        val libraryId = matcher.libraryPlaylistId(userId, spotifyPlaylistId)
        return SpotifyPlaylistDto(
            playlist = summaryFromRow(playlistRow).copy(libraryPlaylistId = libraryId),
            tracks = finalTracks,
            pendingMatches = finalTracks.count { it.matchStatus == "pending" },
            matchStats = stats(finalTracks),
        )
    }

    suspend fun likedPage(
        userId: String,
        offset: Int,
        limit: Int,
        refresh: Boolean,
        matcher: SpotifyMatchingService,
    ): SpotifySavedPageDto {
        if (refresh) requireConfigured()
        if (refresh) {
            var pageOffset = 0
            var pages = 0
            while (pages < 100) {
                val root = api(userId, "/me/tracks", "limit=50&offset=$pageOffset") ?: break
                val items = root["items"].asArrayOrNull() ?: break
                val rows = items.mapIndexedNotNull { index, element ->
                    val item = element.asObjectOrNull() ?: return@mapIndexedNotNull null
                    val track = item["track"].asObjectOrNull() ?: return@mapIndexedNotNull null
                    val data = parseSpotifyTrack(track, item["added_at"].asStringOrNull(), pageOffset + index)
                    savedTrackRow(userId, data)
                }
                if (rows.isNotEmpty()) {
                    supabase.insert("spotify_saved_tracks", rows, onConflict = "user_id,spotify_track_id")
                }
                pages += 1
                if (root["next"].asStringOrNull() == null || items.size < 50) break
                pageOffset += 50
            }
        }
        var rows = supabase.select(
            "spotify_saved_tracks",
            "user_id=${supabase.eq(userId)}&select=*&order=added_at.desc.nullslast&offset=$offset&limit=$limit",
        )
        val mapped = rows.map(::savedTrackFromRow)
        val pending = mapped.filter { it.matchStatus == "pending" && it.isAvailable && !it.isLocal }
        if (pending.isNotEmpty()) {
            matcher.ensureMatches(userId, pending.map { it.toTrackData() }, limit = 30)
            rows = supabase.select(
                "spotify_saved_tracks",
                "user_id=${supabase.eq(userId)}&select=*&order=added_at.desc.nullslast&offset=$offset&limit=$limit",
            )
        }
        val finalTracks = enrichTracks(userId, rows.map(::savedTrackFromRow))
        matcher.mirrorLikedSongs(userId)
        val total = totalSaved(userId)
        return SpotifySavedPageDto(
            tracks = finalTracks,
            total = total,
            offset = offset,
            limit = limit,
            nextOffset = if (offset + finalTracks.size < total) offset + finalTracks.size else null,
            pendingMatches = finalTracks.count { it.matchStatus == "pending" },
            matchStats = stats(finalTracks),
        )
    }

    suspend fun likedCount(userId: String): Int = totalSaved(userId)

    suspend fun matchPlaylist(
        userId: String,
        spotifyPlaylistId: String,
        limit: Int,
        matcher: SpotifyMatchingService,
    ): SpotifyMatchBatchResultDto {
        val playlist = supabase.maybeSingle(
            "spotify_playlists",
            "user_id=${supabase.eq(userId)}&spotify_playlist_id=${supabase.eq(spotifyPlaylistId)}",
        ) ?: throw ApiException(404, "spotify_playlist_not_found", "Spotify playlist not found")
        val playlistDbId = playlist["id"].asStringOrNull().orEmpty()
        val rows = supabase.select(
            "spotify_playlist_tracks",
            "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(playlistDbId)}&match_status=in.(pending,unmatched)&select=*&order=position.asc&limit=${limit.coerceIn(1, 100)}",
        )
        return matcher.matchBatch(userId, rows.mapNotNull(::rowToData), limit)
    }

    suspend fun matchLiked(userId: String, limit: Int, matcher: SpotifyMatchingService): SpotifyMatchBatchResultDto {
        val rows = supabase.select(
            "spotify_saved_tracks",
            "user_id=${supabase.eq(userId)}&match_status=in.(pending,unmatched)&select=*&limit=${limit.coerceIn(1, 100)}",
        )
        return matcher.matchBatch(userId, rows.mapNotNull(::rowToData), limit)
    }

    private fun rowToData(row: JsonObject): SpotifyTrackData? {
        val id = row["spotify_track_id"].asStringOrNull() ?: return null
        val name = row["track_name"].asStringOrNull() ?: return null
        return SpotifyTrackData(
            spotifyTrackId = id,
            uri = row["spotify_uri"].asStringOrNull(),
            name = name,
            artists = row.stringList("artist_names"),
            albumName = row["album_name"].asStringOrNull(),
            artworkUrl = row["artwork_url"].asStringOrNull(),
            durationMs = row["duration_ms"].asIntOrNull() ?: 0,
            addedAt = row["added_at"].asStringOrNull(),
            position = row["position"].asIntOrNull(),
            isLocal = row["is_local"].asBooleanOrNull() == true,
            isAvailable = row["is_available"].asBooleanOrNull() != false &&
                row["match_status"].asStringOrNull() != "unavailable",
        )
    }

    suspend fun syncLiked(userId: String, matcher: SpotifyMatchingService): Int {
        likedPage(userId, 0, 50, refresh = true, matcher = matcher)
        return totalSaved(userId)
    }

    suspend fun allStoredTracks(userId: String): List<SpotifyTrackDto> {
        val playlistRows = supabase.select(
            "spotify_playlist_tracks",
            "user_id=${supabase.eq(userId)}&select=*&order=created_at.desc&limit=5000",
        ).map(::trackFromRow)
        val savedRows = supabase.select(
            "spotify_saved_tracks",
            "user_id=${supabase.eq(userId)}&select=*&order=last_synced_at.desc&limit=5000",
        ).map(::savedTrackFromRow)
        val seen = HashSet<String>()
        return (playlistRows + savedRows).filter { seen.add(it.spotifyTrackId) }
    }

    suspend fun matchStats(userId: String): SpotifyMatchStatsDto =
        stats(enrichTracks(userId, allStoredTracks(userId)))

    suspend fun refreshTokens(userId: String): Unit {
        // Force a refresh so an expired/revoked token is detected before a sync.
        loadAccessToken(userId, forceRefresh = true)
    }

    private suspend fun enrichTracks(userId: String, tracks: List<SpotifyTrackDto>): List<SpotifyTrackDto> {
        if (tracks.isEmpty()) return emptyList()
        val ids = tracks.map { it.spotifyTrackId }.distinct()
        val matches = loadMatches(userId, ids)
        return tracks.map { track ->
            val match = matches[track.spotifyTrackId]
            if (match == null) track else track.copy(
                matchStatus = match["status"].asStringOrNull() ?: track.matchStatus,
                matchConfidence = match["confidence"].asDoubleOrNull(),
                youtubeTrack = match["youtube_track"].asObjectOrNull()?.let { json ->
                    runCatching {
                        AppJson.decodeFromJsonElement(MusicTrackDto.serializer(), json)
                    }.getOrNull()
                },
                candidates = match["candidates"].asArrayOrNull()?.mapNotNull { item ->
                    runCatching {
                        AppJson.decodeFromJsonElement(SpotifyCandidateDto.serializer(), item)
                    }.getOrNull()
                }.orEmpty(),
            )
        }
    }

    suspend fun loadMatches(userId: String, spotifyTrackIds: List<String>): Map<String, JsonObject> {
        if (spotifyTrackIds.isEmpty()) return emptyMap()
        val out = HashMap<String, JsonObject>()
        for (chunk in spotifyTrackIds.chunked(80)) {
            val safe = chunk.filter { it.matches(SAFE_ID) }
            if (safe.isEmpty()) continue
            val rows = supabase.select(
                "spotify_track_matches",
                "user_id=${supabase.eq(userId)}&spotify_track_id=in.(${safe.joinToString(",")})&select=*&limit=100",
            )
            for (row in rows) {
                row["spotify_track_id"].asStringOrNull()?.let { out[it] = row }
            }
        }
        return out
    }

    private suspend fun loadConnection(userId: String): JsonObject? =
        supabase.maybeSingle("spotify_connections", "user_id=${supabase.eq(userId)}")

    private suspend fun loadAccessToken(userId: String, forceRefresh: Boolean = false): String {
        val row = loadConnection(userId)
            ?: throw ApiException(409, "spotify_not_connected", "Connect Spotify before using this feature")
        val key = config.tokenEncryptionKey
            ?: throw ApiException(503, "spotify_not_configured", "Spotify token encryption is not configured")
        val expiresAt = runCatching { Instant.parse(row["token_expires_at"].asStringOrNull()) }.getOrNull()
        if (!forceRefresh && expiresAt != null && expiresAt.isAfter(Instant.now().plusSeconds(90))) {
            return TokenCrypto.decrypt(
                row["access_token_ciphertext"].asStringOrNull()
                    ?: throw ApiException(409, "spotify_reconnect_required", "Spotify access token is missing"),
                key,
            )
        }
        val lock = refreshLocks.getOrPut(userId) { Mutex() }
        return lock.withLock {
            val latest = loadConnection(userId)
                ?: throw ApiException(409, "spotify_not_connected", "Connect Spotify before using this feature")
            val latestExpires = runCatching { Instant.parse(latest["token_expires_at"].asStringOrNull()) }.getOrNull()
            if (!forceRefresh && latestExpires != null && latestExpires.isAfter(Instant.now().plusSeconds(90))) {
                return@withLock TokenCrypto.decrypt(latest["access_token_ciphertext"].asStringOrNull()!!, key)
            }
            val refresh = TokenCrypto.decrypt(
                latest["refresh_token_ciphertext"].asStringOrNull()
                    ?: throw ApiException(409, "spotify_reconnect_required", "Spotify refresh token is missing"),
                key,
            )
            try {
                val refreshed = refreshToken(refresh)
                supabase.update(
                    "spotify_connections",
                    "user_id=${supabase.eq(userId)}",
                    buildJsonObject {
                        put("access_token_ciphertext", TokenCrypto.encrypt(refreshed.accessToken, key))
                        put("refresh_token_ciphertext", TokenCrypto.encrypt(refreshed.refreshToken, key))
                        put("token_expires_at", refreshed.expiresAt.toString())
                        put("scopes", JsonArray((latest.stringList("scopes").ifEmpty { refreshed.scopes }).map {
                            kotlinx.serialization.json.JsonPrimitive(it)
                        }))
                        put("updated_at", Instant.now().toString())
                    },
                )
                refreshed.accessToken
            } catch (error: ApiException) {
                if (error.code == "spotify_reconnect_required" || error.code == "spotify_invalid_grant") {
                    disconnect(userId)
                }
                throw error
            }
        }
    }

    private suspend fun api(userId: String, path: String, query: String = ""): JsonObject? {
        var token = loadAccessToken(userId)
        var attempt = 0
        while (attempt < 2) {
            val result = spotifyGet(path, query, token)
            if (result.status == 401 && attempt == 0) {
                token = loadAccessToken(userId, forceRefresh = true)
                attempt += 1
                continue
            }
            if (result.status == 429 && attempt == 0) {
                val delayMs = result.retryAfter?.toLongOrNull()?.times(1_000)?.coerceIn(200, 2_500) ?: 1_000
                delay(delayMs)
                attempt += 1
                continue
            }
            if (result.status == 204) return JsonObject(emptyMap())
            if (result.status == 403) {
                throw ApiException(403, "spotify_scope_missing", "Spotify did not grant the scope needed for this request")
            }
            if (result.status == 404) return null
            if (result.status !in 200..299) {
                throw ApiException(
                    502,
                    "spotify_api_error",
                    "Spotify returned HTTP ${result.status} for this request",
                )
            }
            return runCatching { AppJson.parseToJsonElement(result.body).asObjectOrNull() }.getOrNull()
        }
        throw ApiException(502, "spotify_api_error", "Spotify could not complete this request")
    }

    private suspend fun spotifyGet(path: String, query: String, accessToken: String): ApiResult {
        val url = "https://api.spotify.com/v1$path" + if (query.isBlank()) "" else "?$query"
        val response = http.get(
            url,
            mapOf(
                "Authorization" to "Bearer $accessToken",
                "Accept" to "application/json",
            ),
            12_000,
        )
        return ApiResult(response.status, response.body, response.header("Retry-After"))
    }

    private suspend fun exchangeCode(code: String): TokenSet {
        requireConfigured()
        val basic = Base64.getEncoder().encodeToString(
            "${config.spotifyClientId}:${config.spotifyClientSecret}".toByteArray(StandardCharsets.UTF_8),
        )
        val response = http.postForm(
            "https://accounts.spotify.com/api/token",
            form(
                mapOf(
                    "grant_type" to "authorization_code",
                    "code" to code,
                    "redirect_uri" to config.spotifyRedirectUri!!,
                ),
            ),
            mapOf("Authorization" to "Basic $basic", "Accept" to "application/json"),
            12_000,
        )
        return parseToken(response, null)
    }

    private suspend fun refreshToken(refreshToken: String): TokenSet {
        requireConfigured()
        val basic = Base64.getEncoder().encodeToString(
            "${config.spotifyClientId}:${config.spotifyClientSecret}".toByteArray(StandardCharsets.UTF_8),
        )
        val response = http.postForm(
            "https://accounts.spotify.com/api/token",
            form(
                mapOf(
                    "grant_type" to "refresh_token",
                    "refresh_token" to refreshToken,
                ),
            ),
            mapOf("Authorization" to "Basic $basic", "Accept" to "application/json"),
            12_000,
        )
        return parseToken(response, refreshToken)
    }

    private fun parseToken(response: TextHttpResponse, previousRefresh: String?): TokenSet {
        if (response.status !in 200..299) {
            val error = runCatching {
                AppJson.parseToJsonElement(response.body).asObjectOrNull()?.get("error").asStringOrNull()
            }.getOrNull()
            if (error == "invalid_grant") {
                throw ApiException(409, "spotify_reconnect_required", "Spotify authorization has expired. Reconnect Spotify.")
            }
            throw ApiException(502, "spotify_token_error", "Spotify could not complete authorization")
        }
        val root = runCatching { AppJson.parseToJsonElement(response.body).asObjectOrNull() }.getOrNull()
            ?: throw ApiException(502, "spotify_token_error", "Spotify returned an invalid token response")
        val access = root["access_token"].asStringOrNull()
            ?: throw ApiException(502, "spotify_token_error", "Spotify did not return an access token")
        val refresh = root["refresh_token"].asStringOrNull() ?: previousRefresh
        if (refresh.isNullOrBlank()) {
            throw ApiException(409, "spotify_reconnect_required", "Spotify did not return a refresh token. Reconnect Spotify.")
        }
        val expiresIn = root["expires_in"].asLongOrNull() ?: 3_600L
        val scope = root["scope"].asStringOrNull()?.split(' ')?.filter(String::isNotBlank).orEmpty()
        return TokenSet(access, refresh, Instant.now().plusSeconds(expiresIn.coerceAtLeast(60)), scope)
    }

    private suspend fun apiProfile(accessToken: String): JsonObject {
        val response = http.get(
            "https://api.spotify.com/v1/me",
            mapOf("Authorization" to "Bearer $accessToken", "Accept" to "application/json"),
            10_000,
        )
        if (response.status !in 200..299) {
            throw ApiException(502, "spotify_profile_error", "Spotify profile could not be loaded")
        }
        return runCatching { AppJson.parseToJsonElement(response.body).asObjectOrNull() }.getOrNull()
            ?: throw ApiException(502, "spotify_profile_error", "Spotify returned an invalid profile")
    }

    private fun parseSpotifyTrack(obj: JsonObject, addedAt: String?, position: Int): SpotifyTrackData {
        val artists = obj["artists"].asArrayOrNull()?.mapNotNull {
            it.asObjectOrNull()?.get("name").asStringOrNull()
        }.orEmpty()
        val id = obj["id"].asStringOrNull() ?: ("unavailable-$position")
        val isLocal = obj["is_local"].asBooleanOrNull() == true
        val playable = obj["is_playable"].asBooleanOrNull() != false &&
            obj["restrictions"].asObjectOrNull() == null &&
            obj["type"].asStringOrNull() != "episode"
        return SpotifyTrackData(
            spotifyTrackId = id,
            uri = obj["uri"].asStringOrNull(),
            name = obj["name"].asStringOrNull() ?: "Unavailable Spotify track",
            artists = artists,
            albumName = obj.str("album", "name"),
            artworkUrl = firstImage(obj.arr("album", "images")),
            durationMs = obj["duration_ms"].asIntOrNull() ?: 0,
            addedAt = addedAt,
            position = position,
            isLocal = isLocal,
            isAvailable = playable && !isLocal,
        )
    }

    private fun trackRow(userId: String, playlistDbId: String, data: SpotifyTrackData): JsonObject =
        buildJsonObject {
            put("user_id", userId)
            put("playlist_id", playlistDbId)
            put("spotify_track_id", data.spotifyTrackId)
            put("spotify_uri", data.uri)
            put("position", data.position ?: 0)
            put("track_name", data.name)
            put("artist_names", JsonArray(data.artists.map { kotlinx.serialization.json.JsonPrimitive(it) }))
            put("album_name", data.albumName)
            put("artwork_url", data.artworkUrl)
            put("duration_ms", data.durationMs)
            put("added_at", data.addedAt)
            put("is_local", data.isLocal)
            put("is_available", data.isAvailable)
            put("match_status", if (!data.isAvailable) "unavailable" else "pending")
        }

    private fun savedTrackRow(userId: String, data: SpotifyTrackData): JsonObject =
        buildJsonObject {
            put("user_id", userId)
            put("spotify_track_id", data.spotifyTrackId)
            put("spotify_uri", data.uri)
            put("track_name", data.name)
            put("artist_names", JsonArray(data.artists.map { kotlinx.serialization.json.JsonPrimitive(it) }))
            put("album_name", data.albumName)
            put("artwork_url", data.artworkUrl)
            put("duration_ms", data.durationMs)
            put("added_at", data.addedAt)
            put("match_status", if (!data.isAvailable) "unavailable" else "pending")
            put("last_synced_at", Instant.now().toString())
        }

    private fun trackFromRow(row: JsonObject): SpotifyTrackDto {
        val id = row["spotify_track_id"].asStringOrNull() ?: ""
        val artistNames = row.stringList("artist_names")
        return SpotifyTrackDto(
            id = "spotify:track:$id",
            spotifyTrackId = id,
            spotifyUri = row["spotify_uri"].asStringOrNull(),
            name = row["track_name"].asStringOrNull() ?: "Unavailable Spotify track",
            artists = artistNames,
            artistName = artistNames.joinToString(", "),
            albumName = row["album_name"].asStringOrNull(),
            artworkUrl = row["artwork_url"].asStringOrNull(),
            durationMs = row["duration_ms"].asIntOrNull() ?: 0,
            addedAt = row["added_at"].asStringOrNull(),
            position = row["position"].asIntOrNull(),
            isLocal = row["is_local"].asBooleanOrNull() == true,
            isAvailable = row["is_available"].asBooleanOrNull() != false,
            matchStatus = row["match_status"].asStringOrNull() ?: "pending",
            matchConfidence = row["match_confidence"].asDoubleOrNull(),
            youtubeTrack = row["youtube_track"].asObjectOrNull()?.let { json ->
                runCatching { AppJson.decodeFromJsonElement(MusicTrackDto.serializer(), json) }.getOrNull()
            },
        )
    }

    private fun savedTrackFromRow(row: JsonObject): SpotifyTrackDto {
        val data = SpotifyTrackData(
            spotifyTrackId = row["spotify_track_id"].asStringOrNull() ?: "",
            uri = row["spotify_uri"].asStringOrNull(),
            name = row["track_name"].asStringOrNull() ?: "Unavailable Spotify track",
            artists = row.stringList("artist_names"),
            albumName = row["album_name"].asStringOrNull(),
            artworkUrl = row["artwork_url"].asStringOrNull(),
            durationMs = row["duration_ms"].asIntOrNull() ?: 0,
            addedAt = row["added_at"].asStringOrNull(),
            isAvailable = row["match_status"].asStringOrNull() != "unavailable",
        )
        return SpotifyTrackDto(
            id = "spotify:track:${data.spotifyTrackId}",
            spotifyTrackId = data.spotifyTrackId,
            spotifyUri = data.uri,
            name = data.name,
            artists = data.artists,
            artistName = data.artistName,
            albumName = data.albumName,
            artworkUrl = data.artworkUrl,
            durationMs = data.durationMs,
            addedAt = data.addedAt,
            isAvailable = data.isAvailable,
            matchStatus = row["match_status"].asStringOrNull() ?: "pending",
            matchConfidence = row["match_confidence"].asDoubleOrNull(),
            youtubeTrack = row["youtube_track"].asObjectOrNull()?.let { json ->
                runCatching { AppJson.decodeFromJsonElement(MusicTrackDto.serializer(), json) }.getOrNull()
            },
        )
    }

    private fun summaryFromRow(row: JsonObject): SpotifyPlaylistSummaryDto {
        val spotifyId = row["spotify_playlist_id"].asStringOrNull().orEmpty()
        return SpotifyPlaylistSummaryDto(
            id = "spotify:playlist:$spotifyId",
            spotifyPlaylistId = spotifyId,
            name = row["name"].asStringOrNull() ?: "Spotify playlist",
            description = row["description"].asStringOrNull().orEmpty(),
            artworkUrl = row["artwork_url"].asStringOrNull(),
            ownerName = row["owner_name"].asStringOrNull(),
            ownerId = row["owner_id"].asStringOrNull(),
            trackCount = row["track_count"].asIntOrNull() ?: 0,
            isPublic = row["is_public"].asBooleanOrNull(),
            isCollaborative = row["is_collaborative"].asBooleanOrNull(),
            snapshotId = row["snapshot_id"].asStringOrNull(),
            lastSyncedAt = row["last_synced_at"].asStringOrNull(),
        )
    }

    private fun stats(tracks: List<SpotifyTrackDto>): SpotifyMatchStatsDto {
        var matched = 0
        var partial = 0
        var unmatched = 0
        var unavailable = 0
        var pending = 0
        for (track in tracks) {
            when (track.matchStatus) {
                "matched" -> matched += 1
                "partial" -> partial += 1
                "unavailable" -> unavailable += 1
                "pending" -> pending += 1
                else -> unmatched += 1
            }
        }
        return SpotifyMatchStatsDto(matched, partial, unmatched, unavailable, pending, tracks.size)
    }

    private suspend fun totalSaved(userId: String): Int {
        val rows = supabase.select(
            "spotify_saved_tracks",
            "user_id=${supabase.eq(userId)}&select=spotify_track_id&limit=10000",
        )
        return rows.size
    }

    /**
     * OAuth and token refresh need both Spotify credentials and Supabase storage.
     * Import, matching and previously stored data do not call this guard.
     */
    fun requireConfigured() {
        if (!config.spotifyConfigured) {
            throw ApiException(
                503,
                "spotify_not_configured",
                "Spotify integration is not configured on this backend",
            )
        }
        if (!supabase.enabled) {
            throw ApiException(
                503,
                "supabase_not_configured",
                "Supabase is required for Spotify OAuth on this backend",
            )
        }
    }

    private fun firstImage(value: kotlinx.serialization.json.JsonElement?): String? =
        value.asArrayOrNull()?.firstNotNullOfOrNull { image ->
            image.asObjectOrNull()?.get("url").asStringOrNull()
        }

    private fun JsonObject.int(vararg path: String): Int? {
        var current: kotlinx.serialization.json.JsonElement? = this
        for (part in path) {
            current = current.asObjectOrNull()?.get(part) ?: return null
        }
        return current.asIntOrNull()
    }

    private fun JsonObject.bool(vararg path: String): Boolean? {
        var current: kotlinx.serialization.json.JsonElement? = this
        for (part in path) {
            current = current.asObjectOrNull()?.get(part) ?: return null
        }
        return current.asBooleanOrNull()
    }

    private fun form(values: Map<String, String>): String =
        values.entries.joinToString("&") { (key, value) -> "${enc(key)}=${enc(value)}" }

    private fun enc(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun appendQuery(url: String, vararg pairs: String): String {
        val separator = if (url.contains('?')) '&' else '?'
        return url + separator + pairs.joinToString("&")
    }

    private fun SpotifyTrackDto.toTrackData(): SpotifyTrackData =
        SpotifyTrackData(
            spotifyTrackId = spotifyTrackId,
            uri = spotifyUri,
            name = name,
            artists = artists,
            albumName = albumName,
            artworkUrl = artworkUrl,
            durationMs = durationMs,
            addedAt = addedAt,
            position = position,
            isLocal = isLocal,
            isAvailable = isAvailable,
        )

    companion object {
        val SCOPES = listOf(
            "playlist-read-private",
            "playlist-read-collaborative",
            "user-library-read",
            "user-read-private",
        )
        private val SAFE_ID = Regex("^[A-Za-z0-9._-]{1,200}$")
    }
}
