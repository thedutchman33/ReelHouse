package com.reelhouse.music

import com.metrolist.innertubex.extraction.PlayerConfig
import com.metrolist.innertubex.extraction.YtConfigParser
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class YtConfigFallbackTest {
    private val embedded = PlayerConfig(
        playerUrl = "https://www.youtube.com/s/player/test/player_ias.vflset/en_US/base.js",
        signatureTimestamp = 12345,
        visitorData = "visitor",
        clientVersion = "2.20260101.00.00",
        encryptedHostFlags = null,
    )

    @Test
    fun fallenWatchConfigUsesEmbeddedConfig() = runBlocking {
        var embeddedCalls = 0
        val parser = object : YtConfigParser {
            override suspend fun fetchConfig(videoId: String, useLoginCookies: Boolean): PlayerConfig {
                throw IllegalStateException("HTTP 302")
            }

            override suspend fun fetchEmbeddedConfig(
                videoId: String,
                useLoginCookies: Boolean,
            ): PlayerConfig {
                embeddedCalls += 1
                return embedded
            }
        }

        val result = parser.withEmbeddedConfigFallback(AppLogger())
            .fetchConfig("NJAv_7lHUIU", useLoginCookies = false)

        assertEquals(embedded, result)
        assertEquals(1, embeddedCalls)
    }

    @Test
    fun successfulWatchConfigDoesNotUseEmbeddedFallback() = runBlocking {
        var embeddedCalls = 0
        val parser = object : YtConfigParser {
            override suspend fun fetchConfig(videoId: String, useLoginCookies: Boolean): PlayerConfig =
                embedded

            override suspend fun fetchEmbeddedConfig(
                videoId: String,
                useLoginCookies: Boolean,
            ): PlayerConfig {
                embeddedCalls += 1
                return embedded
            }
        }

        val result = parser.withEmbeddedConfigFallback(AppLogger())
            .fetchConfig("NJAv_7lHUIU", useLoginCookies = false)

        assertEquals(embedded, result)
        assertEquals(0, embeddedCalls)
    }

    @Test
    fun failedEmbeddedFallbackPreservesTheOriginal302() = runBlocking {
        val parser = object : YtConfigParser {
            override suspend fun fetchConfig(videoId: String, useLoginCookies: Boolean): PlayerConfig {
                throw IllegalStateException("HTTP 302")
            }

            override suspend fun fetchEmbeddedConfig(
                videoId: String,
                useLoginCookies: Boolean,
            ): PlayerConfig {
                throw IllegalStateException("HTTP 404")
            }
        }

        val error = assertFailsWith<IllegalStateException> {
            parser.withEmbeddedConfigFallback(AppLogger())
                .fetchConfig("NJAv_7lHUIU", useLoginCookies = false)
        }
        assertTrue(error.message == "HTTP 302")
    }
}
