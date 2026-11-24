package com.reelhouse.music

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory

class LyricsService(
    private val config: AppConfig,
    private val http: ExternalHttp,
    private val logger: AppLogger,
) {
    private data class CacheEntry(val value: LyricsDto, val expiresAt: Long)

    private val cache = ConcurrentHashMap<String, CacheEntry>()

    suspend fun lyrics(
        title: String,
        artist: String,
        album: String? = null,
        duration: Int? = null,
    ): LyricsDto {
        val cleanTitle = title.trim().take(200)
        val cleanArtist = artist.trim().take(200)
        if (cleanTitle.isBlank() || cleanArtist.isBlank()) {
            return LyricsDto(lines = emptyList(), plain = null, source = "none")
        }
        val cleanAlbum = album?.trim()?.take(200)?.takeIf { it.isNotBlank() }
        val cleanDuration = duration?.takeIf { it in 1..7_200 }
        val key = sha256("$cleanTitle\u0000$cleanArtist\u0000${cleanAlbum.orEmpty()}\u0000${cleanDuration ?: 0}")
        cache[key]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.value }

        var result = fetchLrclib(cleanTitle, cleanArtist, cleanAlbum, cleanDuration)
        if (!hasLyrics(result)) {
            result = fetchBetterLyrics(cleanTitle, cleanArtist, cleanAlbum, cleanDuration)
        }
        if (!hasLyrics(result)) {
            result = fetchLyricsPlus(cleanTitle, cleanArtist, cleanAlbum, cleanDuration)
        }

        val value = if (hasLyrics(result)) result else result.copy(
            lines = emptyList(),
            plain = null,
            source = result.source,
        )
        val ttl = if (hasLyrics(value)) 24 * 60 * 60 * 1000L else 10 * 60 * 1000L
        cache[key] = CacheEntry(value, System.currentTimeMillis() + ttl)
        pruneCache()
        return value
    }

    private fun hasLyrics(value: LyricsDto): Boolean =
        value.lines.isNotEmpty() || !value.plain.isNullOrBlank() || value.instrumental

    private suspend fun fetchLrclib(
        title: String,
        artist: String,
        album: String?,
        duration: Int?,
    ): LyricsDto {
        val base = "https://lrclib.net/api"
        val headers = buildMap {
            put("Accept", "application/json")
            put("User-Agent", config.lrclibUserAgent)
            if (!config.lrclibAppId.isNullOrBlank() && !config.lrclibApiKey.isNullOrBlank()) {
                put("Lrclib-App-Id", config.lrclibAppId!!)
                put("Lrclib-Api-Key", config.lrclibApiKey!!)
            }
        }
        val exact = buildString {
            append("$base/get?artist_name=").append(enc(artist))
            append("&track_name=").append(enc(title))
            if (album != null) append("&album_name=").append(enc(album))
            if (duration != null) append("&duration=").append(duration)
        }
        val exactResponse = runCatching { http.get(exact, headers, 8_000) }.getOrNull()
        if (exactResponse?.status == 200) {
            record(exactResponse.body)?.let { return lyricsFromRecord(it) }
        }
        val search = "$base/search?artist_name=${enc(artist)}&track_name=${enc(title)}" +
            (album?.let { "&album_name=${enc(it)}" } ?: "")
        val searchResponse = runCatching { http.get(search, headers, 8_000) }.getOrNull() ?: return empty("LRCLIB")
        if (searchResponse.status != 200) return empty("LRCLIB")
        val array = runCatching { AppJson.parseToJsonElement(searchResponse.body).asArrayOrNull() }.getOrNull()
            ?: return empty("LRCLIB")
        val candidates = array.mapNotNull { record(it.toString()) }
            .filter { it.syncedLyrics != null || it.plainLyrics != null }
            .sortedWith(
                compareByDescending<LrcRecord> { it.syncedLyrics != null }
                    .thenBy { record ->
                        if (duration != null && record.duration != null) {
                            kotlin.math.abs(record.duration - duration)
                        } else Int.MAX_VALUE
                    },
            )
        return candidates.firstOrNull()?.let(::lyricsFromRecord) ?: empty("LRCLIB")
    }

    private data class LrcRecord(
        val instrumental: Boolean,
        val plainLyrics: String?,
        val syncedLyrics: String?,
        val duration: Int?,
    )

    private fun record(raw: String): LrcRecord? {
        val obj = runCatching { AppJson.parseToJsonElement(raw).asObjectOrNull() }.getOrNull() ?: return null
        if (obj["statusCode"]?.jsonPrimitive?.content == "404") return null
        val plain = obj["plainLyrics"]?.asStringOrNull()
        val synced = obj["syncedLyrics"]?.asStringOrNull()
        if (plain == null && synced == null && obj["instrumental"]?.jsonPrimitive?.content != "true") return null
        return LrcRecord(
            instrumental = obj["instrumental"]?.jsonPrimitive?.content == "true",
            plainLyrics = plain,
            syncedLyrics = synced,
            duration = obj["duration"]?.jsonPrimitive?.content?.toDoubleOrNull()?.toInt(),
        )
    }

    private fun lyricsFromRecord(record: LrcRecord): LyricsDto {
        if (record.instrumental && record.syncedLyrics.isNullOrBlank() && record.plainLyrics.isNullOrBlank()) {
            return LyricsDto(lines = emptyList(), plain = null, instrumental = true, source = "LRCLIB")
        }
        val lines = parseLrc(record.syncedLyrics.orEmpty())
        return LyricsDto(
            lines = lines,
            plain = record.plainLyrics,
            instrumental = record.instrumental && lines.isEmpty(),
            source = "LRCLIB",
        )
    }

    private suspend fun fetchBetterLyrics(
        title: String,
        artist: String,
        album: String?,
        duration: Int?,
    ): LyricsDto {
        val url = buildString {
            append("https://api.betterlyrics.org/getLyrics?s=").append(enc(title))
            append("&a=").append(enc(artist))
            if (album != null) append("&al=").append(enc(album))
            if (duration != null) append("&d=").append(duration)
        }
        val headers = buildMap {
            put("Accept", "application/json")
            if (!config.betterLyricsApiKey.isNullOrBlank()) {
                put("X-API-Key", config.betterLyricsApiKey!!)
            }
        }
        val response = runCatching { http.get(url, headers, 10_000) }.getOrNull() ?: return empty("BetterLyrics")
        if (response.status != 200) return empty("BetterLyrics")
        val obj = runCatching { AppJson.parseToJsonElement(response.body).asObjectOrNull() }.getOrNull()
            ?: return empty("BetterLyrics")
        val ttml = obj["ttml"]?.asStringOrNull() ?: obj["lyrics"]?.asStringOrNull() ?: return empty("BetterLyrics")
        return parseTtml(ttml)
    }

    private suspend fun fetchLyricsPlus(
        title: String,
        artist: String,
        album: String?,
        duration: Int?,
    ): LyricsDto {
        for (base in config.lyricsPlusBaseUrls) {
            val url = buildString {
                append(base.trimEnd('/')).append("/v2/lyrics/get?title=").append(enc(title))
                append("&artist=").append(enc(artist))
                if (album != null) append("&album=").append(enc(album))
                if (duration != null) append("&duration=").append(duration)
                append("&source=reelhouse")
            }
            val response = runCatching {
                http.get(url, mapOf("Accept" to "application/json", "User-Agent" to config.lrclibUserAgent), 8_000)
            }.getOrNull() ?: continue
            if (response.status != 200) continue
            val parsed = parseLyricsPlus(response.body) ?: continue
            if (hasLyrics(parsed)) return parsed
        }
        return empty("LyricsPlus")
    }

    private fun parseLyricsPlus(raw: String): LyricsDto? {
        val root = runCatching { AppJson.parseToJsonElement(raw) }.getOrNull() ?: return null
        val objectValue = when (root) {
            is JsonObject -> root["data"]?.asObjectOrNull() ?: root
            else -> return null
        }
        val source = objectValue["source"]?.asStringOrNull() ?: "LyricsPlus"
        val plain = objectValue["plain"]?.asStringOrNull()
            ?: objectValue["plainLyrics"]?.asStringOrNull()
        val lyrics = objectValue["lyrics"] ?: objectValue["lines"] ?: objectValue["syncedLyrics"]
        if (lyrics == null) return LyricsDto(lines = emptyList(), plain = plain, source = source)
        if (lyrics is kotlinx.serialization.json.JsonPrimitive) {
            val value = lyrics.asStringOrNull() ?: return null
            if (value.trimStart().startsWith("[")) return LyricsDto(lines = parseLrc(value), source = source)
            return LyricsDto(lines = parseLrc(value), plain = plain ?: value, source = source)
        }
        val array = lyrics.asArrayOrNull() ?: return null
        val lines = array.mapNotNull { item -> parseLyricsPlusLine(item) }
            .sortedBy { it.time }
        return LyricsDto(lines = lines, plain = plain, source = source)
    }

    private fun parseLyricsPlusLine(value: JsonElement): LyricLineDto? {
        if (value is kotlinx.serialization.json.JsonPrimitive) {
            val text = value.asStringOrNull()?.trim().orEmpty()
            return if (text.isNotBlank()) LyricLineDto(0.0, text) else null
        }
        val obj = value.asObjectOrNull() ?: return null
        val text = obj["text"]?.asStringOrNull() ?: obj["line"]?.asStringOrNull() ?: return null
        val rawTime = obj["time"]?.jsonPrimitive?.content?.toDoubleOrNull()
            ?: obj["startTime"]?.jsonPrimitive?.content?.toDoubleOrNull()
            ?: obj["start"]?.jsonPrimitive?.content?.toDoubleOrNull()
            ?: 0.0
        val time = if (rawTime > 10_000) rawTime / 1000.0 else rawTime
        val words = obj["words"]?.asArrayOrNull()?.mapNotNull { word ->
            val wordObj = word.asObjectOrNull() ?: return@mapNotNull null
            val wordText = wordObj["text"]?.asStringOrNull() ?: return@mapNotNull null
            val wordTime = wordObj["time"]?.jsonPrimitive?.content?.toDoubleOrNull()
                ?: wordObj["start"]?.jsonPrimitive?.content?.toDoubleOrNull()
                ?: time
            LyricsWordDto(if (wordTime > 10_000) wordTime / 1000.0 else wordTime, wordText)
        }.orEmpty()
        return LyricLineDto(time, text, words)
    }

    private fun parseLrc(value: String): List<LyricLineDto> {
        if (value.isBlank()) return emptyList()
        val tag = Regex("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?]")
        val lines = mutableListOf<LyricLineDto>()
        for (rawLine in value.lines()) {
            val matches = tag.findAll(rawLine).toList()
            if (matches.isEmpty()) continue
            val text = rawLine.replace(tag, "").trim()
            if (text.isBlank()) continue
            for (match in matches) {
                val minutes = match.groupValues[1].toIntOrNull() ?: continue
                val seconds = match.groupValues[2].toIntOrNull() ?: continue
                val fractionRaw = match.groupValues[3]
                val fraction = when {
                    fractionRaw.isBlank() -> 0.0
                    fractionRaw.length == 1 -> fractionRaw.toDouble() / 10.0
                    fractionRaw.length == 2 -> fractionRaw.toDouble() / 100.0
                    else -> fractionRaw.toDouble() / 1000.0
                }
                lines += LyricLineDto(minutes * 60.0 + seconds + fraction, text)
            }
        }
        return lines.sortedBy { it.time }
    }

    private fun parseTtml(value: String): LyricsDto {
        val factory = DocumentBuilderFactory.newInstance()
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
        factory.isXIncludeAware = false
        factory.isExpandEntityReferences = false
        val document = factory.newDocumentBuilder().parse(ByteArrayInputStream(value.toByteArray(Charsets.UTF_8)))
        val paragraphs = document.getElementsByTagName("p")
        val lines = ArrayList<LyricLineDto>(paragraphs.length)
        for (index in 0 until paragraphs.length) {
            val paragraph = paragraphs.item(index) as? Element ?: continue
            val text = paragraph.textContent.orEmpty().replace(Regex("\\s+"), " ").trim()
            if (text.isBlank()) continue
            val time = parseTtmlTime(paragraph.getAttribute("begin")) ?: continue
            val words = ArrayList<LyricsWordDto>()
            val spans = paragraph.getElementsByTagName("span")
            for (spanIndex in 0 until spans.length) {
                val span = spans.item(spanIndex) as? Element ?: continue
                val word = span.textContent.orEmpty().trim()
                if (word.isBlank()) continue
                val wordTime = parseTtmlTime(span.getAttribute("begin")) ?: time
                words += LyricsWordDto(wordTime, word)
            }
            lines += LyricLineDto(time, text, words)
        }
        val sorted = lines.sortedBy { it.time }
        return LyricsDto(
            lines = sorted,
            plain = if (sorted.isEmpty()) null else sorted.joinToString("\n") { it.text },
            source = "BetterLyrics",
        )
    }

    private fun parseTtmlTime(value: String): Double? {
        val clean = value.trim()
        if (clean.isBlank()) return null
        if (clean.endsWith("ms")) return clean.dropLast(2).toDoubleOrNull()?.div(1000.0)
        if (clean.endsWith("s")) return clean.dropLast(1).toDoubleOrNull()
        if (clean.endsWith("t")) return null
        val parts = clean.replace(',', '.').split(':')
        return try {
            when (parts.size) {
                3 -> parts[0].toDouble() * 3600 + parts[1].toDouble() * 60 + parts[2].toDouble()
                2 -> parts[0].toDouble() * 60 + parts[1].toDouble()
                1 -> parts[0].toDouble()
                else -> null
            }
        } catch (_: NumberFormatException) {
            null
        }
    }

    private fun empty(source: String) = LyricsDto(lines = emptyList(), plain = null, source = source)

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8)

    private fun pruneCache() {
        if (cache.size <= 1_000) return
        val now = System.currentTimeMillis()
        cache.entries.removeIf { it.value.expiresAt <= now }
        while (cache.size > 1_000) {
            cache.keys.firstOrNull()?.let(cache::remove)
        }
    }
}
