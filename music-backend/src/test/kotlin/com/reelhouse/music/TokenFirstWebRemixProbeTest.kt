package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.extraction.PoTokenResult
import com.metrolist.innertubex.extraction.TokenProvider
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Live check of the token-first WEB_REMIX path. Requires the pinned sidecar:
 *   MUSIC_LIVE_TESTS=true PO_TOKEN_PROVIDER_URL=http://127.0.0.1:4416 ./gradlew test --tests '*TokenFirstWebRemixProbeTest'
 */
@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class TokenFirstWebRemixProbeTest {
    @Test
    fun taareUsesBothTokenBindingsAndYieldsPlayableAudio() = runBlocking {
        val config = AppConfig.fromEnvironment()
        val http = HttpClient(OkHttp) {
            expectSuccess = false
            install(ContentNegotiation) { json(AppJson) }
            install(HttpTimeout) {
                requestTimeoutMillis = 40_000
                connectTimeoutMillis = 10_000
                socketTimeoutMillis = 40_000
            }
        }
        val tube = InnerTube(httpClient = http)
        val realProvider = BgutilTokenProvider(
            providerUrl = config.poTokenProviderUrl,
            timeoutMs = config.poTokenProviderTimeoutMs,
            logger = AppLogger(),
        )
        var playerTokenPresent = false
        var streamingTokenPresent = false
        val recordingProvider = object : TokenProvider {
            override val capabilities = realProvider.capabilities

            override suspend fun getPoToken(
                videoId: String,
                visitorData: String,
                cookie: String?,
            ): PoTokenResult? {
                val result = realProvider.getPoToken(videoId, visitorData, cookie)
                playerTokenPresent = result?.playerRequestToken?.isNotBlank() == true
                streamingTokenPresent = result?.streamingDataToken?.isNotBlank() == true
                return result
            }

            override suspend fun prewarm(cookie: String?) = realProvider.prewarm(cookie)

            override suspend fun invalidateAttestation() = realProvider.invalidateAttestation()

            override suspend fun close() = realProvider.close()
        }
        val service = YouTubeStreamService(config, http, tube, AppLogger(), recordingProvider)
        try {
            val videoId = System.getenv("MUSIC_PROBE_VIDEO_ID") ?: "OUilrtigWGg"
            val info = service.stream(videoId)
            println(
                "TOKEN_FIRST_OK $videoId mime=${info.mimeType} itag=${info.itag} " +
                    "playerToken=$playerTokenPresent streamingToken=$streamingTokenPresent " +
                    "potUrl=${info.url.contains("pot=")}",
            )
            assertEquals("audio/mp4", info.mimeType)
            assertTrue(playerTokenPresent, "visitor-bound player token was not returned")
            assertTrue(streamingTokenPresent, "video-bound streaming token was not returned")
            assertTrue(info.url.contains("pot="), "streaming token was not attached to the audio URL")

            val external = ExternalHttp(15_000)
            val range = external.openGet(
                info.url,
                info.requestHeaders + mapOf("Range" to "bytes=0-1023"),
            )
            try {
                val bytes = range.stream.readNBytes(1024).size
                println("TOKEN_FIRST_RANGE $videoId http=${range.status} read=$bytes")
                assertTrue(range.status in 200..299, "audio URL returned HTTP ${range.status}")
                assertEquals(1024, bytes)
            } finally {
                range.close()
            }
        } finally {
            service.close()
            tube.close()
            http.close()
        }
    }
}
