package com.reelhouse.music

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID

class SpotifyMatchingService(
    private val config: AppConfig,
    private val supabase: SupabaseRest,
    private val youtube: YouTubeMusicService,
    private val logger: AppLogger,
) {
    suspend fun ensureMatches(
        userId: String,
        tracks: List<SpotifyTrackData>,
        limit: Int = 30,
        retryUnmatched: Boolean = false,
    ): Int {
        if (tracks.isEmpty()) return 0
        val existing = loadExisting(userId, tracks.map { it.spotifyTrackId })
        val pending = tracks.asSequence()
            .filter { it.isAvailable && !it.isLocal }
            .filter {
                val status = existing[it.spotifyTrackId]?.get("status").asStringOrNull()
                if (retryUnmatched) status !in setOf("matched", "partial", "unavailable")
                else status == null || status == "pending"
            }
            .distinctBy { it.spotifyTrackId }
            .take(limit)
            .toList()
        if (pending.isEmpty()) return 0

        var attempted = 0
        for (track in pending) {
            try {
                val result = matchOne(track)
                saveMatch(userId, track, result)
                attempted += 1
            } catch (error: Exception) {
                logger.warn(
                    "spotify_match_failed",
                    mapOf(
                        "spotifyTrackId" to track.spotifyTrackId,
                        "type" to error::class.simpleName,
                        "detail" to (error.message ?: "").take(160),
                    ),
                )
            }
        }
        return attempted
    }

    suspend fun manualMatch(userId: String, spotifyTrackId: String, track: MusicTrackDto) {
        if (!VIDEO_ID.matches(track.videoId.orEmpty())) {
            throw ApiException(400, "invalid_video_id", "Choose a valid YouTube Music match")
        }
        val normalizedTrack = track.copy(
            id = "youtube:${track.videoId}",
            provider = "youtube",
            providerId = track.videoId,
            videoId = track.videoId,
            isStreamable = true,
            source = "spotify",
            matchStatus = "matched",
            matchConfidence = 1.0,
        )
        val candidate = SpotifyCandidateDto(
            track = normalizedTrack,
            confidence = 1.0,
            status = "matched",
        )
        val trackData = SpotifyTrackData(
            spotifyTrackId = spotifyTrackId,
            uri = null,
            name = normalizedTrack.title,
            artists = listOf(normalizedTrack.artistName),
            albumName = normalizedTrack.albumTitle,
            artworkUrl = normalizedTrack.artworkUrl,
            durationMs = normalizedTrack.duration * 1000,
            addedAt = null,
            isAvailable = true,
        )
        saveMatch(
            userId,
            trackData,
            MatchResult(
                status = "matched",
                confidence = 1.0,
                youtubeTrack = normalizedTrack,
                candidates = listOf(candidate),
            ),
            manual = true,
        )
        mirrorAllPlaylists(userId)
        mirrorLikedSongs(userId)
    }

    suspend fun mirrorAllPlaylists(userId: String) {
        val playlists = supabase.select(
            "spotify_playlists",
            "user_id=${supabase.eq(userId)}&select=*&limit=500",
        )
        for (playlist in playlists) {
            val id = playlist["id"].asStringOrNull() ?: continue
            val rows = supabase.select(
                "spotify_playlist_tracks",
                "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(id)}&select=*&order=position.asc&limit=5000",
            )
            if (rows.isEmpty()) continue
            val tracks = enrich(userId, rows, fromPlaylist = true)
            mirrorPlaylist(userId, playlist, tracks)
        }
    }

    suspend fun mirrorLikedSongs(userId: String) {
        val rows = supabase.select(
            "spotify_saved_tracks",
            "user_id=${supabase.eq(userId)}&select=*&order=added_at.desc.nullslast&limit=5000",
        )
        if (rows.isEmpty()) return
        val tracks = enrich(userId, rows, fromPlaylist = false)
        val likedRows = tracks.filter { it.matchStatus != "unavailable" }.map { track ->
            val snapshot = track.youtubeTrack ?: spotifySnapshot(track)
            buildJsonObject {
                put("user_id", userId)
                put("track_id", snapshot.id)
                put("track_snapshot", AppJson.encodeToJsonElement(MusicTrackDto.serializer(), snapshot))
                put("liked_at", track.addedAt ?: Instant.now().toString())
                put("source", "spotify")
                put("external_id", track.spotifyTrackId)
            }
        }
        if (likedRows.isNotEmpty()) {
            supabase.insert(
                "music_liked_tracks",
                likedRows,
                onConflict = "user_id,track_id",
                ignoreDuplicates = true,
            )
        }
    }

    suspend fun mirrorPlaylist(
        userId: String,
        playlistRow: JsonObject,
        tracks: List<SpotifyTrackDto>,
    ): String? {
        val spotifyPlaylistId = playlistRow["spotify_playlist_id"].asStringOrNull() ?: return null
        val externalId = "spotify:playlist:$spotifyPlaylistId"
        val title = (playlistRow["name"].asStringOrNull() ?: "Spotify playlist").take(120)
        val description = (playlistRow["description"].asStringOrNull().orEmpty()).take(500)
        val existing = supabase.maybeSingle(
            "music_playlists",
            "user_id=${supabase.eq(userId)}&source=eq.spotify&external_id=${supabase.eq(externalId)}",
        )
        val libraryId = existing?.get("id").asStringOrNull() ?: UUID.randomUUID().toString()
        val row = buildJsonObject {
            put("id", libraryId)
            put("user_id", userId)
            put("title", title)
            put("description", description)
            put("accent", "#1ed760")
            put("source", "spotify")
            put("external_id", externalId)
            put("external_owner", playlistRow["owner_name"].asStringOrNull())
            put("image_url", playlistRow["artwork_url"].asStringOrNull())
            put("imported_at", Instant.now().toString())
            put("updated_at", Instant.now().toString())
        }
        supabase.insert("music_playlists", listOf(row), onConflict = "id")
        supabase.delete("music_playlist_tracks", "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(libraryId)}")
        val trackRows = tracks.mapIndexed { index, track ->
            val snapshot = track.youtubeTrack ?: spotifySnapshot(track)
            buildJsonObject {
                put("playlist_id", libraryId)
                put("user_id", userId)
                // Keep repeated Spotify occurrences instead of collapsing them by
                // the matched YouTube id. The visible snapshot still has the real id.
                put("track_id", "${track.spotifyTrackId}#$index")
                put("track_snapshot", AppJson.encodeToJsonElement(MusicTrackDto.serializer(), snapshot))
                put("position", index)
            }
        }
        if (trackRows.isNotEmpty()) {
            supabase.insert("music_playlist_tracks", trackRows)
        }
        return libraryId
    }

    suspend fun libraryPlaylistId(userId: String, spotifyPlaylistId: String): String? =
        supabase.maybeSingle(
            "music_playlists",
            "user_id=${supabase.eq(userId)}&source=eq.spotify&external_id=${supabase.eq("spotify:playlist:$spotifyPlaylistId")}",
        )?.get("id").asStringOrNull()

    suspend fun matchBatch(
        userId: String,
        tracks: List<SpotifyTrackData>,
        limit: Int,
        retryUnmatched: Boolean = true,
    ): SpotifyMatchBatchResultDto {
        val before = tracks.map { it.spotifyTrackId }.distinct()
        ensureMatches(userId, tracks, limit, retryUnmatched = retryUnmatched)
        val matches = loadExisting(userId, before)
        var matched = 0
        var partial = 0
        var unmatched = 0
        var unavailable = 0
        for (id in before) {
            when (matches[id]?.get("status").asStringOrNull()) {
                "matched" -> matched += 1
                "partial" -> partial += 1
                "unavailable" -> unavailable += 1
                "unmatched" -> unmatched += 1
            }
        }
        val pending = before.count { matches[it]?.get("status").asStringOrNull() == "pending" || matches[it] == null }
        mirrorAllPlaylists(userId)
        mirrorLikedSongs(userId)
        return SpotifyMatchBatchResultDto(
            attempted = matched + partial + unmatched + unavailable,
            matched = matched,
            partial = partial,
            unmatched = unmatched,
            unavailable = unavailable,
            pending = pending,
        )
    }

    private data class MatchResult(
        val status: String,
        val confidence: Double,
        val youtubeTrack: MusicTrackDto?,
        val candidates: List<SpotifyCandidateDto>,
    )

    private suspend fun matchOne(track: SpotifyTrackData): MatchResult {
        val query = "${track.name} ${track.artists.firstOrNull().orEmpty()}".trim().take(160)
        if (query.isBlank()) {
            return MatchResult("unmatched", 0.0, null, emptyList())
        }
        val results = youtube.searchSongs(query, 8)
            .filter { !it.videoId.isNullOrBlank() }
            .distinctBy { it.videoId }
        val scored = results.map { candidate ->
            val titleScore = TextMatch.similarity(track.name, candidate.title)
            val artistScore = track.artists.maxOfOrNull { TextMatch.similarity(it, candidate.artistName) } ?: 0.0
            val durationDiff = if (track.durationMs > 0 && candidate.duration > 0) {
                kotlin.math.abs(track.durationMs / 1000.0 - candidate.duration)
            } else null
            val durationScore = durationDiff?.let { (1.0 - (it / 25.0)).coerceIn(0.0, 1.0) } ?: 0.5
            var confidence = titleScore * 0.52 + artistScore * 0.30 + durationScore * 0.18
            if (durationDiff != null && durationDiff > 35) confidence -= 0.15
            if (versionMismatch(track.name, candidate.title)) confidence -= 0.22
            if (hasVersionMarker(candidate.title) && !hasVersionMarker(track.name)) confidence -= 0.12
            confidence = confidence.coerceIn(0.0, 1.0)
            val status = when {
                confidence >= 0.82 && titleScore >= 0.72 && artistScore >= 0.60 &&
                    (durationDiff == null || durationDiff <= 15) -> "matched"
                confidence >= 0.64 && titleScore >= 0.55 -> "partial"
                else -> "unmatched"
            }
            SpotifyCandidateDto(
                track = candidate,
                confidence = (confidence * 10_000).toInt() / 10_000.0,
                status = status,
            )
        }.sortedByDescending { it.confidence }
        val candidates = scored.take(6)
        val best = candidates.firstOrNull()
        if (best == null || best.status == "unmatched") {
            return MatchResult("unmatched", best?.confidence ?: 0.0, null, candidates)
        }
        return MatchResult(
            status = best.status,
            confidence = best.confidence,
            youtubeTrack = best.track.copy(
                provider = "youtube",
                source = "spotify",
                matchStatus = best.status,
                matchConfidence = best.confidence,
                isStreamable = true,
            ),
            candidates = candidates,
        )
    }

    private suspend fun saveMatch(
        userId: String,
        track: SpotifyTrackData,
        result: MatchResult,
        manual: Boolean = false,
    ) {
        val row = buildJsonObject {
            put("user_id", userId)
            put("spotify_track_id", track.spotifyTrackId)
            put("youtube_video_id", result.youtubeTrack?.videoId)
            put("youtube_title", result.youtubeTrack?.title)
            put("youtube_artist", result.youtubeTrack?.artistName)
            put("youtube_album", result.youtubeTrack?.albumTitle)
            put("youtube_duration_ms", (result.youtubeTrack?.duration ?: 0) * 1000)
            put("confidence", result.confidence)
            put("status", result.status)
            put(
                "candidates",
                AppJson.encodeToJsonElement(ListSerializer(SpotifyCandidateDto.serializer()), result.candidates),
            )
            if (result.youtubeTrack != null) {
                put("youtube_track", AppJson.encodeToJsonElement(MusicTrackDto.serializer(), result.youtubeTrack))
            } else {
                put("youtube_track", JsonNull)
            }
            put("manual", manual)
            put("updated_at", Instant.now().toString())
        }
        supabase.insert(
            "spotify_track_matches",
            listOf(row),
            onConflict = "user_id,spotify_track_id",
        )
        val patch = buildJsonObject {
            put("match_status", result.status)
            put("youtube_video_id", result.youtubeTrack?.videoId)
            put("match_confidence", result.confidence)
            put(
                "match_candidates",
                AppJson.encodeToJsonElement(ListSerializer(SpotifyCandidateDto.serializer()), result.candidates),
            )
            if (result.youtubeTrack != null) {
                put("youtube_track", AppJson.encodeToJsonElement(MusicTrackDto.serializer(), result.youtubeTrack))
            } else {
                put("youtube_track", JsonNull)
            }
        }
        val userIdFilter = "user_id=${supabase.eq(userId)}&spotify_track_id=${supabase.eq(track.spotifyTrackId)}"
        supabase.update("spotify_playlist_tracks", userIdFilter, patch)
        supabase.update("spotify_saved_tracks", userIdFilter, patch)
    }

    private suspend fun loadExisting(userId: String, ids: List<String>): Map<String, JsonObject> {
        if (ids.isEmpty()) return emptyMap()
        val out = HashMap<String, JsonObject>()
        for (chunk in ids.distinct().chunked(80)) {
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

    private suspend fun enrich(
        userId: String,
        rows: List<JsonObject>,
        fromPlaylist: Boolean,
    ): List<SpotifyTrackDto> {
        val ids = rows.mapNotNull { it["spotify_track_id"].asStringOrNull() }
        val matches = loadExisting(userId, ids)
        return rows.map { row ->
            val id = row["spotify_track_id"].asStringOrNull() ?: ""
            val artists = row.stringList("artist_names")
            val match = matches[id]
            SpotifyTrackDto(
                id = "spotify:track:$id",
                spotifyTrackId = id,
                spotifyUri = row["spotify_uri"].asStringOrNull(),
                name = row["track_name"].asStringOrNull() ?: "Unavailable Spotify track",
                artists = artists,
                artistName = artists.joinToString(", "),
                albumName = row["album_name"].asStringOrNull(),
                artworkUrl = row["artwork_url"].asStringOrNull(),
                durationMs = row["duration_ms"].asIntOrNull() ?: 0,
                addedAt = row["added_at"].asStringOrNull(),
                position = if (fromPlaylist) row["position"].asIntOrNull() else null,
                isLocal = row["is_local"].asBooleanOrNull() == true,
                isAvailable = row["is_available"].asBooleanOrNull() != false &&
                    row["match_status"].asStringOrNull() != "unavailable",
                matchStatus = match?.get("status").asStringOrNull()
                    ?: row["match_status"].asStringOrNull()
                    ?: "pending",
                matchConfidence = match?.get("confidence").asDoubleOrNull()
                    ?: row["match_confidence"].asDoubleOrNull(),
                youtubeTrack = match?.get("youtube_track").asObjectOrNull()?.let { json ->
                    runCatching { AppJson.decodeFromJsonElement(MusicTrackDto.serializer(), json) }.getOrNull()
                } ?: row["youtube_track"].asObjectOrNull()?.let { json ->
                    runCatching { AppJson.decodeFromJsonElement(MusicTrackDto.serializer(), json) }.getOrNull()
                },
                candidates = match?.get("candidates").asArrayOrNull()?.mapNotNull { item ->
                    runCatching { AppJson.decodeFromJsonElement(SpotifyCandidateDto.serializer(), item) }.getOrNull()
                }.orEmpty(),
            )
        }
    }

    private fun spotifySnapshot(track: SpotifyTrackDto): MusicTrackDto =
        MusicTrackDto(
            id = "spotify:track:${track.spotifyTrackId}",
            provider = "spotify",
            providerId = track.spotifyTrackId,
            videoId = null,
            title = track.name,
            artistId = "spotify:artist:${track.artists.firstOrNull()?.lowercase()?.replace(Regex("[^a-z0-9]+"), "-").orEmpty()}",
            artistName = track.artistName.ifBlank { "Unknown artist" },
            albumId = null,
            albumTitle = track.albumName,
            artworkUrl = track.artworkUrl,
            duration = track.durationMs / 1000,
            isStreamable = false,
            source = "spotify",
            matchStatus = track.matchStatus,
            matchConfidence = track.matchConfidence,
        )

    private fun hasVersionMarker(value: String): Boolean = MARKERS.containsMatchIn(value.lowercase())

    private fun versionMismatch(spotifyTitle: String, youtubeTitle: String): Boolean {
        val spotifyMarkers = MARKERS.findAll(spotifyTitle.lowercase()).map { it.value }.toSet()
        val youtubeMarkers = MARKERS.findAll(youtubeTitle.lowercase()).map { it.value }.toSet()
        return youtubeMarkers.isNotEmpty() && youtubeMarkers != spotifyMarkers
    }

    private companion object {
        val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
        val SAFE_ID = Regex("^[A-Za-z0-9._-]{1,200}$")
        val MARKERS = Regex("\\b(live|karaoke|cover|instrumental|acoustic|remix|reprise|demo)\\b")
    }
}
