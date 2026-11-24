package com.reelhouse.music

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.zip.ZipInputStream

class SpotifyImportService(
    private val config: AppConfig,
    private val supabase: SupabaseRest,
    private val matcher: SpotifyMatchingService,
    private val analytics: MusicAnalyticsService,
    private val logger: AppLogger,
) {
    private data class ImportedTrack(
        val id: String,
        val uri: String?,
        val name: String,
        val artists: List<String>,
        val album: String?,
        val durationMs: Int,
    )

    private data class ImportedPlaylist(
        val externalId: String,
        val name: String,
        val description: String,
        val tracks: List<ImportedTrack>,
    )

    private data class ImportedAlbum(val id: String, val name: String, val artist: String)
    private data class ImportedArtist(val id: String, val name: String)

    private data class ImportedEvent(
        val fingerprint: String,
        val trackName: String,
        val artistName: String,
        val albumName: String?,
        val uri: String?,
        val playedAt: String?,
        val msPlayed: Int,
        val platform: String?,
        val skipped: Boolean?,
        val shuffle: Boolean?,
        val offline: Boolean?,
        val countsAsPlay: Boolean,
    )

    private data class ImportedSearch(
        val query: String,
        val searchedAt: String?,
        val platform: String?,
        val resultUri: String?,
    )

    private data class TasteData(
        val topArtists: List<String> = emptyList(),
        val topTracks: List<String> = emptyList(),
        val topGenres: List<String> = emptyList(),
    )

    private inner class PreviewSink : Sink {
        var playlists = 0
        var playlistTracks = 0
        var liked = 0
        var albums = 0
        var artists = 0
        var events = 0
        var searches = 0
        var historyStart: String? = null
        var historyEnd: String? = null
        var hasExtended = false
        var hasAccount = false

        override suspend fun playlist(playlist: ImportedPlaylist) {
            playlists += 1
            playlistTracks += playlist.tracks.size
        }

        override suspend fun liked(tracks: List<ImportedTrack>) {
            liked += tracks.size
        }

        override suspend fun albums(items: List<ImportedAlbum>) {
            albums += items.size
        }

        override suspend fun artists(items: List<ImportedArtist>) {
            artists += items.size
        }

        override suspend fun events(events: List<ImportedEvent>, extended: Boolean) {
            this.events += events.size
            if (extended) hasExtended = true else hasAccount = true
            for (event in events) {
                val at = event.playedAt ?: continue
                if (historyStart == null || at < historyStart!!) historyStart = at
                if (historyEnd == null || at > historyEnd!!) historyEnd = at
            }
        }

        override suspend fun searches(items: List<ImportedSearch>) {
            searches += items.size
        }

        override suspend fun taste(data: TasteData) = Unit
    }

    private inner class ImportSink(
        private val userId: String,
        private val jobId: String,
        private val categories: Set<String>,
    ) : Sink {
        var importedPlaylists = 0
        var importedPlaylistTracks = 0
        var importedLiked = 0
        var importedAlbums = 0
        var importedArtists = 0
        var importedEvents = 0
        var importedSearches = 0
        var duplicatesSkipped = 0
        val errors = ArrayList<String>()

        override suspend fun playlist(playlist: ImportedPlaylist) {
            if ("playlists" !in categories) return
            val row = supabase.insertOne(
                "spotify_playlists",
                buildJsonObject {
                    put("user_id", userId)
                    put("spotify_playlist_id", playlist.externalId)
                    put("name", playlist.name.take(200))
                    put("description", playlist.description.take(1_000))
                    put("track_count", playlist.tracks.size)
                    put("origin", "import")
                    put("last_synced_at", Instant.now().toString())
                    put("updated_at", Instant.now().toString())
                },
                onConflict = "user_id,spotify_playlist_id",
            )
            val playlistDbId = row?.get("id").asStringOrNull()
            if (playlistDbId == null) {
                errors += "Could not save playlist ${playlist.name}"
                return
            }
            supabase.delete("spotify_playlist_tracks", "user_id=${supabase.eq(userId)}&playlist_id=${supabase.eq(playlistDbId)}")
            val rows = playlist.tracks.mapIndexed { position, track ->
                buildJsonObject {
                    put("user_id", userId)
                    put("playlist_id", playlistDbId)
                    put("spotify_track_id", track.id)
                    put("spotify_uri", track.uri)
                    put("position", position)
                    put("track_name", track.name)
                    put("artist_names", JsonArray(track.artists.map { JsonPrimitive(it) }))
                    put("album_name", track.album)
                    put("duration_ms", track.durationMs)
                    put("is_local", false)
                    put("is_available", true)
                    put("match_status", "pending")
                }
            }
            if (rows.isNotEmpty()) {
                supabase.insert("spotify_playlist_tracks", rows)
            }
            importedPlaylists += 1
            importedPlaylistTracks += rows.size
        }

        override suspend fun liked(tracks: List<ImportedTrack>) {
            if ("liked" !in categories) return
            val rows = tracks.map { track ->
                buildJsonObject {
                    put("user_id", userId)
                    put("spotify_track_id", track.id)
                    put("spotify_uri", track.uri)
                    put("track_name", track.name)
                    put("artist_names", JsonArray(track.artists.map { JsonPrimitive(it) }))
                    put("album_name", track.album)
                    put("duration_ms", track.durationMs)
                    put("match_status", "pending")
                    put("last_synced_at", Instant.now().toString())
                }
            }
            if (rows.isNotEmpty()) {
                val inserted = supabase.insert(
                    "spotify_saved_tracks",
                    rows,
                    onConflict = "user_id,spotify_track_id",
                ).size
                importedLiked += inserted
                duplicatesSkipped += (rows.size - inserted).coerceAtLeast(0)
            }
        }

        override suspend fun albums(items: List<ImportedAlbum>) {
            if ("library" !in categories) return
            val rows = items.mapNotNull { album ->
                val id = album.id.ifBlank {
                    "spotify:album:" + sha256("${album.name}\u0000${album.artist}").take(32)
                }
                buildJsonObject {
                    put("user_id", userId)
                    put("album_id", id)
                    put(
                        "album_snapshot",
                        buildJsonObject {
                            put("id", id)
                            put("provider", "spotify")
                            put("providerId", id.removePrefix("spotify:album:"))
                            put("kind", "album")
                            put("title", album.name)
                            put("ownerName", album.artist.ifBlank { "Spotify" })
                            put("trackCount", 0)
                            put("tracks", JsonArray(emptyList()))
                            put("source", "spotify")
                        },
                    )
                    put("saved_at", Instant.now().toString())
                    put("source", "spotify")
                    put("external_id", id)
                }
            }
            if (rows.isNotEmpty()) {
                val inserted = supabase.insert(
                    "music_saved_albums",
                    rows,
                    onConflict = "user_id,album_id",
                    ignoreDuplicates = true,
                ).size
                importedAlbums += inserted
            }
        }

        override suspend fun artists(items: List<ImportedArtist>) {
            if ("library" !in categories) return
            val rows = items.mapNotNull { artist ->
                val id = artist.id.ifBlank {
                    "spotify:artist:" + sha256("${artist.name}\u0000artist").take(32)
                }
                buildJsonObject {
                    put("user_id", userId)
                    put("artist_id", id)
                    put(
                        "artist_snapshot",
                        buildJsonObject {
                            put("id", id)
                            put("provider", "spotify")
                            put("providerId", id.removePrefix("spotify:artist:"))
                            put("name", artist.name)
                            put("source", "spotify")
                        },
                    )
                    put("followed_at", Instant.now().toString())
                    put("source", "spotify")
                    put("external_id", id)
                }
            }
            if (rows.isNotEmpty()) {
                val inserted = supabase.insert(
                    "music_followed_artists",
                    rows,
                    onConflict = "user_id,artist_id",
                    ignoreDuplicates = true,
                ).size
                importedArtists += inserted
            }
        }

        override suspend fun events(events: List<ImportedEvent>, extended: Boolean) {
            if ("history" !in categories || events.isEmpty()) return
            val eventRows = ArrayList<JsonObject>(events.size)
            val historyRows = ArrayList<JsonObject>(events.size)
            for (event in events) {
                eventRows += buildJsonObject {
                    put("user_id", userId)
                    put("job_id", jobId)
                    put("fingerprint", event.fingerprint)
                    put("track_name", event.trackName)
                    put("artist_name", event.artistName)
                    put("album_name", event.albumName)
                    put("spotify_track_uri", event.uri)
                    put("played_at", event.playedAt)
                    put("ms_played", event.msPlayed)
                    put("platform", event.platform)
                    put("skipped", event.skipped)
                    put("shuffle", event.shuffle)
                    put("offline", event.offline)
                    put("counts_as_play", event.countsAsPlay)
                }
                if (event.countsAsPlay) {
                    historyRows += buildJsonObject {
                        put("user_id", userId)
                        put("track_id", event.uri ?: "spotify:event:${event.fingerprint}")
                        put("fingerprint", event.fingerprint)
                        put("played_at", event.playedAt ?: Instant.now().toString())
                        put("duration_played_ms", event.msPlayed)
                        put("completed", event.msPlayed >= 30_000)
                        put("source", "spotify")
                        put(
                            "track_snapshot",
                            buildJsonObject {
                                put("id", event.uri ?: "spotify:event:${event.fingerprint}")
                                put("provider", "spotify")
                                put("title", event.trackName)
                                put("artistName", event.artistName)
                                put("artistId", "spotify:artist:unknown")
                                put("albumTitle", event.albumName)
                                put("duration", event.msPlayed / 1000)
                                put("isStreamable", false)
                                put("source", "spotify")
                            },
                        )
                    }
                }
            }
            if (eventRows.isNotEmpty()) {
                val inserted = supabase.insert(
                    "spotify_listening_events",
                    eventRows,
                    onConflict = "user_id,fingerprint",
                    ignoreDuplicates = true,
                ).size
                importedEvents += inserted
                duplicatesSkipped += (eventRows.size - inserted).coerceAtLeast(0)
            }
            if (historyRows.isNotEmpty()) {
                supabase.insert(
                    "listening_history",
                    historyRows,
                    onConflict = "user_id,fingerprint",
                    ignoreDuplicates = true,
                )
            }
        }

        override suspend fun searches(items: List<ImportedSearch>) {
            if ("searches" !in categories || items.isEmpty()) return
            val rows = items.map { search ->
                val fingerprint = sha256(
                    "${search.query}\u0000${search.searchedAt.orEmpty()}\u0000${search.platform.orEmpty()}\u0000${search.resultUri.orEmpty()}",
                )
                buildJsonObject {
                    put("user_id", userId)
                    put("job_id", jobId)
                    put("query", search.query.take(500))
                    put("searched_at", search.searchedAt)
                    put("platform", search.platform)
                    put("result_uri", search.resultUri)
                    put("fingerprint", fingerprint)
                }
            }
            val inserted = supabase.insert(
                "spotify_imported_searches",
                rows,
                onConflict = "user_id,fingerprint",
                ignoreDuplicates = true,
            ).size
            importedSearches += inserted
            duplicatesSkipped += (rows.size - inserted).coerceAtLeast(0)
        }

        override suspend fun taste(data: TasteData) {
            if ("taste" !in categories) return
            if (data.topArtists.isEmpty() && data.topTracks.isEmpty() && data.topGenres.isEmpty()) return
            supabase.insert(
                "spotify_taste_profiles",
                listOf(
                    buildJsonObject {
                        put("user_id", userId)
                        put("top_artists", JsonArray(data.topArtists.take(100).map { JsonPrimitive(it) }))
                        put("top_tracks", JsonArray(data.topTracks.take(100).map { JsonPrimitive(it) }))
                        put("top_genres", JsonArray(data.topGenres.take(100).map { JsonPrimitive(it) }))
                        put("imported_at", Instant.now().toString())
                        put("updated_at", Instant.now().toString())
                    },
                ),
                onConflict = "user_id",
            )
        }
    }

    private interface Sink {
        suspend fun playlist(playlist: ImportedPlaylist)
        suspend fun liked(tracks: List<ImportedTrack>)
        suspend fun albums(items: List<ImportedAlbum>)
        suspend fun artists(items: List<ImportedArtist>)
        suspend fun events(events: List<ImportedEvent>, extended: Boolean)
        suspend fun searches(items: List<ImportedSearch>)
        suspend fun taste(data: TasteData)
    }

    suspend fun preview(userId: String, archiveName: String, body: InputStream): SpotifyImportPreviewDto =
        withContext(Dispatchers.IO) {
            val sink = PreviewSink()
            val files = processArchive(archiveName, body, sink)
            SpotifyImportPreviewDto(
                files = files,
                playlists = sink.playlists,
                playlistTracks = sink.playlistTracks,
                likedSongs = sink.liked,
                albums = sink.albums,
                artists = sink.artists,
                listeningEvents = sink.events,
                historyStart = sink.historyStart,
                historyEnd = sink.historyEnd,
                searches = sink.searches,
                parsedFiles = files.count { it.parsed },
                failedFiles = files.count { !it.parsed },
                hasExtendedHistory = sink.hasExtended,
                hasAccountData = sink.hasAccount,
                notes = buildList {
                    if (!sink.hasExtended) add("No Extended Streaming History file was detected. Account data usually contains only recent history.")
                    if (sink.searches == 0) add("No Spotify search history was included in this archive.")
                    add("Only music-library and listening information is imported. Payment, billing, address, phone, location and message data are ignored.")
                },
            )
        }

    suspend fun import(
        userId: String,
        archiveName: String,
        body: InputStream,
        categories: Set<String>,
        jobId: String?,
        final: Boolean,
    ): SpotifyImportResultDto {
        val actualJobId = jobId ?: createJob(userId, archiveName, categories)
        val sink = ImportSink(userId, actualJobId, categories)
        val files = try {
            withContext(Dispatchers.IO) { processArchive(archiveName, body, sink) }
        } catch (error: Exception) {
            logger.warn(
                "spotify_import_failed",
                mapOf("jobId" to actualJobId, "type" to error::class.simpleName, "detail" to (error.message ?: "").take(160)),
            )
            markJobFailed(userId, actualJobId, error.message ?: "Import failed")
            throw if (error is ApiException) error else ApiException(400, "import_failed", "Spotify export could not be imported")
        }
        val result = SpotifyImportResultDto(
            jobId = actualJobId,
            status = if (final) "completed" else "processing",
            files = files,
            importedPlaylists = sink.importedPlaylists,
            importedPlaylistTracks = sink.importedPlaylistTracks,
            importedLikedSongs = sink.importedLiked,
            importedAlbums = sink.importedAlbums,
            importedArtists = sink.importedArtists,
            importedListeningEvents = sink.importedEvents,
            importedSearches = sink.importedSearches,
            duplicatesSkipped = sink.duplicatesSkipped,
            errors = sink.errors,
            stats = null,
        )
        updateJob(userId, actualJobId, result, final, setOf(archiveName))
        if (final) {
            try {
                matcher.mirrorAllPlaylists(userId)
                matcher.mirrorLikedSongs(userId)
                analytics.recompute(userId)
            } catch (error: Exception) {
                logger.warn("spotify_import_finalize_failed", mapOf("jobId" to actualJobId, "detail" to (error.message ?: "").take(160)))
            }
        }
        return result
    }

    suspend fun matchPending(userId: String, limit: Int): SpotifyMatchBatchResultDto {
        val rows = supabase.select(
            "spotify_playlist_tracks",
            "user_id=${supabase.eq(userId)}&match_status=in.(pending,unmatched)&select=*&limit=${limit.coerceIn(1, 100)}",
        ) + supabase.select(
            "spotify_saved_tracks",
            "user_id=${supabase.eq(userId)}&match_status=in.(pending,unmatched)&select=*&limit=${limit.coerceIn(1, 100)}",
        )
        val tracks = rows.map { row ->
            SpotifyTrackData(
                spotifyTrackId = row["spotify_track_id"].asStringOrNull() ?: "",
                uri = row["spotify_uri"].asStringOrNull(),
                name = row["track_name"].asStringOrNull() ?: "",
                artists = row.stringList("artist_names"),
                albumName = row["album_name"].asStringOrNull(),
                artworkUrl = row["artwork_url"].asStringOrNull(),
                durationMs = row["duration_ms"].asIntOrNull() ?: 0,
                addedAt = row["added_at"].asStringOrNull(),
                isAvailable = row["is_available"].asBooleanOrNull() != false &&
                    row["match_status"].asStringOrNull() != "unavailable",
            )
        }
        return matcher.matchBatch(userId, tracks, limit)
    }

    private suspend fun processArchive(
        archiveName: String,
        body: InputStream,
        sink: Sink,
    ): List<SpotifyImportFileDto> {
        val temp = Files.createTempFile("reelhouse-spotify-", ".zip")
        try {
            copyLimited(body, temp.toFile(), config.maxImportBytes)
            return readZip(temp.toFile(), sink)
        } finally {
            Files.deleteIfExists(temp)
        }
    }

    private fun copyLimited(input: InputStream, target: File, maxBytes: Long) {
        var total = 0L
        val buffer = ByteArray(64 * 1024)
        FileOutputStream(target).use { output ->
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > maxBytes) {
                    throw ApiException(413, "archive_too_large", "The Spotify archive is larger than the upload limit")
                }
                output.write(buffer, 0, read)
            }
        }
        if (total == 0L) throw ApiException(400, "empty_archive", "The uploaded Spotify archive is empty")
    }

    private suspend fun readZip(file: File, sink: Sink): List<SpotifyImportFileDto> {
        val files = ArrayList<SpotifyImportFileDto>()
        var totalUncompressed = 0L
        var entries = 0
        val zip = ZipInputStream(BufferedInputStream(file.inputStream()))
        zip.use {
            while (true) {
                val entry = zip.nextEntry ?: break
                entries += 1
                if (entries > config.maxImportEntries) {
                    throw ApiException(400, "too_many_entries", "The Spotify archive contains too many files")
                }
                val rawName = entry.name.replace('\\', '/')
                if (entry.isDirectory) {
                    zip.closeEntry()
                    continue
                }
                if (rawName.startsWith("/") || rawName.split('/').contains("..")) {
                    throw ApiException(400, "unsafe_archive", "The Spotify archive contains an unsafe file path")
                }
                val name = rawName.substringAfterLast('/').take(220)
                val lower = name.lowercase()
                val allowed = lower.endsWith(".json") || lower.endsWith(".txt")
                if (!allowed) {
                    zip.closeEntry()
                    continue
                }
                val declared = entry.size
                if (declared > config.maxJsonEntryBytes) {
                    files += SpotifyImportFileDto(name, "oversized", parsed = false, detail = "File exceeds the per-file limit")
                    zip.closeEntry()
                    continue
                }
                val bytes = readLimited(zip, config.maxJsonEntryBytes)
                totalUncompressed += bytes.size
                if (totalUncompressed > config.maxImportUncompressedBytes) {
                    throw ApiException(400, "archive_expands_too_much", "The Spotify archive expands beyond the safe limit")
                }
                if (entry.compressedSize > 0 && bytes.size > 10 * 1024 * 1024 &&
                    bytes.size.toDouble() / entry.compressedSize.toDouble() > 200.0
                ) {
                    throw ApiException(400, "archive_ratio_rejected", "The Spotify archive has an unsafe compression ratio")
                }
                if (lower.endsWith(".txt")) {
                    if (lower.contains("read") && lower.contains("first")) {
                        files += SpotifyImportFileDto(name, "documentation", parsed = true, detail = "Read Me First detected")
                    }
                    zip.closeEntry()
                    continue
                }
                if (lower.contains("inference") || lower.contains("ad_") || lower.contains("ads")) {
                    files += SpotifyImportFileDto(name, "ignored", parsed = false, detail = "Advertising inferences are not imported")
                    zip.closeEntry()
                    continue
                }
                val text = bytes.toString(Charsets.UTF_8)
                val root = runCatching { AppJson.parseToJsonElement(text) }.getOrNull()
                if (root == null) {
                    files += SpotifyImportFileDto(name, "invalid_json", parsed = false, detail = "The JSON file could not be parsed")
                    zip.closeEntry()
                    continue
                }
                val result = try {
                    parseFile(name, root, sink)
                } catch (error: Exception) {
                    SpotifyImportFileDto(name, "parse_error", parsed = false, detail = (error.message ?: "Could not read file").take(160))
                }
                files += result
                zip.closeEntry()
            }
        }
        if (files.isEmpty()) throw ApiException(400, "no_supported_files", "This ZIP does not contain a supported Spotify export")
        if (files.none { it.parsed }) throw ApiException(400, "no_supported_files", "No readable Spotify data files were found in this ZIP")
        return files
    }

    private fun readLimited(input: InputStream, limit: Long): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(32 * 1024)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > limit) throw ApiException(400, "file_too_large", "A file inside the Spotify archive is too large")
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    private suspend fun parseFile(name: String, root: JsonElement, sink: Sink): SpotifyImportFileDto {
        val lower = name.lowercase()
        val playlistRoot = root.asObjectOrNull()?.get("playlists").asArrayOrNull()
        val array = root.asArrayOrNull()
        when {
            lower.contains("streaming") || (array != null && array.firstOrNull()?.asObjectOrNull()?.let {
                it.containsKey("master_metadata_track_name") || it.containsKey("endTime") || it.containsKey("ms_played") || it.containsKey("msPlayed")
            } == true) -> {
                val events = parseEvents(array ?: return file(name, "listening_history", false, "Expected an array of listening events"))
                val extended = array.firstOrNull()?.asObjectOrNull()?.containsKey("ts") == true
                val batches = events.chunked(200)
                for (batch in batches) sink.events(batch, extended)
                return file(name, if (extended) "extended_streaming_history" else "account_streaming_history", true, "${events.size} events")
            }

            lower.contains("search") || (array != null && array.firstOrNull()?.asObjectOrNull()?.let {
                it.containsKey("searchQuery") || it.containsKey("search_query") || it.containsKey("query")
            } == true) -> {
                val searches = parseSearches(array ?: (root.asObjectOrNull()?.get("searches").asArrayOrNull()
                    ?: return file(name, "searches", false, "Expected search queries")))
                for (batch in searches.chunked(200)) sink.searches(batch)
                return file(name, "search_history", true, "${searches.size} searches")
            }

            lower.contains("taste") || lower.contains("wrapped") -> {
                val taste = parseTaste(root)
                sink.taste(taste)
                return file(name, "taste_profile", true, "Imported available music taste fields")
            }

            playlistRoot != null || lower.contains("playlist") -> {
                val playlists = parsePlaylists(playlistRoot ?: root.asArrayOrNull())
                for (playlist in playlists) sink.playlist(playlist)
                return file(name, "playlists", true, "${playlists.size} playlists")
            }

            lower.contains("yourlibrary") || lower.contains("liked") || lower.contains("saved") ||
                root.asObjectOrNull()?.let { it.containsKey("tracks") || it.containsKey("likedSongs") } == true -> {
                val parsed = parseLibrary(root)
                if (parsed.first.isNotEmpty()) sink.liked(parsed.first)
                if (parsed.second.isNotEmpty()) sink.albums(parsed.second)
                if (parsed.third.isNotEmpty()) sink.artists(parsed.third)
                return file(
                    name,
                    "saved_library",
                    true,
                    "${parsed.first.size} songs, ${parsed.second.size} albums, ${parsed.third.size} artists",
                )
            }

            lower.contains("read") && lower.contains("first") ->
                return file(name, "documentation", true, "Read Me First detected")

            else -> return file(name, "unknown", false, "Unrecognised Spotify data file")
        }
    }

    private fun parseEvents(array: JsonArray): List<ImportedEvent> {
        val out = ArrayList<ImportedEvent>(array.size)
        for (element in array) {
            val obj = element.asObjectOrNull() ?: continue
            val extended = obj.containsKey("master_metadata_track_name") || obj.containsKey("ts")
            val trackName = obj["master_metadata_track_name"].asStringOrNull()
                ?: obj["trackName"].asStringOrNull()
                ?: continue
            val artist = obj["master_metadata_album_artist_name"].asStringOrNull()
                ?: obj["artistName"].asStringOrNull()
                ?: ""
            val album = obj["master_metadata_album_album_name"].asStringOrNull()
                ?: obj["albumName"].asStringOrNull()
            if (trackName.isBlank() || artist.isBlank()) continue
            val msPlayed = (obj["ms_played"].asLongOrNull() ?: obj["msPlayed"].asLongOrNull() ?: 0L)
                .coerceIn(0, 86_400_000L).toInt()
            val playedAt = normalizeTimestamp(obj["ts"].asStringOrNull() ?: obj["endTime"].asStringOrNull())
            val uri = obj["spotify_track_uri"].asStringOrNull() ?: obj["trackUri"].asStringOrNull()
            val platform = obj["platform"].asStringOrNull()
            val skipped = obj["skipped"].asBooleanOrNull()
            val shuffle = obj["shuffle"].asBooleanOrNull()
            val offline = obj["offline"].asBooleanOrNull()
            val fingerprint = sha256(
                "$playedAt\u0000$trackName\u0000$artist\u0000${album.orEmpty()}\u0000${uri.orEmpty()}\u0000$msPlayed\u0000${platform.orEmpty()}",
            )
            out += ImportedEvent(
                fingerprint = fingerprint,
                trackName = trackName.take(500),
                artistName = artist.take(500),
                albumName = album?.take(500),
                uri = uri,
                playedAt = playedAt,
                msPlayed = msPlayed,
                platform = platform,
                skipped = skipped,
                shuffle = shuffle,
                offline = offline,
                countsAsPlay = msPlayed >= 30_000 && skipped != true,
            )
        }
        return out
    }

    private fun parseSearches(array: JsonArray): List<ImportedSearch> {
        val out = ArrayList<ImportedSearch>()
        for (element in array) {
            val obj = element.asObjectOrNull() ?: continue
            val query = obj["searchQuery"].asStringOrNull()
                ?: obj["search_query"].asStringOrNull()
                ?: obj["query"].asStringOrNull()
                ?: continue
            if (query.isBlank()) continue
            out += ImportedSearch(
                query = query.trim(),
                searchedAt = normalizeTimestamp(
                    obj["searchTime"].asStringOrNull()
                        ?: obj["timestamp"].asStringOrNull()
                        ?: obj["time"].asStringOrNull(),
                ),
                platform = obj["platform"].asStringOrNull(),
                resultUri = obj["searchQueryResultUri"].asStringOrNull()
                    ?: obj["resultUri"].asStringOrNull()
                    ?: obj["uri"].asStringOrNull(),
            )
        }
        return out
    }

    private fun parsePlaylists(root: JsonArray?): List<ImportedPlaylist> {
        if (root == null) return emptyList()
        val playlists = if (root.firstOrNull()?.asObjectOrNull()?.containsKey("items") == true) root else {
            val wrapper = root.firstOrNull()?.asObjectOrNull()?.get("playlists").asArrayOrNull()
            wrapper ?: root
        }
        val out = ArrayList<ImportedPlaylist>()
        for (element in playlists) {
            val obj = element.asObjectOrNull() ?: continue
            val name = obj["name"].asStringOrNull() ?: obj["title"].asStringOrNull() ?: continue
            val items = obj["items"].asArrayOrNull() ?: obj["tracks"].asArrayOrNull() ?: JsonArray(emptyList())
            val tracks = items.mapIndexedNotNull { index, item ->
                val itemObj = item.asObjectOrNull() ?: return@mapIndexedNotNull null
                val trackObj = itemObj["track"].asObjectOrNull() ?: itemObj
                val trackName = trackObj["trackName"].asStringOrNull()
                    ?: trackObj["name"].asStringOrNull()
                    ?: trackObj["title"].asStringOrNull()
                    ?: return@mapIndexedNotNull null
                val artistName = trackObj["artistName"].asStringOrNull()
                    ?: trackObj["artist"].asStringOrNull()
                    ?: trackObj["artists"].asArrayOrNull()?.mapNotNull {
                        it.asObjectOrNull()?.get("name").asStringOrNull() ?: it.asStringOrNull()
                    }?.joinToString(", ")
                    ?: ""
                val uri = trackObj["trackUri"].asStringOrNull()
                    ?: trackObj["uri"].asStringOrNull()
                    ?: itemObj["trackUri"].asStringOrNull()
                val id = uri?.substringAfterLast(':')?.takeIf { it.isNotBlank() }
                    ?: "import-" + sha256("$trackName\u0000$artistName\u0000$index").take(32)
                ImportedTrack(
                    id = id,
                    uri = uri,
                    name = trackName,
                    artists = artistName.split(',').map { it.trim() }.filter { it.isNotBlank() },
                    album = trackObj["albumName"].asStringOrNull() ?: trackObj["album"].asStringOrNull(),
                    durationMs = trackObj["duration_ms"].asIntOrNull() ?: trackObj["durationMs"].asIntOrNull() ?: 0,
                )
            }
            val external = obj["playlistId"].asStringOrNull()
                ?: obj["playlistUri"].asStringOrNull()?.substringAfterLast(':')
                ?: obj["uri"].asStringOrNull()?.substringAfterLast(':')
                ?: "import-" + sha256("$name\u0000${tracks.firstOrNull()?.uri.orEmpty()}").take(24)
            out += ImportedPlaylist(
                externalId = external,
                name = name,
                description = obj["description"].asStringOrNull().orEmpty(),
                tracks = tracks,
            )
        }
        return out
    }

    private fun parseLibrary(root: JsonElement): Triple<List<ImportedTrack>, List<ImportedAlbum>, List<ImportedArtist>> {
        val obj = root.asObjectOrNull()
        val liked = ArrayList<ImportedTrack>()
        val albums = ArrayList<ImportedAlbum>()
        val artists = ArrayList<ImportedArtist>()
        val trackArray = obj?.get("tracks").asArrayOrNull()
            ?: obj?.get("likedSongs").asArrayOrNull()
            ?: obj?.get("savedTracks").asArrayOrNull()
            ?: root.asArrayOrNull()
            ?: JsonArray(emptyList())
        for (element in trackArray) {
            val item = element.asObjectOrNull() ?: continue
            val trackObj = item["track"].asObjectOrNull() ?: item
            val name = trackObj["trackName"].asStringOrNull()
                ?: trackObj["name"].asStringOrNull()
                ?: trackObj["title"].asStringOrNull()
                ?: continue
            val artist = trackObj["artistName"].asStringOrNull()
                ?: trackObj["artist"].asStringOrNull()
                ?: trackObj["artists"].asArrayOrNull()?.mapNotNull {
                    it.asObjectOrNull()?.get("name").asStringOrNull() ?: it.asStringOrNull()
                }?.joinToString(", ")
                ?: ""
            val uri = trackObj["trackUri"].asStringOrNull() ?: trackObj["uri"].asStringOrNull()
            val id = uri?.substringAfterLast(':')?.takeIf { it.isNotBlank() }
                ?: "import-" + sha256("$name\u0000$artist").take(32)
            liked += ImportedTrack(
                id = id,
                uri = uri,
                name = name,
                artists = artist.split(',').map { it.trim() }.filter { it.isNotBlank() },
                album = trackObj["albumName"].asStringOrNull() ?: trackObj["album"].asStringOrNull(),
                durationMs = trackObj["duration_ms"].asIntOrNull() ?: 0,
            )
        }
        for (element in obj?.get("albums").asArrayOrNull().orEmpty()) {
            val album = element.asObjectOrNull() ?: continue
            val name = album["album"].asStringOrNull() ?: album["name"].asStringOrNull() ?: continue
            val uri = album["uri"].asStringOrNull() ?: album["albumUri"].asStringOrNull()
            albums += ImportedAlbum(
                id = "spotify:album:" + (uri?.substringAfterLast(':') ?: sha256("$name\u0000${album["artist"].asStringOrNull().orEmpty()}").take(32)),
                name = name,
                artist = album["artist"].asStringOrNull() ?: album["artistName"].asStringOrNull().orEmpty(),
            )
        }
        for (element in obj?.get("artists").asArrayOrNull().orEmpty()) {
            val artist = element.asObjectOrNull() ?: continue
            val name = artist["name"].asStringOrNull() ?: artist["artist"].asStringOrNull() ?: continue
            val uri = artist["uri"].asStringOrNull() ?: artist["artistUri"].asStringOrNull()
            artists += ImportedArtist(
                id = "spotify:artist:" + (uri?.substringAfterLast(':') ?: sha256("$name\u0000artist").take(32)),
                name = name,
            )
        }
        return Triple(liked, albums, artists)
    }

    private fun parseTaste(root: JsonElement): TasteData {
        val artists = LinkedHashSet<String>()
        val tracks = LinkedHashSet<String>()
        val genres = LinkedHashSet<String>()
        fun visit(value: JsonElement?, keyHint: String = "") {
            when (value) {
                is JsonObject -> for ((key, child) in value) {
                    if (key.contains("inference", true) || key.contains("advert", true)) continue
                    when {
                        key.contains("artist", true) || keyHint.contains("artist", true) -> collectNames(child, artists)
                        key.contains("track", true) || key.contains("song", true) -> collectNames(child, tracks)
                        key.contains("genre", true) -> collectNames(child, genres)
                    }
                    visit(child, key)
                }
                is JsonArray -> value.forEach { visit(it, keyHint) }
                else -> Unit
            }
        }
        visit(root)
        return TasteData(artists.toList(), tracks.toList(), genres.toList())
    }

    private fun collectNames(value: JsonElement, target: MutableSet<String>) {
        when (value) {
            is JsonPrimitive -> value.content.trim().takeIf { it.isNotBlank() }?.let { target += it.take(200) }
            is JsonObject -> {
                val name = value["name"].asStringOrNull()
                    ?: value["artistName"].asStringOrNull()
                    ?: value["trackName"].asStringOrNull()
                if (name != null) target += name.take(200)
                else value.forEach { (_, child) -> collectNames(child, target) }
            }
            is JsonArray -> value.forEach { collectNames(it, target) }
            else -> Unit
        }
    }

    private fun file(name: String, kind: String, parsed: Boolean, detail: String? = null) =
        SpotifyImportFileDto(name, kind, parsed, detail)

    private fun normalizeTimestamp(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val clean = value.trim()
        val instant = runCatching { Instant.parse(clean) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(clean).toInstant() }.getOrNull()
            ?: runCatching {
                LocalDateTime.parse(clean.replace(' ', 'T')).toInstant(ZoneOffset.UTC)
            }.getOrNull()
        return instant?.toString()
    }

    private suspend fun createJob(userId: String, archiveName: String, categories: Set<String>): String {
        val row = supabase.insertOne(
            "spotify_import_jobs",
            buildJsonObject {
                put("user_id", userId)
                put("status", "processing")
                put("archive_names", JsonArray(listOf(JsonPrimitive(archiveName.take(220)))))
                put("categories", JsonArray(categories.map { JsonPrimitive(it) }))
                put("stats", JsonObject(emptyMap()))
                put("errors", JsonArray(emptyList()))
            },
        ) ?: throw ApiException(503, "schema_not_applied", "The Spotify import schema is not applied in Supabase")
        return row["id"].asStringOrNull()
            ?: throw ApiException(503, "schema_not_applied", "The Spotify import job could not be created")
    }

    private suspend fun updateJob(
        userId: String,
        jobId: String,
        result: SpotifyImportResultDto,
        final: Boolean,
        archiveNames: Set<String>,
    ) {
        val row = supabase.maybeSingle(
            "spotify_import_jobs",
            "user_id=${supabase.eq(userId)}&id=${supabase.eq(jobId)}",
        ) ?: return
        val previous = row["stats"].asObjectOrNull()
        val previousErrors = row["errors"].asArrayOrNull()?.mapNotNull { it.asStringOrNull() }.orEmpty()
        val names = (row.stringList("archive_names") + archiveNames).distinct()
        val stats = buildJsonObject {
            put("playlists", (previous?.get("playlists").asIntOrNull() ?: 0) + result.importedPlaylists)
            put("playlistTracks", (previous?.get("playlistTracks").asIntOrNull() ?: 0) + result.importedPlaylistTracks)
            put("likedSongs", (previous?.get("likedSongs").asIntOrNull() ?: 0) + result.importedLikedSongs)
            put("albums", (previous?.get("albums").asIntOrNull() ?: 0) + result.importedAlbums)
            put("artists", (previous?.get("artists").asIntOrNull() ?: 0) + result.importedArtists)
            put("listeningEvents", (previous?.get("listeningEvents").asIntOrNull() ?: 0) + result.importedListeningEvents)
            put("searches", (previous?.get("searches").asIntOrNull() ?: 0) + result.importedSearches)
            put("duplicatesSkipped", (previous?.get("duplicatesSkipped").asIntOrNull() ?: 0) + result.duplicatesSkipped)
        }
        supabase.update(
            "spotify_import_jobs",
            "user_id=${supabase.eq(userId)}&id=${supabase.eq(jobId)}",
            buildJsonObject {
                put("status", if (final) "completed" else "processing")
                put("archive_names", JsonArray(names.map { JsonPrimitive(it) }))
                put("stats", stats)
                put("errors", JsonArray((previousErrors + result.errors).take(100).map { JsonPrimitive(it) }))
                if (final) put("completed_at", Instant.now().toString())
            },
        )
    }

    private suspend fun markJobFailed(userId: String, jobId: String, message: String) {
        runCatching {
            supabase.update(
                "spotify_import_jobs",
                "user_id=${supabase.eq(userId)}&id=${supabase.eq(jobId)}",
                buildJsonObject {
                    put("status", "failed")
                    put("errors", JsonArray(listOf(JsonPrimitive(message.take(300)))))
                    put("completed_at", Instant.now().toString())
                },
            )
        }
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    companion object {
        val CATEGORIES = setOf("playlists", "liked", "library", "history", "searches", "taste")
    }
}
