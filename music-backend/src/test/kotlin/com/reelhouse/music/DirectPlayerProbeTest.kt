package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.models.YouTubeClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.statement.bodyAsText
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test

@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class DirectPlayerProbeTest {
    @Test
    fun playerClients() = runBlocking {
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
        val videoIds = (System.getenv("MUSIC_PROBE_VIDEO_IDS") ?: System.getenv("MUSIC_PROBE_VIDEO_ID"))
            ?.split(',')
            ?.map(String::trim)
            ?.filter(String::isNotBlank)
            ?.takeIf(List<String>::isNotEmpty)
            ?: listOf("dQw4w9WgXcQ")
        val clients = listOf(
            "ANDROID_VR_NO_AUTH" to YouTubeClient.ANDROID_VR_NO_AUTH,
            "IOS_PRODUCER" to YouTubeClient.IOS_PRODUCER,
            "TVHTML5_SAMSUNG" to YouTubeClient.TVHTML5_SAMSUNG,
            "WEB_EMBEDDED_PLAYER" to YouTubeClient.WEB_EMBEDDED_PLAYER,
            "WEB_REMIX" to YouTubeClient.WEB_REMIX,
        )
        try {
            for (videoId in videoIds) {
                for ((name, client) in clients) {
                    try {
                        val response = tube.player(client, videoId)
                        val text = response.bodyAsText()
                        val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
                        val status = root?.get("playabilityStatus")?.jsonObject?.get("status")?.jsonPrimitive?.content
                        val reason = root?.get("playabilityStatus")?.jsonObject?.get("reason")?.jsonPrimitive?.content
                        val streaming = root?.get("streamingData")?.jsonObject
                        val adaptive = streaming?.get("adaptiveFormats")?.let { runCatching { it.jsonArray }.getOrNull() }.orEmpty()
                        val progressive = streaming?.get("formats")?.let { runCatching { it.jsonArray }.getOrNull() }.orEmpty()
                        val direct = (adaptive + progressive).count { format ->
                            format.jsonObject["url"]?.jsonPrimitive?.content?.startsWith("https://") == true
                        }
                        val keys = streaming?.keys?.joinToString(",")
                        val mimes = adaptive.mapNotNull {
                            it.jsonObject["mimeType"]?.jsonPrimitive?.content?.substringBefore(";")
                        }.distinct().take(4)
                        println("CLIENT $name video=$videoId status=$status reason=$reason adaptive=${adaptive.size} progressive=${progressive.size} direct=$direct mimes=$mimes keys=$keys hls=${streaming?.get("hlsManifestUrl") != null} sabr=${streaming?.get("serverAbrStreamingUrl") != null}")
                    } catch (error: Exception) {
                        println("CLIENT $name video=$videoId ERROR ${error::class.simpleName} ${error.message?.take(200)}")
                    }
                }
            }
        } finally {
            tube.close()
            http.close()
        }
    }
}
