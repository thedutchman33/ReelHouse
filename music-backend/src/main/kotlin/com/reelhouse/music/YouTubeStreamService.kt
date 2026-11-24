package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.models.YouTubeClient
import io.ktor.client.HttpClient
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Instant

data class YouTubeStreamInfo(
    val url: String,
    val mimeType: String?,
    val bitrate: Int?,
    val expiresAt: String?,
    val itag: Int,
    val requestHeaders: Map<String, String> = emptyMap(),
)

class YouTubeStreamService(
    private val config: AppConfig,
    private val httpClient: HttpClient,
    private val innerTube: InnerTube,
    private val logger: AppLogger,
) : AutoCloseable {
    private data class CachedStream(val info: YouTubeStreamInfo, val cachedAt: Long)

    private val cache = ConcurrentHashMap<String, CachedStream>()
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val createLock = Any()
    private val configStore = RemotePlayerConfigStore(
        httpClient = httpClient,
        repository = PlayerConfigRepository.disabled(),
    )
    private val cipherService = YouTubeCipherService(httpClient, configStore)
    private val extractor = InnerTubeExtractor(
        configParser = YtConfigParserImpl(
            httpClient = httpClient,
            innerTube = innerTube,
            remotePlayerConfigStore = configStore,
            cipherService = cipherService,
        ),
        cipherService = cipherService,
        innerTube = innerTube,
    )

    suspend fun stream(videoId: String): YouTubeStreamInfo {
        if (!VIDEO_ID.matches(videoId)) throw ApiException(400, "invalid_video_id", "Invalid video id")
        cache[videoId]?.takeIf { System.currentTimeMillis() - it.cachedAt < CACHE_TTL_MS }?.let {
            return it.info
        }
        val lock = synchronized(createLock) {
            locks.getOrPut(videoId) { Mutex() }
        }
        return lock.withLock {
            cache[videoId]?.takeIf { System.currentTimeMillis() - it.cachedAt < CACHE_TTL_MS }?.let {
                return@withLock it.info
            }
            val direct = runCatching { directPlayerStream(videoId) }.getOrElse { error ->
                logger.warn(
                    "stream_direct_failed",
                    mapOf(
                        "videoId" to videoId,
                        "type" to (error::class.simpleName ?: "Exception"),
                        "detail" to (error.message ?: "").take(160),
                    ),
                )
                null
            }
            val info = direct ?: extractorStream(videoId)
            if (info == null) {
                throw ApiException(
                    502,
                    "stream_unavailable",
                    "This track does not currently expose a browser-playable audio stream",
                )
            }
            cache[videoId] = CachedStream(info, System.currentTimeMillis())
            if (cache.size > 200) {
                val cutoff = System.currentTimeMillis() - CACHE_TTL_MS
                cache.entries.removeIf { it.value.cachedAt < cutoff }
                while (cache.size > 200) {
                    cache.keys.firstOrNull()?.let(cache::remove)
                }
            }
            info
        }
    }

    fun invalidate(videoId: String) {
        cache.remove(videoId)
    }

    private suspend fun directPlayerStream(videoId: String): YouTubeStreamInfo? {
        val response = innerTube.player(YouTubeClient.ANDROID_VR_NO_AUTH, videoId)
        if (response.status.value !in 200..299) return null
        val root = AppJson.parseToJsonElement(response.bodyAsText()).asObjectOrNull() ?: return null
        val playability = root["playabilityStatus"]?.asObjectOrNull()
        if (playability?.get("status")?.asStringOrNull() != "OK") return null
        val formats = root["streamingData"]?.asObjectOrNull()
            ?.get("adaptiveFormats")
            ?.asArrayOrNull()
            ?: return null
        val candidates = formats.mapNotNull { element ->
            val format = element.asObjectOrNull() ?: return@mapNotNull null
            val mime = format["mimeType"].asStringOrNull() ?: return@mapNotNull null
            if (!mime.startsWith("audio/", ignoreCase = true)) return@mapNotNull null
            val url = format["url"].asStringOrNull() ?: return@mapNotNull null
            if (!url.startsWith("https://", ignoreCase = true)) return@mapNotNull null
            val host = runCatching { URI.create(url).host }.getOrNull() ?: return@mapNotNull null
            if (!host.endsWith(".googlevideo.com", ignoreCase = true) &&
                !host.equals("googlevideo.com", ignoreCase = true)
            ) {
                return@mapNotNull null
            }
            val bitrate = format["bitrate"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0
            val itag = format["itag"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0
            Candidate(
                url = url,
                mimeType = mime.substringBefore(';'),
                bitrate = bitrate.takeIf { it > 0 },
                itag = itag,
                expiresAt = expirySeconds(url),
            )
        }
        val selected = candidates
            .sortedWith(compareByDescending<Candidate> { it.mimeType == "audio/mp4" }.thenByDescending { it.bitrate ?: 0 })
            .firstOrNull()
            ?: return null
        return YouTubeStreamInfo(
            url = selected.url,
            mimeType = selected.mimeType,
            bitrate = selected.bitrate,
            expiresAt = selected.expiresAt,
            itag = selected.itag,
            requestHeaders = mapOf(
                "User-Agent" to YouTubeClient.ANDROID_VR_NO_AUTH.userAgent,
                "Accept" to "*/*",
            ),
        )
    }

    private suspend fun extractorStream(videoId: String): YouTubeStreamInfo? {
        return try {
            val extracted = extractor.extract(
                videoId = videoId,
                hints = ContentHints(wantVideo = false)
                    .withStreamCapabilities(
                        allowHls = false,
                        allowSabr = false,
                        allowBoundedRange = true,
                        allowProgressive = false,
                    ),
                audioQuality = AudioQuality.HIGH,
            ) ?: return null
            val expiresAt = extracted.expiresAt?.let { instant ->
                runCatching { Instant.parse(instant.toString()).toString() }.getOrNull()
            }
            YouTubeStreamInfo(
                url = extracted.audioUrl,
                mimeType = extracted.mimeType,
                bitrate = extracted.bitrate,
                expiresAt = expiresAt,
                itag = extracted.itag,
                requestHeaders = extracted.headers + mapOf("Accept" to "*/*"),
            )
        } catch (error: Exception) {
            logger.warn(
                "stream_extractor_failed",
                mapOf(
                    "videoId" to videoId,
                    "type" to (error::class.simpleName ?: "Exception"),
                    "detail" to (error.message ?: "").take(160),
                ),
            )
            null
        }
    }

    private fun expirySeconds(url: String): String? {
        val value = Regex("[?&]expire=(\\d+)").find(url)?.groupValues?.getOrNull(1) ?: return null
        val seconds = value.toLongOrNull() ?: return null
        return runCatching { Instant.fromEpochSeconds(seconds).toString() }.getOrNull()
    }

    private data class Candidate(
        val url: String,
        val mimeType: String,
        val bitrate: Int?,
        val itag: Int,
        val expiresAt: String?,
    )

    override fun close() {
        cache.clear()
        locks.clear()
    }

    private companion object {
        val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
        const val CACHE_TTL_MS = 4 * 60 * 1000L
    }
}
