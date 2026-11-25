package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.models.YouTubeClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.statement.bodyAsText
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max

class YouTubeMusicService(
    private val config: AppConfig,
    private val logger: AppLogger,
) : AutoCloseable {
    private data class Timed<T>(val value: T, val expiresAt: Long)

    private data class Page<T>(
        val items: List<T>,
        val next: String?,
    )

    private val httpClient: HttpClient = HttpClient(OkHttp) {
        expectSuccess = false
        install(ContentNegotiation) { json(AppJson) }
        install(HttpTimeout) {
            requestTimeoutMillis = config.httpTimeoutMs
            connectTimeoutMillis = 8_000
            socketTimeoutMillis = config.httpTimeoutMs
        }
    }
    private val innerTube = InnerTube(httpClient = httpClient)
    private val providerGate = Semaphore(3)

    private val searchSessions = ConcurrentHashMap<String, Timed<SearchSession>>()
    private val homeMutex = Mutex()
    private var homeCache: Timed<MusicHomeDto>? = null
    private val artistCache = ConcurrentHashMap<String, Timed<MusicArtistDetailDto>>()
    private val collectionCache = ConcurrentHashMap<String, Timed<MusicCollectionDto>>()
    private val trackCache = ConcurrentHashMap<String, Timed<MusicTrackDto>>()
    private val streamService = YouTubeStreamService(config, httpClient, innerTube, logger)

    suspend fun searchSongs(query: String, limit: Int, offset: Int = 0): List<MusicTrackDto> {
        val clean = query.trim().take(160)
        if (clean.length < 2) return emptyList()
        val page = searchSongPage(clean, (limit + offset).coerceIn(1, 60))
        return page.items.drop(offset).take(limit).map(::toDynamicTrack)
    }

    /** Real YouTube Music search suggestions for the topbar dropdown. */
    suspend fun suggestions(query: String): List<String> {
        val clean = query.trim().take(100)
        if (clean.length < 2) return emptyList()
        return searchSuggestions(clean)
            .map { it.trim() }
            .filter { it.length >= 2 }
            .distinctBy { it.lowercase() }
            .take(8)
    }

    suspend fun search(query: String, limit: Int, offset: Int): MusicSearchResultsDto {
        val clean = query.trim().take(80)
        if (clean.length < 2) {
            return MusicSearchResultsDto(emptyList(), emptyList(), emptyList(), emptyList())
        }
        val safeLimit = limit.coerceIn(1, 30)
        val safeOffset = offset.coerceIn(0, 200)
        evictExpired()
        val key = clean.lowercase()
        val now = System.currentTimeMillis()
        var session = searchSessions[key]?.takeIf { it.expiresAt > now }?.value
        if (session == null) {
            session = SearchSession(clean)
            searchSessions[key] = Timed(session, now + 5 * 60 * 1000)
        }
        return session.page(safeOffset, safeLimit)
    }

    suspend fun home(): MusicHomeDto {
        homeCache?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }
        return homeMutex.withLock {
            homeCache?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return@withLock it.value }
            val definitions = listOf(
                HomeQuery("trending", "top hits", null),
                HomeQuery("pop", "pop hits", "Pop"),
                HomeQuery("hip-hop", "hip hop hits", "Hip-Hop"),
                HomeQuery("rock", "rock hits", "Rock"),
                HomeQuery("electronic", "electronic hits", "Electronic"),
                HomeQuery("indie", "indie hits", "Indie"),
                HomeQuery("latest", "new music", "New Music"),
                // New listeners start with roughly 60% Indian music and 40%
                // international music. Returning listeners get their own mix
                // from the recommendation profile on top of this shelf.
                HomeQuery("bollywood", "bollywood hits", "Bollywood"),
                HomeQuery("hindi", "hindi songs", "Hindi"),
                HomeQuery("punjabi", "punjabi hits", "Punjabi"),
                HomeQuery("bhojpuri", "bhojpuri songs", "Bhojpuri"),
            )
            val results = coroutineScope {
                definitions.map { definition ->
                    async(Dispatchers.IO) {
                        definition to runCatching {
                            searchSongPage(definition.query, 20).items.map { track ->
                                ParsedTrackGenre(track, definition.genre)
                            }
                        }.getOrElse { error ->
                            logger.warn("home_query_failed", mapOf("query" to definition.query, "type" to error::class.simpleName))
                            emptyList<ParsedTrackGenre>()
                        }
                    }
                }.map { it.await() }
            }
            val byKey = results.associate { (definition, tracks) -> definition.key to tracks }
            fun pool(keys: List<String>) = mergeGenreTracks(
                keys.flatMap { key -> byKey[key].orEmpty() }
            )
            val internationalKeys = listOf("pop", "hip-hop", "rock", "electronic", "indie")
            val trending = startingMix(
                pool(listOf("bollywood", "hindi", "punjabi", "bhojpuri")),
                pool(internationalKeys),
                40,
            )
            val recommended = startingMix(
                pool(listOf("hindi", "punjabi", "bollywood", "bhojpuri")),
                pool(listOf("indie", "electronic", "rock", "pop", "hip-hop")),
                40,
            )
            val underground = mergeTracks(byKey["indie"].orEmpty().map { it.track })
                .ifEmpty { mergeTracks(byKey["latest"].orEmpty().map { it.track }) }
                .take(24)
            val latest = mergeTracks(byKey["latest"].orEmpty().map { it.track }).take(24)
            if (trending.isEmpty() && recommended.isEmpty() && latest.isEmpty()) {
                throw ApiException(502, "catalog_unavailable", "YouTube Music did not return a catalog")
            }
            val artistTracks = mergeTracks(
                trending.map { it.track } + recommended.map { it.track } + underground + latest
            ).map(::toDynamicTrack)
            val artists = artistTracks
                .groupBy { it.artistId }
                .values
                .map { tracks ->
                    val first = tracks.first()
                    MusicArtistDto(
                        id = first.artistId,
                        provider = "youtube",
                        providerId = first.artistId.removePrefix("youtube:artist:"),
                        name = first.artistName,
                        avatarUrl = first.artistAvatarUrl ?: first.artworkUrl,
                        trackCount = tracks.size,
                        externalUrl = first.artistId.removePrefix("youtube:artist:")
                            .takeIf { it.startsWith("UC") }
                            ?.let { "https://music.youtube.com/channel/$it" },
                    )
                }
                .take(12)
            val categories = BROWSE_CATEGORIES.mapIndexed { index, category ->
                val cover = byKey[category.id]?.firstOrNull()?.track?.artworkUrl
                    ?: trending.getOrNull(index % max(trending.size, 1))?.track?.artworkUrl
                category.copy(coverUrl = cover)
            }
            val featured = mergeGenreTracks(
                recommended.take(24).ifEmpty { trending.take(24) }
            ).map { it.track }
            val mixes = listOf(
                makeMix("daily-mix-1", "Made for You", "A rotating mix from today’s YouTube Music catalog.", featured, "#1ed760"),
                makeMix("daily-mix-2", "New & Trending", "Fresh releases and tracks gaining momentum now.", latest.ifEmpty { trending.map { it.track } }, "#7c3aed"),
                makeMix("daily-mix-3", "Deep Cuts", "Independent and underground picks from the catalog.", underground.ifEmpty { trending.map { it.track } }, "#0b6e4f"),
            ).filter { it.tracks.isNotEmpty() }
            val result = MusicHomeDto(
                trending = trending.map(::toDynamicTrack),
                recommended = recommended.map(::toDynamicTrack),
                underground = underground.map(::toDynamicTrack),
                latest = latest.map(::toDynamicTrack),
                artists = artists,
                categories = categories,
                mixes = mixes,
            )
            homeCache = Timed(result, System.currentTimeMillis() + 10 * 60 * 1000)
            result
        }
    }

    suspend fun artist(id: String): MusicArtistDetailDto {
        val browseId = id.removePrefix("youtube:artist:")
        if (!ARTIST_ID.matches(browseId)) throw ApiException(400, "invalid_artist_id", "Invalid artist id")
        artistCache[id]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }
        val body = browse(browseId)
        val detail = YouTubeMusicParser.parseArtistDetail(body, browseId)
        if (detail.artist.name == "Artist" && detail.topTracks.isEmpty() && detail.albums.isEmpty()) {
            throw ApiException(404, "artist_not_found", "Artist was not found on YouTube Music")
        }
        artistCache[id] = Timed(detail, System.currentTimeMillis() + 10 * 60 * 1000)
        return detail
    }

    suspend fun collection(id: String, kind: String): MusicCollectionDto {
        val prefix = "youtube:$kind:"
        val browseId = if (id.startsWith(prefix)) id.removePrefix(prefix) else id
        val valid = if (kind == "album") ALBUM_ID.matches(browseId) else PLAYLIST_ID.matches(browseId)
        if (!valid) throw ApiException(400, "invalid_collection_id", "Invalid collection id")
        val cacheKey = "$kind:$browseId"
        collectionCache[cacheKey]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }
        val detail = YouTubeMusicParser.parseCollectionDetail(browse(browseId), browseId, kind)
        val collection = YouTubeMusicParser.toCollectionDto(detail.collection).copy(
            tracks = detail.tracks.map(::toDynamicTrack),
            trackCount = detail.tracks.size.coerceAtLeast(detail.collection.trackCount),
        )
        collectionCache[cacheKey] = Timed(collection, System.currentTimeMillis() + 10 * 60 * 1000)
        return collection
    }

    suspend fun track(videoId: String): MusicTrackDto {
        if (!VIDEO_ID.matches(videoId)) throw ApiException(400, "invalid_video_id", "Invalid video id")
        trackCache[videoId]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }
        val response = providerGate.withPermit {
            innerTube.player(YouTubeClient.WEB_REMIX, videoId)
        }
        if (response.status.value !in 200..299) {
            throw ApiException(502, "track_unavailable", "YouTube Music could not return this track")
        }
        val root = runCatching { AppJson.parseToJsonElement(response.bodyAsText()) }.getOrNull()
            ?: throw ApiException(502, "track_unavailable", "YouTube Music returned an invalid response")
        val track = YouTubeMusicParser.parsePlayerDetails(root, videoId)
            ?: throw ApiException(404, "track_not_found", "Track was not found on YouTube Music")
        trackCache[videoId] = Timed(track, System.currentTimeMillis() + 10 * 60 * 1000)
        return track
    }

    suspend fun related(videoId: String, title: String?, artist: String?): List<MusicTrackDto> {
        if (!VIDEO_ID.matches(videoId)) throw ApiException(400, "invalid_video_id", "Invalid video id")
        if (!title.isNullOrBlank() && !artist.isNullOrBlank()) {
            val fallback = runCatching {
                search("$title $artist", 12, 0).tracks.filterNot { it.videoId == videoId }.take(10)
            }.getOrDefault(emptyList())
            if (fallback.isNotEmpty()) return fallback
        }
        val radioId = "RDAMVM$videoId"
        return runCatching {
            val detail = YouTubeMusicParser.parseCollectionDetail(browse(radioId), radioId, "playlist")
            detail.tracks.filterNot { it.videoId == videoId }.take(20).map(::toDynamicTrack)
        }.getOrDefault(emptyList())
    }

    suspend fun stream(videoId: String): YouTubeStreamInfo =
        streamService.stream(videoId)

    fun invalidateStream(videoId: String) {
        streamService.invalidate(videoId)
    }

    private suspend fun searchSongPage(query: String, limit: Int): Page<ParsedTrack> =
        searchFiltered(
            query = query,
            filter = SONG_FILTER,
            continuation = null,
            parser = YouTubeMusicParser::parseSongSearch,
            limit = limit,
        )

    private suspend fun <T> searchFiltered(
        query: String?,
        filter: String?,
        continuation: String?,
        parser: (JsonElement) -> List<T>,
        limit: Int = 30,
    ): Page<T> {
        val body = searchRequest(query, filter, continuation)
        val root = runCatching { AppJson.parseToJsonElement(body) }.getOrElse {
            throw ApiException(502, "catalog_invalid", "YouTube Music returned an invalid response")
        }
        return Page(parser(root).distinctBy { item ->
            when (item) {
                is ParsedTrack -> item.videoId
                is ParsedArtist -> item.browseId
                is ParsedCollection -> item.browseId
                else -> item.toString()
            }
        }.take(limit.coerceAtLeast(1)), YouTubeMusicParser.continuationToken(root))
    }

    private suspend fun searchRequest(query: String?, filter: String?, continuation: String?): String {
        var lastError: Exception? = null
        for (attempt in 0..1) {
            try {
                val response = providerGate.withPermit {
                    withContext(Dispatchers.IO) {
                        innerTube.search(
                            client = YouTubeClient.WEB_REMIX,
                            query = query,
                            params = filter,
                            continuation = continuation,
                            setLogin = false,
                        )
                    }
                }
                if (response.status.value in 200..299) return response.bodyAsText()
                if (response.status.value == 429 || response.status.value >= 500) {
                    lastError = ApiException(502, "catalog_busy", "YouTube Music is busy")
                    delay(600L * (attempt + 1))
                    continue
                }
                throw ApiException(502, "catalog_error", "YouTube Music rejected the catalog request")
            } catch (error: ApiException) {
                lastError = error
            } catch (error: Exception) {
                lastError = error
                delay(400L * (attempt + 1))
            }
        }
        logger.warn("youtube_search_failed", mapOf("type" to (lastError?.let { it::class.simpleName } ?: "unknown")))
        throw ApiException(502, "catalog_unavailable", "YouTube Music is temporarily unavailable")
    }

    private suspend fun browse(browseId: String): JsonElement {
        val response = providerGate.withPermit {
            withContext(Dispatchers.IO) {
                innerTube.browse(
                    client = YouTubeClient.WEB_REMIX,
                    browseId = browseId,
                    setLogin = false,
                )
            }
        }
        if (response.status.value !in 200..299) {
            throw ApiException(502, "catalog_browse_failed", "YouTube Music could not load this page")
        }
        return runCatching { AppJson.parseToJsonElement(response.bodyAsText()) }.getOrElse {
            throw ApiException(502, "catalog_invalid", "YouTube Music returned an invalid page")
        }
    }

    private fun toDynamicTrack(track: ParsedTrack): MusicTrackDto =
        YouTubeMusicParser.toTrackDto(track).copy(genre = trackGenre[track.videoId])

    private val trackGenre = ConcurrentHashMap<String, String>()

    private fun mergeTracks(tracks: List<ParsedTrack>): List<ParsedTrack> {
        val seen = HashSet<String>()
        return tracks.filter { track -> track.videoId.isNotBlank() && seen.add(track.videoId) }
    }

    /** Deduplicate while keeping the genre that introduced each shelf track. */
    private fun mergeGenreTracks(tracks: List<ParsedTrackGenre>): List<ParsedTrackGenre> {
        val seen = HashSet<String>()
        return tracks.filter { item ->
            item.track.videoId.isNotBlank() && seen.add(item.track.videoId)
        }
    }

    /**
     * New-listener starting mix: three Indian tracks for every two
     * international tracks. The pools are already deduplicated, and the limit
     * keeps the shelf bounded when one pool runs short.
     */
    private fun startingMix(
        indian: List<ParsedTrackGenre>,
        international: List<ParsedTrackGenre>,
        limit: Int,
    ): List<ParsedTrackGenre> {
        if (indian.isEmpty()) return international.take(limit)
        if (international.isEmpty()) return indian.take(limit)
        val out = ArrayList<ParsedTrackGenre>(limit)
        var indianIndex = 0
        var internationalIndex = 0
        while (out.size < limit &&
            (indianIndex < indian.size || internationalIndex < international.size)
        ) {
            repeat(3) {
                if (indianIndex < indian.size && out.size < limit) {
                    out.add(indian[indianIndex++])
                }
            }
            repeat(2) {
                if (internationalIndex < international.size && out.size < limit) {
                    out.add(international[internationalIndex++])
                }
            }
            if (indianIndex >= indian.size && internationalIndex >= international.size) break
        }
        return out
    }

    private fun makeMix(
        id: String,
        title: String,
        description: String,
        tracks: List<ParsedTrack>,
        accent: String,
    ): MusicCollectionDto = MusicCollectionDto(
        id = "youtube:mix:$id",
        provider = "youtube",
        providerId = id,
        kind = "mix",
        title = title,
        description = description,
        artworkUrl = tracks.firstOrNull()?.artworkUrl,
        ownerName = "Reelhouse Music",
        trackCount = tracks.size,
        tracks = tracks.take(30).map(::toDynamicTrack),
        accent = accent,
        isEditorial = true,
    )

    private fun evictExpired() {
        val now = System.currentTimeMillis()
        searchSessions.entries.removeIf { it.value.expiresAt <= now }
        artistCache.entries.removeIf { it.value.expiresAt <= now }
        collectionCache.entries.removeIf { it.value.expiresAt <= now }
        trackCache.entries.removeIf { it.value.expiresAt <= now }
        if (searchSessions.size > 150) {
            searchSessions.keys.take(searchSessions.size - 150).forEach(searchSessions::remove)
        }
    }

    override fun close() {
        streamService.close()
        innerTube.close()
        httpClient.close()
    }

    private data class MixedSearch(
        val tracks: List<ParsedTrack>,
        val artists: List<ParsedArtist>,
        val albums: List<ParsedCollection>,
        val playlists: List<ParsedCollection>,
    )

    private suspend fun searchSuggestions(query: String): List<String> =
        runCatching {
            val response = providerGate.withPermit {
                withContext(Dispatchers.IO) {
                    innerTube.getSearchSuggestions(
                        client = YouTubeClient.WEB_REMIX,
                        input = query,
                        setLogin = false,
                    )
                }
            }
            if (response.status.value !in 200..299) return@runCatching emptyList()
            YouTubeMusicParser.parseSearchSuggestions(AppJson.parseToJsonElement(response.bodyAsText()))
        }.getOrElse { error ->
            logger.warn(
                "search_suggestions_failed",
                mapOf("type" to (error::class.simpleName ?: "Exception")),
            )
            emptyList()
        }

    private suspend fun mixedSearch(query: String, limit: Int = 30): MixedSearch? =
        runCatching {
            val root = AppJson.parseToJsonElement(searchRequest(query, filter = null, continuation = null))
            MixedSearch(
                tracks = YouTubeMusicParser.parseSongSearch(root).take(limit),
                artists = YouTubeMusicParser.parseArtistSearch(root).take(limit),
                albums = YouTubeMusicParser.parseCollectionSearch(root, "album").take(limit),
                playlists = YouTubeMusicParser.parseCollectionSearch(root, "playlist").take(limit),
            )
        }.getOrElse { error ->
            logger.warn(
                "search_mixed_failed",
                mapOf("type" to (error::class.simpleName ?: "Exception")),
            )
            null
        }

    private fun expansionQuery(query: String, suggestions: List<String>): String? {
        val normalizedQuery = TextMatch.normalize(query)
        if (normalizedQuery.isBlank()) return null
        val queryTokens = normalizedQuery.split(' ').filter(String::isNotBlank).toSet()
        val firstQueryToken = queryTokens.firstOrNull()
        for (suggestion in suggestions) {
            val normalizedSuggestion = TextMatch.normalize(suggestion)
            if (normalizedSuggestion.isBlank() || normalizedSuggestion == normalizedQuery) continue
            val suggestionTokens = normalizedSuggestion.split(' ').filter(String::isNotBlank).toSet()
            val extraTokens = suggestionTokens - queryTokens
            if (extraTokens.isEmpty()) continue
            if (extraTokens.all { it in GENERIC_QUERY_TOKENS }) continue
            val addsMeaningfulWords = queryTokens.all { it in suggestionTokens }
            val correctsSpelling = editDistance(normalizedQuery, normalizedSuggestion, 2) <= 2 ||
                (firstQueryToken != null &&
                    editDistance(firstQueryToken, suggestionTokens.firstOrNull().orEmpty(), 2) <= 2)
            if (addsMeaningfulWords || correctsSpelling) return suggestion.take(100)
        }
        return null
    }

    private fun editDistance(left: String, right: String, limit: Int): Int {
        if (left == right) return 0
        if (kotlin.math.abs(left.length - right.length) > limit) return limit + 1
        var previous = IntArray(right.length + 1) { it }
        var current = IntArray(right.length + 1)
        for (i in 1..left.length) {
            current[0] = i
            var rowMinimum = current[0]
            for (j in 1..right.length) {
                val substitution = previous[j - 1] + if (left[i - 1] == right[j - 1]) 0 else 1
                current[j] = minOf(current[j - 1] + 1, previous[j] + 1, substitution)
                rowMinimum = minOf(rowMinimum, current[j])
            }
            if (rowMinimum > limit) return limit + 1
            val swap = previous
            previous = current
            current = swap
        }
        return previous[right.length]
    }

    private fun <T> mergeExpanded(primary: List<T>, expanded: List<T>, id: (T) -> String): List<T> {
        val seen = HashSet<String>()
        val merged = ArrayList<T>(expanded.size + primary.size)
        for (item in expanded + primary) {
            if (seen.add(id(item))) merged += item
        }
        return merged
    }

    private inner class SearchSession(private val query: String) {
        private val songs = PagedCategory { token ->
            searchFiltered(query, SONG_FILTER, token, YouTubeMusicParser::parseSongSearch)
        }
        private val artists = PagedCategory { token ->
            searchFiltered(query, ARTIST_FILTER, token, YouTubeMusicParser::parseArtistSearch, 20)
        }
        private val albums = PagedCategory { token ->
            searchFiltered(query, ALBUM_FILTER, token, { YouTubeMusicParser.parseCollectionSearch(it, "album") }, 20)
        }
        private val playlists = PagedCategory { token ->
            searchFiltered(query, PLAYLIST_FILTER, token, { YouTubeMusicParser.parseCollectionSearch(it, "playlist") }, 20)
        }
        private var expansionResolved = false
        private var expansion: String? = null
        private var expansionResults: List<ParsedTrack>? = null
        private var fallbackResults: MixedSearch? = null

        private fun shouldExpand(primary: List<ParsedTrack>): Boolean {
            if (primary.isEmpty()) return true
            val normalizedQuery = TextMatch.normalize(query)
            if (normalizedQuery.isBlank()) return false
            // A one-word query that YouTube resolves to a shelf of tracks all
            // named exactly that word is ambiguous (for example "Taare"). A
            // query whose first results are already a clear song or artist is
            // left in YouTube's own relevance order.
            if (normalizedQuery.split(' ').count { it.isNotBlank() } > 1) return false
            return primary.take(5).count { track ->
                TextMatch.normalize(track.title) == normalizedQuery
            } >= 3
        }

        private suspend fun resolveExpansion(primary: List<ParsedTrack>): String? {
            if (!expansionResolved) {
                expansionResolved = true
                val suggestions = if (shouldExpand(primary)) searchSuggestions(query) else emptyList()
                expansion = expansionQuery(query, suggestions)
                logger.info(
                    "search_expansion",
                    mapOf(
                        "suggestionCount" to suggestions.size,
                        "expanded" to (expansion != null),
                    ),
                )
            }
            return expansion
        }

        private suspend fun expandedTracks(expandedQuery: String): List<ParsedTrack> {
            expansionResults?.let { return it }
            val tracks = runCatching {
                searchFiltered(
                    query = expandedQuery,
                    filter = SONG_FILTER,
                    continuation = null,
                    parser = YouTubeMusicParser::parseSongSearch,
                    limit = 12,
                ).items
            }.getOrElse { error ->
                logger.warn(
                    "search_expanded_failed",
                    mapOf("type" to (error::class.simpleName ?: "Exception")),
                )
                emptyList()
            }
            return tracks.also { expansionResults = it }
        }

        private suspend fun fallbackSearch(): MixedSearch? {
            fallbackResults?.let { return it }
            return mixedSearch(query).also { fallbackResults = it }
        }

        suspend fun page(offset: Int, limit: Int): MusicSearchResultsDto {
            val needed = offset + limit
            val songsPage = songs.ensure(needed)
            val artistsPage = artists.ensure(needed)
            val albumsPage = albums.ensure(needed)
            val playlistsPage = playlists.ensure(needed)
            val expandedQuery = resolveExpansion(songsPage.first)
            val expandedTracks = if (expandedQuery == null) {
                emptyList()
            } else {
                expandedTracks(expandedQuery)
            }

            var allTracks = mergeExpanded(songsPage.first, expandedTracks, ParsedTrack::videoId)
            var allArtists = artistsPage.first
            var allAlbums = albumsPage.first
            var allPlaylists = playlistsPage.first

            if (allTracks.isEmpty() && allArtists.isEmpty() && allAlbums.isEmpty() && allPlaylists.isEmpty()) {
                fallbackSearch()?.let { fallback ->
                    allTracks = fallback.tracks
                    allArtists = fallback.artists
                    allAlbums = fallback.albums
                    allPlaylists = fallback.playlists
                }
            }

            val hasMore = songsPage.second || artistsPage.second || albumsPage.second || playlistsPage.second
            return MusicSearchResultsDto(
                tracks = allTracks.drop(offset).take(limit).map(::toDynamicTrack),
                artists = allArtists.drop(offset).take(limit).map(YouTubeMusicParser::toArtistDto),
                albums = allAlbums.drop(offset).take(limit).map(YouTubeMusicParser::toCollectionDto),
                playlists = allPlaylists.drop(offset).take(limit).map(YouTubeMusicParser::toCollectionDto),
                pagination = SearchPaginationDto(
                    offset = offset,
                    limit = limit,
                    hasMore = hasMore,
                    next = if (hasMore) SearchNextDto(offset + limit) else null,
                ),
                providers = listOf("youtube"),
            )
        }
    }

    private inner class PagedCategory<T>(
        private val fetch: suspend (String?) -> Page<T>,
    ) {
        private val mutex = Mutex()
        private val items = ArrayList<T>()
        private var token: String? = null
        private var initialized = false
        private var exhausted = false

        suspend fun ensure(needed: Int): Pair<List<T>, Boolean> = mutex.withLock {
            var attempts = 0
            while (!exhausted && items.size < needed && attempts < 12) {
                attempts += 1
                val page = runCatching { fetch(if (initialized) token else null) }.getOrElse { error ->
                    logger.warn("search_page_failed", mapOf("type" to (error::class.simpleName ?: "Exception")))
                    Page(emptyList(), null)
                }
                initialized = true
                items += page.items
                token = page.next
                if (page.next == null || page.items.isEmpty()) exhausted = true
            }
            items.toList() to (!exhausted || token != null)
        }
    }

    private data class ParsedTrackGenre(val track: ParsedTrack, val genre: String?)

    private data class HomeQuery(val key: String, val query: String, val genre: String?)

    private fun toDynamicTrack(track: ParsedTrackGenre): MusicTrackDto =
        YouTubeMusicParser.toTrackDto(track.track).copy(genre = track.genre)

    private companion object {
        val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
        val ARTIST_ID = Regex("^UC[A-Za-z0-9_-]{10,50}$")
        val ALBUM_ID = Regex("^MPRE[A-Za-z0-9_-]{5,50}$")
        val PLAYLIST_ID = Regex("^(?:VL|RD|PL|OLAK5uy_)[A-Za-z0-9_-]{5,90}$")

        val GENERIC_QUERY_TOKENS = setOf(
            "song", "songs", "music", "video", "videos", "lyric", "lyrics", "audio",
            "official", "full", "hd", "status", "whatsapp", "shorts", "short", "remix",
            "new", "latest", "best", "top", "hit", "hits", "popular", "playlist",
            "album", "artist", "artists", "live", "cover", "mashup", "movie",
            "film", "scene", "reaction", "reactions", "shorts", "teaser", "trailer",
        )

        const val SONG_FILTER = "EgWKAQIIAWoSEAUQAxAKEAQQCRAQEA4QFRAR"
        const val ARTIST_FILTER = "EgWKAQIgAWoSEAUQAxAKEAQQCRAQEA4QFRAR"
        const val ALBUM_FILTER = "EgWKAQIYAWoSEAUQAxAKEAQQCRAQEA4QFRAR"
        const val PLAYLIST_FILTER = "EgeKAQQoADgBahIQBRADEAoQBBAJEBAQDhAVEBE="

        val BROWSE_CATEGORIES = listOf(
            MusicBrowseCategoryDto("bollywood", "Bollywood", "#e13300"),
            MusicBrowseCategoryDto("hindi", "Hindi", "#d84040"),
            MusicBrowseCategoryDto("punjabi", "Punjabi", "#c2410c"),
            MusicBrowseCategoryDto("bhojpuri", "Bhojpuri", "#9a3412"),
            MusicBrowseCategoryDto("pop", "Pop", "#dc148c"),
            MusicBrowseCategoryDto("hip-hop", "Hip-Hop", "#ba5d07"),
            MusicBrowseCategoryDto("electronic", "Electronic", "#8400e7"),
            MusicBrowseCategoryDto("rnb", "R&B", "#8c1932"),
            MusicBrowseCategoryDto("rock", "Rock", "#e8115b"),
            MusicBrowseCategoryDto("indie", "Indie", "#608108"),
            MusicBrowseCategoryDto("dance", "Dance", "#148a08"),
            MusicBrowseCategoryDto("chill", "Chill", "#477d95"),
            MusicBrowseCategoryDto("jazz", "Jazz", "#777777"),
            MusicBrowseCategoryDto("classical", "Classical", "#7d4b32"),
            MusicBrowseCategoryDto("latin", "Latin", "#e1118c"),
            MusicBrowseCategoryDto("metal", "Metal", "#a0a0a0"),
            MusicBrowseCategoryDto("acoustic", "Acoustic", "#8d6c42"),
            MusicBrowseCategoryDto("ambient", "Ambient", "#2f5d62"),
            MusicBrowseCategoryDto("funk", "Funk", "#9b5de5"),
            MusicBrowseCategoryDto("soundtrack", "Soundtrack", "#176b87"),
        )
    }
}
