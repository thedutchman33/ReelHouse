package com.reelhouse.music

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

data class ParsedTrack(
    val videoId: String,
    val title: String,
    val artistName: String,
    val artistBrowseId: String? = null,
    val albumTitle: String? = null,
    val albumBrowseId: String? = null,
    val artworkUrl: String? = null,
    val durationSeconds: Int = 0,
    val playCount: Long? = null,
)

data class ParsedArtist(
    val browseId: String,
    val name: String,
    val avatarUrl: String? = null,
    val monthlyListeners: Long? = null,
    val description: String? = null,
)

data class ParsedCollection(
    val browseId: String,
    val kind: String,
    val title: String,
    val ownerName: String,
    val ownerId: String? = null,
    val artworkUrl: String? = null,
    val trackCount: Int = 0,
    val year: String? = null,
    val description: String? = null,
)

data class ParsedCollectionDetail(
    val collection: ParsedCollection,
    val tracks: List<ParsedTrack>,
)

object YouTubeMusicParser {
    const val MAX_TITLE = 300

    fun parseSongSearch(root: JsonElement): List<ParsedTrack> =
        rows(root).mapNotNull { parseTrackRow(it) }

    fun parseArtistSearch(root: JsonElement): List<ParsedArtist> =
        rows(root).mapNotNull { parseArtistRow(it) }

    fun parseCollectionSearch(root: JsonElement, kindHint: String? = null): List<ParsedCollection> =
        rows(root).mapNotNull { parseCollectionRow(it, kindHint) }

    fun parseArtistDetail(root: JsonElement, artistId: String): MusicArtistDetailDto {
        val header = root.firstObject("musicImmersiveHeaderRenderer")
            ?: root.firstObject("musicVisualHeaderRenderer")
            ?: root.firstObject("musicResponsiveHeaderRenderer")
        val name = textRuns(header?.get("title"))
            ?.takeIf(String::isNotBlank)
            ?: "Artist"
        val description = textRuns(header?.get("description"))
            ?.takeIf(String::isNotBlank)
        val avatar = largestThumbnail(header)
        val monthly = header?.get("monthlyListenerCount")
            ?.let { element ->
                val text = textRuns(element) ?: element.asStringOrNull()
                parseCompactCount(text)
            }
        val rows = rows(root)
        val topTracks = rows.mapNotNull { parseTrackRow(it, fallbackArtist = name, fallbackArtwork = avatar) }
            .distinctBy { it.videoId }
            .take(20)
        val albums = root.collectObjects("musicTwoRowItemRenderer")
            .mapNotNull { parseTwoRowItem(it) }
            .filter { it.kind == "album" }
            .distinctBy { it.browseId }
            .take(30)
        val artist = MusicArtistDto(
            id = "youtube:artist:$artistId",
            provider = "youtube",
            providerId = artistId,
            name = name.take(MAX_TITLE),
            avatarUrl = avatar,
            headerUrl = avatar,
            bio = description?.take(4_000),
            followers = monthly,
            trackCount = topTracks.size,
            externalUrl = "https://music.youtube.com/channel/$artistId",
        )
        return MusicArtistDetailDto(
            artist = artist,
            topTracks = topTracks.map(::toTrackDto),
            albums = albums.map { toCollectionDto(it) },
        )
    }

    fun parseCollectionDetail(
        root: JsonElement,
        browseId: String,
        kind: String,
    ): ParsedCollectionDetail {
        val header = root.firstObject("musicResponsiveHeaderRenderer")
            ?: root.firstObject("musicDetailHeaderRenderer")
            ?: root.firstObject("musicEditablePlaylistDetailHeaderRenderer")
        val title = textRuns(header?.get("title"))?.takeIf(String::isNotBlank)
            ?: if (kind == "album") "Album" else "Playlist"
        val subtitle = textRuns(header?.get("subtitle"))
        val strapline = textRuns(header?.get("straplineTextOne"))
        val description = textRuns(header?.get("description"))
        val secondSubtitle = textRuns(header?.get("secondSubtitle"))
        val artwork = largestThumbnail(header)
        val headerArtist = header?.let(::artistNavigationRun)
        val artistName = strapline
            ?.substringBefore(" • ")
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: headerArtist?.get("text").asStringOrNull()
            ?: subtitle
                ?.substringAfter(" • ", "")
                ?.substringBefore(" • ")
                ?.trim()
                ?.takeIf(String::isNotBlank)
            ?: if (kind == "album") "Unknown artist" else "YouTube Music"
        val combinedSubtitle = listOfNotNull(subtitle, secondSubtitle).joinToString(" • ")
        val trackCount = Regex("""(\d[\d,]*)\s+songs?""", RegexOption.IGNORE_CASE)
            .find(combinedSubtitle)
            ?.groupValues
            ?.getOrNull(1)
            ?.replace(",", "")
            ?.toIntOrNull()
            ?: 0
        val year = Regex("""\b(19\d{2}|20\d{2})\b""")
            .find(subtitle.orEmpty())
            ?.value
        val tracks = rows(root)
            .mapNotNull { row ->
                parseTrackRow(
                    row = row,
                    fallbackArtist = artistName,
                    fallbackAlbum = title,
                    fallbackArtwork = artwork,
                )
            }
            .distinctBy { it.videoId }
        val collection = ParsedCollection(
            browseId = browseId,
            kind = kind,
            title = title.take(MAX_TITLE),
            ownerName = artistName.take(MAX_TITLE),
            ownerId = headerArtist?.obj("navigationEndpoint", "browseEndpoint")?.get("browseId").asStringOrNull(),
            artworkUrl = artwork,
            trackCount = maxOf(trackCount, tracks.size),
            year = year,
            description = description?.take(2_000),
        )
        return ParsedCollectionDetail(collection, tracks)
    }

    fun parsePlayerDetails(root: JsonElement, videoId: String): MusicTrackDto? {
        val details = root.firstObject("videoDetails") ?: return null
        val title = details["title"].asStringOrNull()?.takeIf(String::isNotBlank) ?: return null
        val author = details["author"].asStringOrNull()?.takeIf(String::isNotBlank) ?: "Unknown artist"
        val duration = details["lengthSeconds"].asIntOrNull() ?: 0
        val artwork = largestThumbnail(details)
        val channelId = details["channelId"].asStringOrNull()
        return MusicTrackDto(
            id = "youtube:$videoId",
            provider = "youtube",
            providerId = videoId,
            videoId = videoId,
            title = title.take(MAX_TITLE),
            artistId = artistId(author, channelId),
            artistName = author.take(MAX_TITLE),
            albumId = null,
            albumTitle = null,
            artworkUrl = artwork,
            duration = duration,
            isStreamable = true,
            externalUrl = "https://music.youtube.com/watch?v=$videoId",
        )
    }

    fun continuationToken(root: JsonElement): String? {
        val commands = root.collectObjects("continuationCommand")
        for (command in commands) {
            command["token"].asStringOrNull()?.let { return it }
        }
        for (key in listOf("nextContinuationData", "reloadContinuationData", "nextRadioContinuationData")) {
            for (data in root.collectObjects(key)) {
                data["continuation"].asStringOrNull()?.let { return it }
            }
        }
        return null
    }

    fun rows(root: JsonElement): List<JsonObject> = root.collectObjects("musicResponsiveListItemRenderer")

    fun parseTrackRow(
        row: JsonObject,
        fallbackArtist: String? = null,
        fallbackAlbum: String? = null,
        fallbackArtwork: String? = null,
    ): ParsedTrack? {
        val columns = row["flexColumns"].asArrayOrNull() ?: return null
        val firstRuns = runsFromColumn(columns, 0)
        val title = firstRuns.mapNotNull { it["text"].asStringOrNull() }.joinToString("").trim()
        if (title.isBlank()) return null

        val videoId = firstRuns.firstNotNullOfOrNull { run ->
            run.obj("navigationEndpoint", "watchEndpoint")?.get("videoId").asStringOrNull()
        } ?: row.obj("playlistItemData")?.get("videoId").asStringOrNull()
            ?: row.obj("navigationEndpoint", "watchEndpoint")?.get("videoId").asStringOrNull()
            ?: return null
        if (!VIDEO_ID.matches(videoId)) return null

        val allRuns = columns.flatMap { column ->
            column.asObjectOrNull()
                ?.obj("musicResponsiveListItemFlexColumnRenderer", "text")
                ?.get("runs")
                .asArrayOrNull()
                ?.mapNotNull { it.asObjectOrNull() }
                .orEmpty()
        }
        val fixedRuns = row["fixedColumns"].asArrayOrNull()?.flatMap { column ->
            column.asObjectOrNull()
                ?.obj("musicResponsiveListItemFixedColumnRenderer", "text")
                ?.get("runs")
                .asArrayOrNull()
                ?.mapNotNull { it.asObjectOrNull() }
                .orEmpty()
        }.orEmpty()
        val artistRun = allRuns.firstOrNull { pageType(it) == "MUSIC_PAGE_TYPE_ARTIST" }
            ?: allRuns.drop(1).firstOrNull {
                val text = it["text"].asStringOrNull()
                text != null && text != " • " && !CLOCK.matches(text) && !text.contains("play", true)
            }
        val albumRun = allRuns.firstOrNull { pageType(it) == "MUSIC_PAGE_TYPE_ALBUM" }
        val artistName = artistRun?.get("text").asStringOrNull()
            ?.takeIf(String::isNotBlank)
            ?: fallbackArtist
            ?: "Unknown artist"
        val artistBrowse = artistRun?.obj("navigationEndpoint", "browseEndpoint")?.get("browseId").asStringOrNull()
        val albumBrowse = albumRun?.obj("navigationEndpoint", "browseEndpoint")?.get("browseId").asStringOrNull()
        val albumTitle = albumRun?.get("text").asStringOrNull()
            ?.takeIf(String::isNotBlank)
            ?: fallbackAlbum
        val duration = (allRuns + fixedRuns)
            .mapNotNull { parseClock(it["text"].asStringOrNull()) }
            .firstOrNull()
            ?: 0
        val playCount = allRuns
            .filter { run ->
                val text = run["text"].asStringOrNull().orEmpty()
                text.contains("play", ignoreCase = true) || text.contains("listener", ignoreCase = true)
            }
            .mapNotNull { parseCompactCount(it["text"].asStringOrNull()) }
            .firstOrNull { it > 0 }
        return ParsedTrack(
            videoId = videoId,
            title = title.take(MAX_TITLE),
            artistName = artistName.take(MAX_TITLE),
            artistBrowseId = artistBrowse,
            albumTitle = albumTitle?.take(MAX_TITLE),
            albumBrowseId = albumBrowse,
            artworkUrl = largestThumbnail(row) ?: fallbackArtwork,
            durationSeconds = duration,
            playCount = playCount,
        )
    }

    private fun parseArtistRow(row: JsonObject): ParsedArtist? {
        val firstRuns = runsFromColumn(row["flexColumns"].asArrayOrNull() ?: return null, 0)
        val name = firstRuns.mapNotNull { it["text"].asStringOrNull() }.joinToString("").trim()
        if (name.isBlank()) return null
        val browseId = row.obj("navigationEndpoint", "browseEndpoint")?.get("browseId").asStringOrNull()
            ?: firstRuns.firstNotNullOfOrNull {
                it.obj("navigationEndpoint", "browseEndpoint")?.get("browseId").asStringOrNull()
            }
            ?: return null
        if (!ARTIST_ID.matches(browseId)) return null
        val subtitle = row.arr("flexColumns")?.getOrNull(1)
            ?.asObjectOrNull()
            ?.obj("musicResponsiveListItemFlexColumnRenderer", "text")
            ?.let { textRuns(it) }
        return ParsedArtist(
            browseId = browseId,
            name = name.take(MAX_TITLE),
            avatarUrl = largestThumbnail(row),
            monthlyListeners = regexCount(subtitle, Regex("""([\d.,]+\s*(?:crore|lakh|million|thousand|k|m)?)\s+(?:monthly audience|subscribers?)""", RegexOption.IGNORE_CASE)),
        )
    }

    private fun parseCollectionRow(row: JsonObject, kindHint: String?): ParsedCollection? {
        val firstRuns = runsFromColumn(row["flexColumns"].asArrayOrNull() ?: return null, 0)
        val title = firstRuns.mapNotNull { it["text"].asStringOrNull() }.joinToString("").trim()
        if (title.isBlank()) return null
        val nav = row.obj("navigationEndpoint", "browseEndpoint")
            ?: firstRuns.firstNotNullOfOrNull { it.obj("navigationEndpoint", "browseEndpoint") }
            ?: return null
        val browseId = nav["browseId"].asStringOrNull() ?: return null
        val pageType = pageType(nav)
        val kind = when {
            pageType?.contains("ALBUM") == true || browseId.startsWith("MPRE") -> "album"
            pageType?.contains("PLAYLIST") == true ||
                browseId.startsWith("VL") ||
                browseId.startsWith("RD") ||
                browseId.startsWith("PL") -> "playlist"
            kindHint == "album" || kindHint == "playlist" -> kindHint
            else -> return null
        }
        val columns = row["flexColumns"].asArrayOrNull()
        val secondRuns = columns?.getOrNull(1)
            ?.asObjectOrNull()
            ?.obj("musicResponsiveListItemFlexColumnRenderer", "text")
            ?.get("runs")
            .asArrayOrNull()
            ?.mapNotNull { it.asObjectOrNull() }
            .orEmpty()
        val ownerRun = secondRuns.firstOrNull { pageType(it) == "MUSIC_PAGE_TYPE_ARTIST" }
            ?: secondRuns.getOrNull(0)
        val ownerName = ownerRun?.get("text").asStringOrNull()
            ?.takeIf { it.isNotBlank() && it != " • " }
            ?: if (kind == "album") "Unknown artist" else "YouTube Music"
        val ownerId = ownerRun?.obj("navigationEndpoint", "browseEndpoint")?.get("browseId").asStringOrNull()
        val allSecondText = secondRuns.joinToString(" ") { it["text"].asStringOrNull().orEmpty() }
        val trackCount = Regex("""(\d[\d,]*)\s+songs?""", RegexOption.IGNORE_CASE)
            .find(allSecondText)
            ?.groupValues
            ?.getOrNull(1)
            ?.replace(",", "")
            ?.toIntOrNull()
            ?: 0
        val year = Regex("""\b(19\d{2}|20\d{2})\b""").find(allSecondText)?.value
        return ParsedCollection(
            browseId = browseId,
            kind = kind,
            title = title.take(MAX_TITLE),
            ownerName = ownerName.take(MAX_TITLE),
            ownerId = ownerId,
            artworkUrl = largestThumbnail(row),
            trackCount = trackCount,
            year = year,
        )
    }

    private fun parseTwoRowItem(item: JsonObject): ParsedCollection? {
        val title = textRuns(item["title"])?.trim()?.takeIf(String::isNotBlank) ?: return null
        val nav = item.obj("navigationEndpoint", "browseEndpoint") ?: return null
        val browseId = nav["browseId"].asStringOrNull() ?: return null
        val pageType = pageType(nav)
        val kind = when {
            pageType?.contains("ALBUM") == true || browseId.startsWith("MPRE") -> "album"
            pageType?.contains("PLAYLIST") == true ||
                browseId.startsWith("VL") ||
                browseId.startsWith("RD") -> "playlist"
            else -> return null
        }
        val subtitle = textRuns(item["subtitle"])
        val owner = subtitle
            ?.substringAfter("Album", "")
            ?.substringAfter("Playlist", "")
            ?.trim()
            ?.trimStart('•', ' ')
            ?.substringBefore(" • ")
            ?.takeIf(String::isNotBlank)
            ?: if (kind == "album") "Unknown artist" else "YouTube Music"
        val trackCount = Regex("""(\d[\d,]*)\s+songs?""", RegexOption.IGNORE_CASE)
            .find(subtitle.orEmpty())
            ?.groupValues
            ?.getOrNull(1)
            ?.replace(",", "")
            ?.toIntOrNull()
            ?: 0
        return ParsedCollection(
            browseId = browseId,
            kind = kind,
            title = title.take(MAX_TITLE),
            ownerName = owner.take(MAX_TITLE),
            artworkUrl = largestThumbnail(item),
            trackCount = trackCount,
        )
    }

    private fun artistNavigationRun(header: JsonObject): JsonObject? =
        findRunWithArtistBrowse(header)

    private fun findRunWithArtistBrowse(element: JsonElement?): JsonObject? {
        when (element) {
            is JsonObject -> {
                if (
                    element["text"].asStringOrNull() != null &&
                    pageType(element) == "MUSIC_PAGE_TYPE_ARTIST"
                ) return element
                element.values.forEach { child -> findRunWithArtistBrowse(child)?.let { return it } }
            }
            is JsonArray -> element.forEach { child -> findRunWithArtistBrowse(child)?.let { return it } }
            else -> Unit
        }
        return null
    }

    private fun runsFromColumn(columns: JsonArray, index: Int): List<JsonObject> =
        columns.getOrNull(index)
            ?.asObjectOrNull()
            ?.obj("musicResponsiveListItemFlexColumnRenderer", "text")
            ?.get("runs")
            .asArrayOrNull()
            ?.mapNotNull { it.asObjectOrNull() }
            .orEmpty()

    private fun pageType(element: JsonObject): String? =
        element.obj("navigationEndpoint", "browseEndpoint")
            ?.obj("browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig")
            ?.get("pageType")
            .asStringOrNull()
            ?: element.obj("browseEndpoint", "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig")
                ?.get("pageType")
                .asStringOrNull()

    private fun regexCount(text: String?, regex: Regex): Long? =
        text?.let { regex.find(it)?.groupValues?.getOrNull(1)?.let(::parseCompactCount) }

    fun parseClock(value: String?): Int? {
        if (value.isNullOrBlank()) return null
        val match = CLOCK.find(value) ?: return null
        val parts = match.value.split(':').mapNotNull(String::toIntOrNull)
        return when (parts.size) {
            2 -> parts[0] * 60 + parts[1]
            3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
            else -> null
        }
    }

    fun parseCompactCount(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        val match = Regex("""([\d][\d.,]*)\s*(crore|lakh|million|thousand|billion|m|k|b)?""", RegexOption.IGNORE_CASE)
            .find(value) ?: return null
        val raw = match.groupValues[1].replace(",", "").toDoubleOrNull() ?: return null
        val multiplier = when (match.groupValues[2].lowercase()) {
            "crore" -> 10_000_000.0
            "lakh" -> 100_000.0
            "million", "m" -> 1_000_000.0
            "billion", "b" -> 1_000_000_000.0
            "thousand", "k" -> 1_000.0
            else -> 1.0
        }
        return (raw * multiplier).toLong().takeIf { it > 0 }
    }

    fun toTrackDto(track: ParsedTrack): MusicTrackDto {
        val artistKey = track.artistBrowseId ?: slug(track.artistName)
        return MusicTrackDto(
            id = "youtube:${track.videoId}",
            provider = "youtube",
            providerId = track.videoId,
            videoId = track.videoId,
            title = track.title,
            artistId = "youtube:artist:$artistKey",
            artistName = track.artistName,
            albumId = track.albumBrowseId?.let { "youtube:album:$it" },
            albumTitle = track.albumTitle,
            artworkUrl = track.artworkUrl,
            duration = track.durationSeconds,
            playCount = track.playCount,
            isStreamable = true,
            externalUrl = "https://music.youtube.com/watch?v=${track.videoId}",
            source = "youtube_music",
        )
    }

    fun toArtistDto(artist: ParsedArtist): MusicArtistDto = MusicArtistDto(
        id = "youtube:artist:${artist.browseId}",
        provider = "youtube",
        providerId = artist.browseId,
        name = artist.name,
        avatarUrl = artist.avatarUrl,
        headerUrl = artist.avatarUrl,
        bio = artist.description,
        followers = artist.monthlyListeners,
        externalUrl = "https://music.youtube.com/channel/${artist.browseId}",
    )

    fun toCollectionDto(collection: ParsedCollection): MusicCollectionDto = MusicCollectionDto(
        id = "youtube:${collection.kind}:${collection.browseId}",
        provider = "youtube",
        providerId = collection.browseId,
        kind = collection.kind,
        title = collection.title,
        description = collection.description,
        artworkUrl = collection.artworkUrl,
        ownerName = collection.ownerName,
        ownerId = collection.ownerId?.let { "youtube:artist:$it" },
        trackCount = collection.trackCount,
        accent = if (collection.kind == "album") "#1ed760" else "#7c3aed",
        externalUrl = if (collection.kind == "album") {
            "https://music.youtube.com/playlist?list=OLAK5uy_${collection.browseId}"
        } else {
            "https://music.youtube.com/playlist?list=${collection.browseId.removePrefix("VL")}"
        },
    )

    fun artistId(name: String, browseId: String? = null): String =
        "youtube:artist:${browseId ?: slug(name)}"

    fun slug(value: String): String =
        value.lowercase()
            .replace(Regex("""[^a-z0-9]+"""), "-")
            .trim('-')
            .take(80)
            .ifBlank { "unknown" }

    private val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
    private val ARTIST_ID = Regex("^UC[A-Za-z0-9_-]{10,50}$")
    private val CLOCK = Regex("""(?<!\d)(?:\d{1,2}:){1,2}\d{2}(?!\d)""")
}
