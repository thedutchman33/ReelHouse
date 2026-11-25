package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.extraction.TokenProvider
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StreamResolutionTest {
    @Test
    fun playerFallbackContinuesAfterAnEarlierClientIsRejected() = runBlocking {
        val clients = mutableListOf<String>()
        val engine = MockEngine { request ->
            val body = when (val content = request.body) {
                is TextContent -> content.text
                is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
                else -> ""
            }
            val client = Regex("\"clientName\"\\s*:\\s*\"([^\"]+)\"")
                .find(body)
                ?.groupValues
                ?.getOrNull(1)
                .orEmpty()
            clients += client
            if (client == "ANDROID_VR") {
                respond("{}", HttpStatusCode.Forbidden)
            } else {
                respond(
                    content = playerBody(
                        mime = "audio/mp4; codecs=\"mp4a.40.2\"",
                        bitrate = 129_000,
                        itag = 140,
                        url = "https://rr1---sn-gwpa-qxak.googlevideo.com/videoplayback?expire=1893456000",
                    ),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        }
        val http = HttpClient(engine) {
            expectSuccess = false
            install(ContentNegotiation) { json(AppJson) }
        }
        val tube = InnerTube(httpClient = http)
        val noTokenProvider = object : TokenProvider {
            override suspend fun getPoToken(
                videoId: String,
                visitorData: String,
                cookie: String?,
            ) = null
        }
        val service = YouTubeStreamService(
            AppConfig.fromEnvironment(),
            http,
            tube,
            AppLogger(),
            tokenProvider = noTokenProvider,
        )
        try {
            val info = service.stream("NJAv_7lHUIU")
            assertEquals("audio/mp4", info.mimeType)
            assertEquals(140, info.itag)
            assertEquals(129_000, info.bitrate)
            assertTrue(clients.contains("ANDROID_VR"))
            assertTrue(clients.contains("IOS_PRODUCER"))
        } finally {
            service.close()
            tube.close()
            http.close()
        }
    }

    @Test
    fun audioOnlyMp4IsPreferredOverProgressiveMp4() {
        val streaming = streamingData(
            adaptive = listOf(
                format("audio/webm; codecs=\"opus\"", 160_000, 251, audioQuality = null),
                format("audio/mp4; codecs=\"mp4a.40.2\"", 129_000, 140, audioQuality = "AUDIO_QUALITY_MEDIUM"),
            ),
            progressive = listOf(format("video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"", 96_000, 18, audioQuality = "AUDIO_QUALITY_LOW")),
        )
        val formats = parsePlayableFormats(streaming, allowProgressive = true)
        assertEquals(3, formats.size)
        val selected = choosePlayableFormat(formats)
        assertEquals(140, selected?.itag)
        assertTrue(selected?.audioOnly == true)
    }

    @Test
    fun progressiveMuxedMp4IsOnlyAcceptedWhenAllowed() {
        val streaming = streamingData(
            adaptive = emptyList(),
            progressive = listOf(format("video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"", 96_000, 18, audioQuality = "AUDIO_QUALITY_LOW")),
        )
        assertTrue(parsePlayableFormats(streaming, allowProgressive = false).isEmpty())
        assertEquals(18, choosePlayableFormat(parsePlayableFormats(streaming, allowProgressive = true))?.itag)
    }

    @Test
    fun videoOnlyProgressiveFormatsAreRejected() {
        val streaming = streamingData(
            adaptive = emptyList(),
            progressive = listOf(format("video/mp4; codecs=\"avc1.42001E\"", 500_000, 137, audioQuality = null)),
        )
        assertTrue(parsePlayableFormats(streaming, allowProgressive = true).isEmpty())
    }

    @Test
    fun nonHttpsAndNonGoogleStreamUrlsAreRejected() {
        assertFalse(isAllowedStreamUrl("http://rr1.googlevideo.com/videoplayback"))
        assertFalse(isAllowedStreamUrl("https://example.com/videoplayback"))
        assertFalse(isAllowedStreamUrl("https://googlevideo.com.evil.example/videoplayback"))
        assertFalse(isAllowedStreamUrl(null))
        assertTrue(isAllowedStreamUrl("https://rr1---sn-gwpa-qxak.googlevideo.com/videoplayback"))
        assertTrue(isAllowedStreamUrl("https://googlevideo.com/videoplayback"))
    }

    @Test
    fun signatureCipherWithoutDirectUrlIsNotAccepted() {
        val streaming = AppJson.parseToJsonElement(
            """{"adaptiveFormats":[{"itag":140,"mimeType":"audio/mp4","bitrate":129000,"signatureCipher":"s=abc"}]}""",
        ).jsonObject
        assertTrue(parsePlayableFormats(streaming, allowProgressive = true).isEmpty())
    }

    @Test
    fun playerStatusesAreClassifiedWithoutBecomingGenericNetworkErrors() {
        assertEquals("login_required", classifyPlayability("LOGIN_REQUIRED"))
        assertEquals("unplayable", classifyPlayability("UNPLAYABLE"))
        assertEquals("error", classifyPlayability("ERROR"))
        assertEquals("age_restricted", classifyPlayability("AGE_VERIFY"))
        assertEquals("ok", classifyPlayability("OK"))
        assertEquals("missing_playability", classifyPlayability(null))
    }

    @Test
    fun drmResponsesAreRejected() {
        val licensed = AppJson.parseToJsonElement(
            """{"licenseInfos":[{"drmFamily":"WIDEVINE"}]}""",
        ).jsonObject
        assertTrue(streamHasDrm(licensed))
        val drmFormat = streamingData(
            adaptive = listOf(
                buildJsonObject {
                    put("itag", 140)
                    put("mimeType", "audio/mp4")
                    put("url", "https://rr1.googlevideo.com/videoplayback")
                    put("drmParams", "x")
                },
            ),
            progressive = emptyList(),
        )
        assertTrue(streamHasDrm(drmFormat))
        assertFalse(streamHasDrm(streamingData(emptyList(), emptyList())))
    }

    @Test
    fun signedUrlExpiryIsReadForCacheRefresh() {
        assertEquals(1_893_456_000L, streamExpiryEpochSeconds("https://rr1.googlevideo.com/videoplayback?expire=1893456000&x=1"))
        assertNull(streamExpiryEpochSeconds("https://rr1.googlevideo.com/videoplayback"))
    }

    private fun format(mime: String, bitrate: Int, itag: Int, audioQuality: String?): JsonObject =
        buildJsonObject {
            put("itag", itag)
            put("mimeType", mime)
            put("bitrate", bitrate)
            put("url", "https://rr1---sn-gwpa-qxak.googlevideo.com/videoplayback?expire=1893456000")
            if (audioQuality != null) put("audioQuality", audioQuality)
        }

    private fun streamingData(adaptive: List<JsonObject>, progressive: List<JsonObject>): JsonObject =
        buildJsonObject {
            put("adaptiveFormats", buildJsonArray { adaptive.forEach { add(it) } })
            put("formats", buildJsonArray { progressive.forEach { add(it) } })
        }

    private fun playerBody(mime: String, bitrate: Int, itag: Int, url: String): String =
        buildJsonObject {
            put("playabilityStatus", buildJsonObject { put("status", "OK") })
            put(
                "streamingData",
                buildJsonObject {
                    put(
                        "adaptiveFormats",
                        buildJsonArray {
                            add(
                                buildJsonObject {
                                    put("itag", itag)
                                    put("mimeType", mime)
                                    put("bitrate", bitrate)
                                    put("url", url)
                                },
                            )
                        },
                    )
                },
            )
        }.toString()

    @Test
    fun `player body fixture is valid`() {
        val body = playerBody("audio/mp4", 1, 140, "https://rr1.googlevideo.com/videoplayback")
        assertNotNull(AppJson.parseToJsonElement(body).asObjectOrNull())
    }
}
