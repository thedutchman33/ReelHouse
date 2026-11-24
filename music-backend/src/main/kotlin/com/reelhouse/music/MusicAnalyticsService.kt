package com.reelhouse.music

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

class MusicAnalyticsService(
    private val config: AppConfig,
    private val supabase: SupabaseRest,
    private val youtube: YouTubeMusicService,
    private val musicBrainz: MusicBrainzService,
    private val logger: AppLogger,
) {
    private data class TrackAgg(
        val name: String,
        val artist: String,
        val album: String?,
        val uri: String?,
        var plays: Int = 0,
        var ms: Long = 0,
        var firstAt: String? = null,
        var lastAt: String? = null,
    )

    private data class ArtistAgg(
        val name: String,
        var plays: Int = 0,
        var ms: Long = 0,
    )

    private data class AlbumAgg(
        val name: String,
        val artist: String,
        var plays: Int = 0,
        var ms: Long = 0,
    )

    private data class StatsCache(val value: PersonalizedHomeDto, val expiresAt: Long)

    private val personalizedCache = ConcurrentHashMap<String, StatsCache>()

    suspend fun recompute(userId: String): SpotifyStatsDto {
        val tracks = LinkedHashMap<String, TrackAgg>()
        val artists = LinkedHashMap<String, ArtistAgg>()
        val albums = LinkedHashMap<String, AlbumAgg>()
        var totalEvents = 0
        var totalMs = 0L
        var historyStart: String? = null
        var historyEnd: String? = null
        var offset = 0
        while (offset < 100_000) {
            val rows = supabase.select(
                "spotify_listening_events",
                "user_id=${supabase.eq(userId)}&select=track_name,artist_name,album_name,spotify_track_uri,played_at,ms_played,counts_as_play&order=played_at.desc.nullslast&offset=$offset&limit=1000",
            )
            if (rows.isEmpty()) break
            for (row in rows) {
                val name = row["track_name"].asStringOrNull() ?: continue
                val artist = row["artist_name"].asStringOrNull() ?: continue
                val album = row["album_name"].asStringOrNull()
                val uri = row["spotify_track_uri"].asStringOrNull()
                val playedAt = row["played_at"].asStringOrNull()
                val ms = (row["ms_played"].asLongOrNull() ?: 0L).coerceAtLeast(0)
                val counted = row["counts_as_play"].asBooleanOrNull() != false
                totalEvents += 1
                totalMs += ms
                if (playedAt != null) {
                    if (historyStart == null || playedAt < historyStart!!) historyStart = playedAt
                    if (historyEnd == null || playedAt > historyEnd!!) historyEnd = playedAt
                }
                val trackKey = uri ?: "${name.lowercase()}\u0000${artist.lowercase()}"
                val track = tracks.getOrPut(trackKey) {
                    TrackAgg(name, artist, album, uri)
                }
                if (counted) track.plays += 1
                track.ms += ms
                if (playedAt != null) {
                    if (track.firstAt == null || playedAt < track.firstAt!!) track.firstAt = playedAt
                    if (track.lastAt == null || playedAt > track.lastAt!!) track.lastAt = playedAt
                }
                val artistKey = artist.lowercase()
                val artistAgg = artists.getOrPut(artistKey) { ArtistAgg(artist) }
                if (counted) artistAgg.plays += 1
                artistAgg.ms += ms
                if (!album.isNullOrBlank()) {
                    val albumKey = "${album.lowercase()}\u0000${artist.lowercase()}"
                    val albumAgg = albums.getOrPut(albumKey) { AlbumAgg(album, artist) }
                    if (counted) albumAgg.plays += 1
                    albumAgg.ms += ms
                }
            }
            if (rows.size < 1000) break
            offset += 1000
        }

        val topTracks = tracks.values.sortedWith(compareByDescending<TrackAgg> { it.plays }.thenByDescending { it.ms }).take(20)
        val topArtists = artists.values.sortedWith(compareByDescending<ArtistAgg> { it.plays }.thenByDescending { it.ms }).take(20)
        val topAlbums = albums.values.sortedWith(compareByDescending<AlbumAgg> { it.plays }.thenByDescending { it.ms }).take(20)
        val genres = LinkedHashSet<String>()
        for (artist in topArtists.take(3)) {
            runCatching { musicBrainz.artistGenres(artist.name) }.getOrNull()?.forEach { genres += it }
            if (genres.size >= 8) break
        }
        val recent = tracks.values.sortedByDescending { it.lastAt.orEmpty() }.take(20)
        val searches = supabase.select(
            "spotify_imported_searches",
            "user_id=${supabase.eq(userId)}&select=query&order=searched_at.desc.nullslast&limit=20",
        ).mapNotNull { it["query"].asStringOrNull() }

        val statistics = SpotifyStatsDto(
            totalEvents = totalEvents,
            totalMsPlayed = totalMs,
            uniqueTracks = tracks.size,
            uniqueArtists = artists.size,
            topArtists = topArtists.map { artist ->
                MusicArtistDto(
                    id = "spotify:artist:" + artist.name.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
                    provider = "spotify",
                    name = artist.name,
                    trackCount = artist.plays,
                )
            },
            topTracks = topTracks.map { track -> trackDto(track) },
            topAlbums = topAlbums.map { album ->
                MusicCollectionDto(
                    id = "spotify:album:" + sha256("${album.name}\u0000${album.artist}").take(32),
                    provider = "spotify",
                    kind = "album",
                    title = album.name,
                    ownerName = album.artist,
                    trackCount = album.plays,
                    tracks = emptyList(),
                )
            },
            topGenres = genres.take(12).toList(),
            historyStart = historyStart,
            historyEnd = historyEnd,
            recentlyPlayed = recent.map { track -> trackDto(track) },
            importedSearches = searches,
            computedAt = Instant.now().toString(),
        )

        if (totalEvents > 0) {
            supabase.insert(
                "user_music_statistics",
                listOf(
                    buildJsonObject {
                        put("user_id", userId)
                        put("total_events", totalEvents)
                        put("total_ms_played", totalMs)
                        put("unique_tracks", tracks.size)
                        put("unique_artists", artists.size)
                        put("top_artists", jsonArtists(topArtists))
                        put("top_tracks", jsonTracks(topTracks))
                        put("top_albums", jsonAlbums(topAlbums))
                        put("top_genres", JsonArray(statistics.topGenres.map { JsonPrimitive(it) }))
                        put(
                            "history_range",
                            buildJsonObject {
                                put("start", historyStart)
                                put("end", historyEnd)
                            },
                        )
                        put("computed_at", Instant.now().toString())
                    },
                ),
                onConflict = "user_id",
            )
            supabase.insert(
                "spotify_taste_profiles",
                listOf(
                    buildJsonObject {
                        put("user_id", userId)
                        put("top_artists", jsonArtists(topArtists))
                        put("top_tracks", jsonTracks(topTracks))
                        put("top_albums", jsonAlbums(topAlbums))
                        put("top_genres", JsonArray(statistics.topGenres.map { JsonPrimitive(it) }))
                        put("total_ms_played", totalMs)
                        put("imported_at", Instant.now().toString())
                        put("updated_at", Instant.now().toString())
                    },
                ),
                onConflict = "user_id",
            )
        }
        personalizedCache.remove(userId)
        return statistics
    }

    suspend fun stats(userId: String): SpotifyStatsDto {
        val row = supabase.maybeSingle("user_music_statistics", "user_id=${supabase.eq(userId)}")
            ?: return recompute(userId)
        val range = row["history_range"].asObjectOrNull()
        val topArtists = row["top_artists"].asArrayOrNull()?.mapNotNull { item ->
            val obj = item.asObjectOrNull() ?: return@mapNotNull null
            val name = obj["name"].asStringOrNull() ?: return@mapNotNull null
            MusicArtistDto(
                id = "spotify:artist:" + name.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
                provider = "spotify",
                name = name,
                trackCount = obj["plays"].asIntOrNull(),
            )
        }.orEmpty()
        val topTracks = row["top_tracks"].asArrayOrNull()?.mapNotNull { item ->
            val obj = item.asObjectOrNull() ?: return@mapNotNull null
            MusicTrackDto(
                id = obj["uri"].asStringOrNull() ?: "spotify:track:" + sha256(obj["name"].asStringOrNull().orEmpty()).take(24),
                provider = "spotify",
                providerId = obj["uri"].asStringOrNull()?.substringAfterLast(':'),
                title = obj["name"].asStringOrNull() ?: "Unknown track",
                artistId = "spotify:artist:unknown",
                artistName = obj["artist"].asStringOrNull() ?: "Unknown artist",
                albumTitle = obj["album"].asStringOrNull(),
                duration = 0,
                playCount = obj["plays"].asLongOrNull(),
                isStreamable = false,
                source = "spotify",
            )
        }.orEmpty()
        val topAlbums = row["top_albums"].asArrayOrNull()?.mapNotNull { item ->
            val obj = item.asObjectOrNull() ?: return@mapNotNull null
            val name = obj["name"].asStringOrNull() ?: return@mapNotNull null
            MusicCollectionDto(
                id = "spotify:album:" + sha256("$name\u0000${obj["artist"].asStringOrNull().orEmpty()}").take(32),
                provider = "spotify",
                kind = "album",
                title = name,
                ownerName = obj["artist"].asStringOrNull() ?: "Unknown artist",
                trackCount = obj["plays"].asIntOrNull() ?: 0,
                tracks = emptyList(),
            )
        }.orEmpty()
        val genres = row.stringList("top_genres")
        val searches = supabase.select(
            "spotify_imported_searches",
            "user_id=${supabase.eq(userId)}&select=query&order=searched_at.desc.nullslast&limit=20",
        ).mapNotNull { it["query"].asStringOrNull() }
        val recent = topTracks.take(20)
        return SpotifyStatsDto(
            totalEvents = row["total_events"].asIntOrNull() ?: 0,
            totalMsPlayed = row["total_ms_played"].asLongOrNull() ?: 0,
            uniqueTracks = row["unique_tracks"].asIntOrNull() ?: 0,
            uniqueArtists = row["unique_artists"].asIntOrNull() ?: 0,
            topArtists = topArtists,
            topTracks = topTracks,
            topAlbums = topAlbums,
            topGenres = genres,
            historyStart = range?.get("start").asStringOrNull(),
            historyEnd = range?.get("end").asStringOrNull(),
            recentlyPlayed = recent,
            importedSearches = searches,
            computedAt = row["computed_at"].asStringOrNull(),
        )
    }

    suspend fun personalized(userId: String): PersonalizedHomeDto {
        personalizedCache[userId]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }
        val stats = stats(userId)
        if (stats.totalEvents == 0) {
            return PersonalizedHomeDto(stats = stats, hasListeningData = false)
        }
        val sections = ArrayList<RecommendationSectionDto>()
        val seen = HashSet<String>()
        val artistNames = stats.topArtists.map { it.name }.take(4)
        val genres = stats.topGenres.take(3)
        val madeForYou = ArrayList<MusicTrackDto>()
        for (artist in artistNames) {
            runCatching { youtube.searchSongs(artist, 5) }.getOrNull()?.forEach { track ->
                if (seen.add(track.id)) madeForYou += track
            }
        }
        for (genre in genres) {
            runCatching { youtube.searchSongs(genre, 5) }.getOrNull()?.forEach { track ->
                if (seen.add(track.id)) madeForYou += track
            }
        }
        if (madeForYou.isNotEmpty()) {
            sections += RecommendationSectionDto(
                id = "made-for-you",
                title = "Made for You",
                subtitle = "Built from your imported listening history",
                tracks = madeForYou.take(20),
            )
        }
        val firstArtist = artistNames.firstOrNull()
        if (firstArtist != null) {
            val artistTracks = madeForYou.filter { it.artistName.contains(firstArtist, ignoreCase = true) }
            if (artistTracks.isNotEmpty()) {
                sections += RecommendationSectionDto(
                    id = "because-you-like",
                    title = "Because You Like $firstArtist",
                    subtitle = "Similar energy from the YouTube Music catalog",
                    tracks = artistTracks.take(12),
                )
            }
        }
        val recentTracks = ArrayList<MusicTrackDto>()
        for (recent in stats.recentlyPlayed.take(5)) {
            runCatching { youtube.searchSongs("${recent.title} ${recent.artistName}", 2) }.getOrNull()?.let { results ->
                results.firstOrNull()?.let { candidate ->
                    if (seen.add(candidate.id)) recentTracks += candidate
                }
            }
        }
        if (recentTracks.isNotEmpty()) {
            sections += RecommendationSectionDto(
                id = "recently-played",
                title = "Recently Played",
                subtitle = "Playable versions of your latest listens",
                tracks = recentTracks,
            )
        }
        val rediscover = stats.topTracks.drop(5).take(5).mapNotNull { track ->
            runCatching { youtube.searchSongs("${track.title} ${track.artistName}", 2) }.getOrNull()
                ?.firstOrNull { seen.add(it.id) }
        }
        if (rediscover.isNotEmpty()) {
            sections += RecommendationSectionDto(
                id = "rediscover",
                title = "Rediscover Your Old Favourites",
                subtitle = "Songs you kept coming back to",
                tracks = rediscover,
            )
        }
        if (firstArtist != null) {
            val result = runCatching { youtube.search(firstArtist, 6, 0) }.getOrNull()
            if (result != null && (result.albums.isNotEmpty() || result.playlists.isNotEmpty())) {
                sections += RecommendationSectionDto(
                    id = "recommended-collections",
                    title = "Recommended Albums & Playlists",
                    subtitle = "More from the artists you play most",
                    playlists = (result.albums + result.playlists).distinctBy { it.id }.take(8),
                )
            }
        }
        if (stats.recentlyPlayed.isNotEmpty()) {
            sections += RecommendationSectionDto(
                id = "your-top-artists",
                title = "Your Most Played Artists",
                subtitle = "The artists that shaped your listening",
                tracks = stats.topTracks.take(10),
            )
        }
        val value = PersonalizedHomeDto(
            sections = sections,
            stats = stats,
            hasListeningData = madeForYou.isNotEmpty() || recentTracks.isNotEmpty(),
        )
        personalizedCache[userId] = StatsCache(value, System.currentTimeMillis() + 10 * 60 * 1000L)
        return value
    }

    private fun trackDto(track: TrackAgg): MusicTrackDto =
        MusicTrackDto(
            id = track.uri ?: "spotify:track:" + sha256("${track.name}\u0000${track.artist}").take(24),
            provider = "spotify",
            providerId = track.uri?.substringAfterLast(':'),
            title = track.name,
            artistId = "spotify:artist:unknown",
            artistName = track.artist,
            albumTitle = track.album,
            duration = 0,
            playCount = track.plays.toLong(),
            isStreamable = false,
            source = "spotify",
        )

    private fun jsonTracks(tracks: List<TrackAgg>): JsonArray =
        JsonArray(tracks.map { track ->
            buildJsonObject {
                put("name", track.name)
                put("artist", track.artist)
                put("album", track.album)
                put("uri", track.uri)
                put("plays", track.plays)
                put("msPlayed", track.ms)
                put("firstAt", track.firstAt)
                put("lastAt", track.lastAt)
            }
        })

    private fun jsonArtists(artists: List<ArtistAgg>): JsonArray =
        JsonArray(artists.map { artist ->
            buildJsonObject {
                put("name", artist.name)
                put("plays", artist.plays)
                put("msPlayed", artist.ms)
            }
        })

    private fun jsonAlbums(albums: List<AlbumAgg>): JsonArray =
        JsonArray(albums.map { album ->
            buildJsonObject {
                put("name", album.name)
                put("artist", album.artist)
                put("plays", album.plays)
                put("msPlayed", album.ms)
            }
        })

    private fun sha256(value: String): String =
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
