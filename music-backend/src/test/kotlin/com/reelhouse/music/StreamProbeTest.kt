package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.StreamResolveException
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlin.test.Test

@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class StreamProbeTest {
    @Test
    fun probeKnownVideo() = runBlocking {
        val http = HttpClient(OkHttp) {
            expectSuccess = false
            install(ContentNegotiation) { json(AppJson) }
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 10_000
                socketTimeoutMillis = 30_000
            }
        }
        val tube = InnerTube(httpClient = http)
        try {
            val store = RemotePlayerConfigStore(http, PlayerConfigRepository.disabled())
            val cipher = YouTubeCipherService(http, store)
            val parser = YtConfigParserImpl(
                httpClient = http,
                innerTube = tube,
                remotePlayerConfigStore = store,
                cipherService = cipher,
            )
            val extractor = InnerTubeExtractor(parser, cipher, tube)
            val videoIds = System.getenv("MUSIC_PROBE_VIDEO_IDS")
                ?.split(',')
                ?.map(String::trim)
                ?.filter(String::isNotBlank)
                ?.takeIf(List<String>::isNotEmpty)
                ?: listOf("dQw4w9WgXcQ", "T7t38uDUg5E", "FapBH3j6WoA")
            for (videoId in videoIds) {
                try {
                    val hints = ContentHints(wantVideo = false)
                        .withStreamCapabilities(
                            allowHls = false,
                            allowSabr = false,
                            allowBoundedRange = true,
                            allowProgressive = true,
                        )
                    val stream = extractor.extract(videoId, hints, audioQuality = AudioQuality.HIGH)
                    println("STREAM_OK $videoId mime=${stream?.mimeType} itag=${stream?.itag} bytes=${stream?.contentLengthBytes}")
                } catch (error: StreamResolveException) {
                    println("STREAM_FAIL $videoId reason=${error.reason} message=${error.message} diagnostics=${error.diagnostics}")
                } catch (error: Exception) {
                    println("STREAM_ERR $videoId type=${error::class.qualifiedName} message=${error.message}")
                }
            }
        } finally {
            tube.close()
            http.close()
        }
    }
}
