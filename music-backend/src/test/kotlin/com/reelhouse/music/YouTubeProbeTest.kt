package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.models.YouTubeClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.statement.bodyAsText
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.net.URLDecoder
import kotlin.test.Test

@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class YouTubeProbeTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun probeSearch() = runBlocking {
        val http = HttpClient(OkHttp) {
            install(ContentNegotiation) { json() }
        }
        val client = InnerTube(httpClient = http)
        val dir = File("../.tmp")
        dir.mkdirs()
        try {
            val filters = mapOf(
                "songs" to "EgWKAQIIAWoSEAUQAxAKEAQQCRAQEA4QFRAR",
                "artists" to "EgWKAQIgAWoSEAUQAxAKEAQQCRAQEA4QFRAR",
                "albums" to "EgWKAQIYAWoSEAUQAxAKEAQQCRAQEA4QFRAR",
                "playlists" to "EgeKAQQoADgBahIQBRADEAoQBBAJEBAQDhAVEBE=",
            )
            for ((name, raw) in filters) {
                val response = client.search(
                    client = YouTubeClient.WEB_REMIX,
                    query = "Radiohead",
                    params = URLDecoder.decode(raw, "UTF-8"),
                    setLogin = false,
                )
                val body = response.bodyAsText()
                File(dir, "yt-filter-$name.json").writeText(body)
                println("FILTER $name ${response.status.value} ${body.length}")
            }

            val artist = client.browse(
                client = YouTubeClient.WEB_REMIX,
                browseId = "UCr_iyUANcn9OX_yy9piYoLw",
            ).bodyAsText()
            File(dir, "yt-artist.json").writeText(artist)

            val albumSearch = File(dir, "yt-filter-albums.json").readText()
            val albumId = firstBrowseId(json.parseToJsonElement(albumSearch), "MPRE")
            if (albumId != null) {
                val album = client.browse(client = YouTubeClient.WEB_REMIX, browseId = albumId).bodyAsText()
                File(dir, "yt-album.json").writeText(album)
                println("ALBUM $albumId ${album.length}")
            }

            val playlistSearch = File(dir, "yt-filter-playlists.json").readText()
            val playlistId = firstBrowseId(json.parseToJsonElement(playlistSearch), "VL")
            if (playlistId != null) {
                val playlist = client.browse(client = YouTubeClient.WEB_REMIX, browseId = playlistId).bodyAsText()
                File(dir, "yt-playlist.json").writeText(playlist)
                println("PLAYLIST $playlistId ${playlist.length}")
            }
            println("PROBE artist=${artist.length} album=$albumId playlist=$playlistId")
        } finally {
            client.close()
            http.close()
        }
    }

    private fun firstBrowseId(element: kotlinx.serialization.json.JsonElement, prefix: String): String? {
        if (element is kotlinx.serialization.json.JsonObject) {
            val browse = element["browseEndpoint"]
            if (browse is kotlinx.serialization.json.JsonObject) {
                val id = browse["browseId"]?.jsonPrimitive?.content
                if (id?.startsWith(prefix) == true) return id
            }
            for (value in element.values) firstBrowseId(value, prefix)?.let { return it }
        } else if (element is kotlinx.serialization.json.JsonArray) {
            for (value in element) firstBrowseId(value, prefix)?.let { return it }
        }
        return null
    }
}
