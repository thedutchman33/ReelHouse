package com.reelhouse.music

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlin.test.Test
import kotlin.test.assertTrue

@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class ServiceProbeTest {
    @Test
    fun lyricsAndEnrichment() = runBlocking {
        val config = AppConfig.fromEnvironment()
        val logger = AppLogger()
        val http = ExternalHttp(config.httpTimeoutMs)
        val lyrics = LyricsService(config, http, logger)
        val mb = MusicBrainzService(config, http, logger)
        val result = lyrics.lyrics("Creep", "Radiohead", "Pablo Honey", 238)
        println("LYRICS source=${result.source} lines=${result.lines.size} plain=${result.plain?.length} first=${result.lines.firstOrNull()}")
        assertTrue(result.lines.isNotEmpty() || !result.plain.isNullOrBlank(), "lyrics should resolve")
        val enrichment = mb.enrich("Creep", "Radiohead", "Pablo Honey", 238)
        println("ENRICH $enrichment")
        assertTrue(enrichment != null, "MusicBrainz should enrich this well-known recording")
        val stream = YouTubeMusicService(config, logger)
        try {
            val info = stream.stream("dQw4w9WgXcQ")
            println("STREAM mime=${info.mimeType} bitrate=${info.bitrate} expires=${info.expiresAt}")
            val upstream = http.openGet(info.url, info.requestHeaders + mapOf("Range" to "bytes=0-1023"), 30_000)
            try {
                val bytes = upstream.stream.readNBytes(1024)
                println("STREAM_BYTES status=${upstream.status} length=${bytes.size} contentType=${upstream.header("Content-Type")}")
                assertTrue(upstream.status in 200..299)
                assertTrue(bytes.size > 100)
            } finally {
                upstream.close()
            }
        } finally {
            stream.close()
        }
    }
}
