package com.reelhouse.music

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

class MusicBrainzService(
    private val config: AppConfig,
    private val http: ExternalHttp,
    private val logger: AppLogger,
) {
    private data class CacheEntry(val value: MusicBrainzEnrichmentDto, val expiresAt: Long)

    private val cache = ConcurrentHashMap<String, CacheEntry>()
    private val artistGenreCache = ConcurrentHashMap<String, Pair<List<String>, Long>>()
    private val rateLock = Mutex()
    private var lastRequestAt = 0L

    suspend fun artistGenres(artist: String): List<String> {
        val clean = artist.trim().take(200)
        if (clean.isBlank()) return emptyList()
        val key = sha256(clean.lowercase())
        artistGenreCache[key]?.takeIf { it.second > System.currentTimeMillis() }?.let { return it.first }
        val query = "artist:\"${escapeLucene(clean)}\""
        val url = "https://musicbrainz.org/ws/2/artist?query=${enc(query)}&fmt=json&limit=1"
        val response = runCatching { limitedGet(url) }.getOrNull() ?: return emptyList()
        if (response.status != 200) return emptyList()
        val root = runCatching { AppJson.parseToJsonElement(response.body).asObjectOrNull() }.getOrNull()
            ?: return emptyList()
        val artistRow = root["artists"]?.asArrayOrNull()?.firstOrNull()?.asObjectOrNull()
            ?: return emptyList()
        val genres = (artistRow["genres"].asArrayOrNull().orEmpty() + artistRow["tags"].asArrayOrNull().orEmpty())
            .mapNotNull { item -> item.asObjectOrNull()?.get("name").asStringOrNull() }
            .distinct()
            .take(8)
        artistGenreCache[key] = genres to (System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L)
        return genres
    }

    suspend fun enrich(
        title: String,
        artist: String,
        album: String? = null,
        durationSeconds: Int? = null,
        isrc: String? = null,
    ): MusicBrainzEnrichmentDto? {
        val cleanTitle = title.trim().take(200)
        val cleanArtist = artist.trim().take(200)
        if (cleanTitle.isBlank() || cleanArtist.isBlank()) return null
        val key = sha256("$cleanTitle\u0000$cleanArtist\u0000${album.orEmpty()}\u0000${isrc.orEmpty()}")
        cache[key]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }

        val query = buildString {
            if (!isrc.isNullOrBlank()) {
                append("isrc:").append(escapeLucene(isrc.trim()))
            } else {
                append("recording:\"").append(escapeLucene(cleanTitle)).append('"')
                append(" AND artist:\"").append(escapeLucene(cleanArtist)).append('"')
                if (!album.isNullOrBlank()) {
                    append(" AND release:\"").append(escapeLucene(album.trim())).append('"')
                }
            }
        }
        val url = "https://musicbrainz.org/ws/2/recording?query=${enc(query)}&fmt=json&limit=5"
        val response = runCatching { limitedGet(url) }.getOrNull() ?: return null
        if (response.status != 200) {
            logger.warn("musicbrainz_request_failed", mapOf("status" to response.status))
            return null
        }
        val root = runCatching { AppJson.parseToJsonElement(response.body).asObjectOrNull() }.getOrNull()
            ?: return null
        val recordings = root["recordings"]?.asArrayOrNull() ?: return null
        val best = recordings.mapNotNull { it.asObjectOrNull() }
            .maxByOrNull { score(it, cleanTitle, cleanArtist, durationSeconds) }
            ?: return null
        if (score(best, cleanTitle, cleanArtist, durationSeconds) < 0.55) return null
        val result = enrichment(best)
        cache[key] = CacheEntry(result, System.currentTimeMillis() + 24 * 60 * 60 * 1000L)
        if (cache.size > 500) cache.keys.firstOrNull()?.let(cache::remove)
        return result
    }

    private fun enrichment(recording: JsonObject): MusicBrainzEnrichmentDto {
        val releases = recording["releases"]?.asArrayOrNull()?.mapNotNull { it.asObjectOrNull() }.orEmpty()
        val release = releases.minByOrNull { it["date"]?.asStringOrNull().orEmpty() }
        val genres = recording["genres"]?.asArrayOrNull()?.mapNotNull { genre ->
            genre.asObjectOrNull()?.get("name")?.asStringOrNull()
        }.orEmpty()
        val tags = recording["tags"]?.asArrayOrNull()?.mapNotNull { tag ->
            tag.asObjectOrNull()?.get("name")?.asStringOrNull()
        }.orEmpty()
        val isrcs = recording["isrcs"]?.asArrayOrNull()?.mapNotNull { it.asStringOrNull() }.orEmpty()
        return MusicBrainzEnrichmentDto(
            recordingId = recording["id"]?.asStringOrNull(),
            releaseId = release?.get("id")?.asStringOrNull(),
            releaseDate = release?.get("date")?.asStringOrNull(),
            genres = genres.distinct().take(8),
            tags = tags.distinct().take(12),
            isrcs = isrcs.distinct().take(8),
        )
    }

    private fun score(
        recording: JsonObject,
        title: String,
        artist: String,
        durationSeconds: Int?,
    ): Double {
        val score = recording["score"]?.jsonPrimitive?.content?.toDoubleOrNull()?.div(100.0) ?: 0.0
        val releaseTitle = recording["title"]?.asStringOrNull().orEmpty()
        val titleSimilarity = TextMatch.similarity(title, releaseTitle)
        val artistNames = recording["artist-credit"]?.asArrayOrNull()?.mapNotNull { credit ->
            credit.asObjectOrNull()?.get("name")?.asStringOrNull()
        }.orEmpty()
        val artistSimilarity = artistNames.maxOfOrNull { TextMatch.similarity(artist, it) } ?: 0.0
        val length = recording["length"]?.jsonPrimitive?.content?.toDoubleOrNull()
        val durationScore = if (durationSeconds != null && length != null && length > 0) {
            val diff = kotlin.math.abs(length / 1000.0 - durationSeconds)
            (1.0 - (diff / 20.0)).coerceIn(0.0, 1.0)
        } else 0.5
        return score * 0.25 + titleSimilarity * 0.35 + artistSimilarity * 0.25 + durationScore * 0.15
    }

    private suspend fun limitedGet(url: String): TextHttpResponse {
        rateLock.withLock {
            val wait = 1_100L - (System.currentTimeMillis() - lastRequestAt)
            if (wait > 0) delay(wait)
            lastRequestAt = System.currentTimeMillis()
        }
        return http.get(
            url,
            mapOf(
                "Accept" to "application/json",
                "User-Agent" to config.musicBrainzUserAgent,
            ),
            10_000,
        )
    }

    private fun escapeLucene(value: String): String =
        value.replace(Regex("""[+\-&|!(){}^"~*?:\\\[\]/]"""), "\\\\$1")

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8)
}

object TextMatch {
    private val versionNoise = Regex(
        "(?i)\\b(remaster(ed)?|remastered\\s+\\d{4}|live|demo|edit|version|mono|stereo|explicit|clean|deluxe|bonus|from\\s+the\\s+.*|feat\\.?|featuring|with)\\b.*$",
    )
    private val nonWord = Regex("[^\\p{L}\\p{N}]+")

    fun normalize(value: String): String =
        java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .lowercase()
            .replace(versionNoise, " ")
            .replace("&", " and ")
            .replace(nonWord, " ")
            .trim()

    fun tokens(value: String): Set<String> =
        normalize(value).split(' ').filter { it.length > 1 }.toSet()

    fun similarity(left: String, right: String): Double {
        val a = normalize(left)
        val b = normalize(right)
        if (a.isBlank() || b.isBlank()) return 0.0
        if (a == b) return 1.0
        if (a.contains(b) || b.contains(a)) return 0.9
        val aTokens = tokens(a)
        val bTokens = tokens(b)
        if (aTokens.isEmpty() || bTokens.isEmpty()) return 0.0
        val overlap = aTokens.intersect(bTokens).size.toDouble()
        return (2.0 * overlap / (aTokens.size + bTokens.size)).coerceIn(0.0, 1.0)
    }
}
