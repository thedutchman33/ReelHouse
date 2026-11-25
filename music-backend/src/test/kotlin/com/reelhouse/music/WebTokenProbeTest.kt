package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlin.test.Test

@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class WebTokenProbeTest {
    @Test
    fun serviceResolvesReportedTracksThroughTheSidecar() = runBlocking {
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
        val external = ExternalHttp(30_000)
        val service = YouTubeStreamService(AppConfig.fromEnvironment(), http, tube, AppLogger())
        try {
            for (id in listOf("NJAv_7lHUIU", "U8_MuWSnkCg", "fsiPzT50ZiM")) {
                val started = System.currentTimeMillis()
                val info = service.stream(id)
                println(
                    "SERVICE_OK $id mime=${info.mimeType} itag=${info.itag} bytes=${info.url.length} " +
                        "pot=${info.url.contains("pot=")} elapsed=${System.currentTimeMillis() - started}",
                )
                val range = external.openGet(
                    info.url,
                    info.requestHeaders + mapOf("Range" to "bytes=0-1023"),
                )
                try {
                    val read = range.stream.readNBytes(1024).size
                    println("SERVICE_RANGE $id http=${range.status} read=$read type=${range.header("Content-Type")}")
                } finally {
                    range.close()
                }
            }
        } finally {
            service.close()
            tube.close()
            http.close()
        }
    }
}
