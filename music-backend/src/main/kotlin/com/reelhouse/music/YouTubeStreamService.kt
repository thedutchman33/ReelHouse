package com.reelhouse.music

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.StreamResolveException
import com.metrolist.innertubex.extraction.TokenProvider
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.models.YouTubeClient
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
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

/** A format taken from a successful, non-DRM player response. */
internal data class PlayableFormat(
    val url: String,
    val mimeType: String,
    val bitrate: Int?,
    val itag: Int,
    val expiresAt: String?,
    val audioOnly: Boolean,
)

internal fun classifyPlayability(status: String?): String =
    when (status?.uppercase()) {
        null -> "missing_playability"
        "OK" -> "ok"
        "LOGIN_REQUIRED" -> "login_required"
        "UNPLAYABLE" -> "unplayable"
        "ERROR" -> "error"
        "LIVE_STREAM_OFFLINE" -> "live_offline"
        "CONTENT_CHECK_REQUIRED" -> "content_check_required"
        "AGE_CHECK_REQUIRED", "AGE_VERIFY" -> "age_restricted"
        else -> status.lowercase()
    }

internal fun streamExpiryEpochSeconds(url: String): Long? =
    Regex("[?&]expire=(\\d+)").find(url)?.groupValues?.getOrNull(1)?.toLongOrNull()

internal fun isAllowedStreamUrl(url: String?): Boolean {
    if (url == null || !url.startsWith("https://", ignoreCase = true)) return false
    val host = runCatching { URI.create(url).host }.getOrNull() ?: return false
    return host.equals("googlevideo.com", ignoreCase = true) ||
        host.endsWith(".googlevideo.com", ignoreCase = true)
}

internal fun streamHasDrm(streamingData: JsonObject): Boolean {
    if (streamingData["licenseInfos"].asArrayOrNull()?.isNotEmpty() == true) return true
    if (streamingData["drmFamilies"].asArrayOrNull()?.isNotEmpty() == true) return true
    val formats =
        streamingData["adaptiveFormats"].asArrayOrNull().orEmpty() +
            streamingData["formats"].asArrayOrNull().orEmpty()
    return formats.any { element ->
        val format = element.asObjectOrNull() ?: return@any false
        format["drmParams"] != null || format["licenseInfos"].asArrayOrNull()?.isNotEmpty() == true
    }
}

/**
 * Parses only direct HTTPS googlevideo URLs. Signature-ciphered formats are left
 * to InnerTubeX's extractor, which owns the player-script/cipher pipeline.
 */
internal fun parsePlayableFormats(
    streamingData: JsonObject,
    allowProgressive: Boolean,
): List<PlayableFormat> = buildList {
    addAll(
        streamingData["adaptiveFormats"].asArrayOrNull()
            .orEmpty()
            .mapNotNull { parsePlayableFormat(it, allowVideoContainer = false) },
    )
    if (allowProgressive) {
        addAll(
            streamingData["formats"].asArrayOrNull()
                .orEmpty()
                .mapNotNull { parsePlayableFormat(it, allowVideoContainer = true) },
        )
    }
}

private fun parsePlayableFormat(element: JsonElement, allowVideoContainer: Boolean): PlayableFormat? {
    val format = element.asObjectOrNull() ?: return null
    val fullMime = format["mimeType"].asStringOrNull() ?: return null
    val audioOnly = fullMime.startsWith("audio/", ignoreCase = true)
    val muxedAudio = allowVideoContainer &&
        fullMime.startsWith("video/mp4", ignoreCase = true) &&
        (
            format["audioQuality"].asStringOrNull() != null ||
                fullMime.contains("mp4a", ignoreCase = true)
            )
    if (!audioOnly && !muxedAudio) return null
    val url = format["url"].asStringOrNull() ?: return null
    if (!isAllowedStreamUrl(url)) return null
    val bitrate = format["bitrate"].asIntOrNull() ?: 0
    val itag = format["itag"].asIntOrNull() ?: 0
    return PlayableFormat(
        url = url,
        mimeType = fullMime.substringBefore(';'),
        bitrate = bitrate.takeIf { it > 0 },
        itag = itag,
        expiresAt = streamExpiryEpochSeconds(url)?.let { seconds ->
            runCatching { Instant.fromEpochSeconds(seconds).toString() }.getOrNull()
        },
        audioOnly = audioOnly,
    )
}

internal fun choosePlayableFormat(formats: List<PlayableFormat>): PlayableFormat? =
    formats.sortedWith(
        compareByDescending<PlayableFormat> { it.audioOnly }
            .thenByDescending { it.mimeType == "audio/mp4" }
            .thenByDescending { it.bitrate ?: 0 },
    ).firstOrNull()

class YouTubeStreamService(
    private val config: AppConfig,
    private val httpClient: HttpClient,
    private val innerTube: InnerTube,
    private val logger: AppLogger,
    private val tokenProvider: TokenProvider = BgutilTokenProvider(
        providerUrl = config.poTokenProviderUrl,
        timeoutMs = config.poTokenProviderTimeoutMs,
        logger = logger,
    ),
) : AutoCloseable {
    private data class CachedStream(
        val info: YouTubeStreamInfo,
        val cachedAt: Long,
        val expiresAtMs: Long?,
    )

    private data class StreamClient(
        val label: String,
        val client: YouTubeClient,
        /** Progressive muxed MP4 is a last resort for label tracks. */
        val allowProgressive: Boolean,
    )

    private sealed interface PlayerAttempt {
        data class Success(val info: YouTubeStreamInfo) : PlayerAttempt

        data class Failure(
            val client: String,
            val category: String,
            val httpStatus: Int? = null,
            val playability: String? = null,
            val reason: String? = null,
            val errorType: String? = null,
            val errorDetail: String? = null,
            val elapsedMs: Long,
        ) : PlayerAttempt
    }

    private val cache = ConcurrentHashMap<String, CachedStream>()
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val createLock = Any()
    private val configStore = RemotePlayerConfigStore(
        httpClient = httpClient,
        repository = PlayerConfigRepository.disabled(),
        logger = AppInnerTubeLogger(logger),
    )
    private val cipherService = YouTubeCipherService(httpClient, configStore)
    private val extractor = InnerTubeExtractor(
        configParser = YtConfigParserImpl(
            httpClient = httpClient,
            innerTube = innerTube,
            remotePlayerConfigStore = configStore,
            logger = AppInnerTubeLogger(logger),
            cipherService = cipherService,
        ).withEmbeddedConfigFallback(logger),
        cipherService = cipherService,
        innerTube = innerTube,
        // WEB_REMIX otherwise tries one untokenized request first and skips the
        // PO-token provider when that response is not playable. Datacenter egress
        // gets exactly that response, so force both token bindings up front.
        fallbackStrategy = TokenFirstWebRemixStrategy(logger = logger),
        tokenProvider = tokenProvider,
        logger = AppInnerTubeLogger(logger),
    )

    suspend fun stream(videoId: String): YouTubeStreamInfo {
        if (!VIDEO_ID.matches(videoId)) throw ApiException(400, "invalid_video_id", "Invalid video id")
        cachedStream(videoId)?.let { return it }
        val lock = synchronized(createLock) {
            locks.getOrPut(videoId) { Mutex() }
        }
        return lock.withLock {
            cachedStream(videoId)?.let { return@withLock it }
            val started = System.currentTimeMillis()
            val failures = mutableListOf<PlayerAttempt.Failure>()
            // The authenticated WEB_REMIX extractor is the primary path. The
            // independent tokenless clients remain as a fallback when the
            // sidecar is unavailable or the track is not available to web music.
            var info = extractorStream(videoId)
            if (info == null) {
                logger.info(
                    "stream_fallback_start",
                    mapOf(
                        "videoId" to videoId,
                        "reason" to "extractor_unavailable",
                    ),
                )
                info = directPlayerStream(videoId, failures, round = 1)
                if (failures.isNotEmpty() && failures.all { it.isTransient() }) {
                    logger.info(
                        "stream_transient_retry",
                        mapOf(
                            "videoId" to videoId,
                            "attempts" to summarize(failures),
                        ),
                    )
                    delay(250)
                    failures.clear()
                    info = directPlayerStream(videoId, failures, round = 2)
                }
            }
            val elapsedMs = System.currentTimeMillis() - started
            if (info == null) {
                logger.warn(
                    "stream_resolution_failed",
                    mapOf(
                        "videoId" to videoId,
                        "elapsedMs" to elapsedMs,
                        "attempts" to summarize(failures),
                    ),
                )
                throw ApiException(
                    502,
                    "stream_unavailable",
                    "This track does not currently expose a browser-playable audio stream",
                )
            }
            logger.info(
                "stream_resolved",
                mapOf(
                    "videoId" to videoId,
                    "itag" to info.itag,
                    "mime" to info.mimeType,
                    "elapsedMs" to elapsedMs,
                ),
            )
            val expiresAtMs = streamExpiryEpochSeconds(info.url)?.times(1000)
            cache[videoId] = CachedStream(info, System.currentTimeMillis(), expiresAtMs)
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

    suspend fun invalidate(videoId: String) {
        cache.remove(videoId)
        tokenProvider.invalidateAttestation()
    }

    private fun cachedStream(videoId: String): YouTubeStreamInfo? {
        val entry = cache[videoId] ?: return null
        val now = System.currentTimeMillis()
        val freshEnough = now - entry.cachedAt < CACHE_TTL_MS
        val unexpired = entry.expiresAtMs == null || entry.expiresAtMs - now > EXPIRY_SAFETY_MS
        if (!freshEnough || !unexpired) {
            cache.remove(videoId)
            return null
        }
        return entry.info
    }

    /**
     * Every client is attempted independently. A thrown HTTP/network error from
     * one client must not cancel the remaining fallbacks.
     */
    private suspend fun directPlayerStream(
        videoId: String,
        failures: MutableList<PlayerAttempt.Failure>,
        round: Int,
    ): YouTubeStreamInfo? {
        for (entry in STREAM_CLIENTS) {
            val attempt = try {
                playerStream(videoId, entry, round)
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (error: Exception) {
                PlayerAttempt.Failure(
                    client = entry.label,
                    category = exceptionCategory(error),
                    httpStatus = httpStatusFrom(error),
                    errorType = error::class.simpleName ?: "Exception",
                    errorDetail = sanitize(error.message),
                    elapsedMs = 0,
                )
            }
            when (attempt) {
                is PlayerAttempt.Success -> {
                    logger.info(
                        "stream_client_succeeded",
                        mapOf(
                            "videoId" to videoId,
                            "client" to entry.label,
                            "itag" to attempt.info.itag,
                            "mime" to attempt.info.mimeType,
                            "round" to round,
                        ),
                    )
                    return attempt.info
                }
                is PlayerAttempt.Failure -> {
                    failures += attempt
                    logger.warn(
                        "stream_player_attempt_failed",
                        mapOf(
                            "videoId" to videoId,
                            "client" to attempt.client,
                            "category" to attempt.category,
                            "httpStatus" to attempt.httpStatus,
                            "playability" to attempt.playability,
                            "reason" to attempt.reason,
                            "errorType" to attempt.errorType,
                            "errorDetail" to attempt.errorDetail,
                            "round" to round,
                            "elapsedMs" to attempt.elapsedMs,
                        ),
                    )
                }
            }
        }
        return null
    }

    private suspend fun playerStream(
        videoId: String,
        entry: StreamClient,
        round: Int,
    ): PlayerAttempt {
        val started = System.currentTimeMillis()
        val response = try {
            withTimeoutOrNull(CLIENT_TIMEOUT_MS) {
                innerTube.player(entry.client, videoId)
            }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Exception) {
            return PlayerAttempt.Failure(
                client = entry.label,
                category = exceptionCategory(error),
                httpStatus = httpStatusFrom(error),
                errorType = error::class.simpleName ?: "Exception",
                errorDetail = sanitize(error.message),
                elapsedMs = System.currentTimeMillis() - started,
            )
        } ?: return PlayerAttempt.Failure(
            client = entry.label,
            category = "timeout",
            errorDetail = "player request exceeded ${CLIENT_TIMEOUT_MS}ms",
            elapsedMs = System.currentTimeMillis() - started,
        )

        if (response.status.value !in 200..299) {
            val body = runCatching { response.bodyAsText() }.getOrNull()
            val root = body?.let { runCatching { AppJson.parseToJsonElement(it).asObjectOrNull() }.getOrNull() }
            val playability = root?.get("playabilityStatus").asObjectOrNull()
            return PlayerAttempt.Failure(
                client = entry.label,
                category = if (root != null) {
                    classifyPlayability(playability?.get("status").asStringOrNull())
                } else {
                    "http_${response.status.value}"
                },
                httpStatus = response.status.value,
                playability = playability?.get("status").asStringOrNull(),
                reason = sanitize(playability?.get("reason").asStringOrNull()),
                elapsedMs = System.currentTimeMillis() - started,
            )
        }

        val text = try {
            response.bodyAsText()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Exception) {
            return PlayerAttempt.Failure(
                client = entry.label,
                category = "body_read_failed",
                errorType = error::class.simpleName ?: "Exception",
                errorDetail = sanitize(error.message),
                elapsedMs = System.currentTimeMillis() - started,
            )
        }
        val root = runCatching { AppJson.parseToJsonElement(text).asObjectOrNull() }.getOrNull()
            ?: return PlayerAttempt.Failure(
                client = entry.label,
                category = "invalid_player_json",
                elapsedMs = System.currentTimeMillis() - started,
            )
        val playability = root["playabilityStatus"].asObjectOrNull()
        val playabilityStatus = playability?.get("status").asStringOrNull()
        val playabilityFailure = classifyPlayability(playabilityStatus)
        if (playabilityFailure != "ok") {
            return PlayerAttempt.Failure(
                client = entry.label,
                category = playabilityFailure,
                playability = playabilityStatus,
                reason = sanitize(playability?.get("reason").asStringOrNull()),
                elapsedMs = System.currentTimeMillis() - started,
            )
        }
        val streamingData = root["streamingData"].asObjectOrNull()
            ?: return PlayerAttempt.Failure(
                client = entry.label,
                category = "missing_streaming_data",
                elapsedMs = System.currentTimeMillis() - started,
            )
        if (streamHasDrm(streamingData)) {
            return PlayerAttempt.Failure(
                client = entry.label,
                category = "drm_protected",
                elapsedMs = System.currentTimeMillis() - started,
            )
        }
        val formats = parsePlayableFormats(streamingData, entry.allowProgressive)
        val selected = choosePlayableFormat(formats)
            ?: return PlayerAttempt.Failure(
                client = entry.label,
                category = "no_playable_formats",
                reason = "formats=${formats.size}",
                elapsedMs = System.currentTimeMillis() - started,
            )
        return PlayerAttempt.Success(
            YouTubeStreamInfo(
                url = selected.url,
                mimeType = selected.mimeType,
                bitrate = selected.bitrate,
                expiresAt = selected.expiresAt,
                itag = selected.itag,
                requestHeaders = mapOf(
                    "User-Agent" to entry.client.userAgent,
                    "Accept" to "*/*",
                ),
            ),
        )
    }

    private suspend fun extractorStream(videoId: String): YouTubeStreamInfo? {
        val started = System.currentTimeMillis()
        logger.info(
            "stream_extractor_attempt",
            mapOf(
                "videoId" to videoId,
                "client" to "WEB_REMIX",
                "tokenProvider" to tokenProvider.capabilities.providers.joinToString(","),
                "usesWebView" to tokenProvider.capabilities.usesWebView,
            ),
        )
        return try {
            val extracted = extractor.extract(
                videoId = videoId,
                hints = ContentHints(wantVideo = false)
                    .withStreamCapabilities(
                        allowHls = false,
                        allowSabr = false,
                        allowBoundedRange = true,
                        allowProgressive = false,
                    )
                    .copy(playbackClientOverrideId = "WEB_REMIX"),
                audioQuality = AudioQuality.MP4,
            )
            if (extracted == null) {
                logger.warn(
                    "stream_extractor_no_result",
                    mapOf(
                        "videoId" to videoId,
                        "client" to "WEB_REMIX",
                        "elapsedMs" to (System.currentTimeMillis() - started),
                    ),
                )
                return null
            }
            if (!isAllowedStreamUrl(extracted.audioUrl)) {
                logger.warn(
                    "stream_extractor_invalid_url",
                    mapOf(
                        "videoId" to videoId,
                        "itag" to extracted.itag,
                        "elapsedMs" to System.currentTimeMillis() - started,
                    ),
                )
                return null
            }
            val expiresAt = extracted.expiresAt?.let { instant ->
                runCatching { Instant.parse(instant.toString()).toString() }.getOrNull()
            }
            logger.info(
                "stream_extractor_resolved",
                mapOf(
                    "videoId" to videoId,
                    "client" to extracted.clientName,
                    "profile" to extracted.profileId,
                    "itag" to extracted.itag,
                    "mime" to extracted.mimeType,
                    "elapsedMs" to (System.currentTimeMillis() - started),
                ),
            )
            YouTubeStreamInfo(
                url = extracted.audioUrl,
                mimeType = extracted.mimeType,
                bitrate = extracted.bitrate,
                expiresAt = expiresAt,
                itag = extracted.itag,
                requestHeaders = extracted.headers + mapOf("Accept" to "*/*"),
            )
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Exception) {
            val cause = error.cause
            logger.warn(
                "stream_extractor_failed",
                mapOf(
                    "videoId" to videoId,
                    "type" to (error::class.simpleName ?: "Exception"),
                    "reason" to (error as? StreamResolveException)?.reason?.name,
                    "httpStatus" to (httpStatusFrom(error) ?: httpStatusFrom(cause)),
                    "detail" to sanitize(error.message),
                    "causeType" to cause?.let { it::class.simpleName },
                    "causeDetail" to sanitize(cause?.message),
                    "attempts" to diagnosticSummary(error),
                    "elapsedMs" to System.currentTimeMillis() - started,
                ),
            )
            null
        }
    }

    private fun PlayerAttempt.Failure.isTransient(): Boolean =
        category == "timeout" ||
            category == "network" ||
            httpStatus == 429 ||
            (httpStatus != null && httpStatus >= 500)

    private fun summarize(failures: List<PlayerAttempt.Failure>): String =
        failures
            .take(10)
            .joinToString(";") { failure ->
                buildString {
                    append(failure.client)
                    append('=')
                    append(failure.category)
                    failure.httpStatus?.let { append(":http").append(it) }
                    failure.playability?.let { append(":playability=").append(it) }
                    failure.reason?.let { append(":reason=").append(it.take(60)) }
                    failure.errorType?.let { append(":error=").append(it) }
                }
            }
            .take(450)

    private fun sanitize(value: String?): String? =
        value
            ?.replace(Regex("(?i)(pot|key|token|sig|signature|expire|visitorData|poToken|authorization)=([^&\\s]+)"), "$1=<redacted>")
            ?.replace('\r', ' ')
            ?.replace('\n', ' ')
            ?.trim()
            ?.take(180)
            ?.takeIf { it.isNotBlank() }

    private fun exceptionCategory(error: Exception): String =
        when {
            error is HttpRequestTimeoutException ||
                error.message?.contains("timeout", ignoreCase = true) == true ||
                error.cause is java.net.SocketTimeoutException -> "timeout"
            error is IOException || error.cause is IOException -> "network"
            else -> "client_exception"
        }

    private fun httpStatusFrom(error: Throwable?): Int? =
        Regex("HTTP (\\d{3})")
            .find(error?.message.orEmpty())
            ?.groupValues
            ?.getOrNull(1)
            ?.toIntOrNull()

    private fun diagnosticSummary(error: Throwable): String? =
        (error as? StreamResolveException)
            ?.diagnostics
            ?.attempts
            ?.takeLast(6)
            ?.joinToString(";") { attempt ->
                "${attempt.clientName}/${attempt.profileId}=${attempt.outcome}"
            }
            ?.let(::sanitize)

    override fun close() {
        cache.clear()
        locks.clear()
    }

    private companion object {
        val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
        const val CACHE_TTL_MS = 4 * 60 * 1000L
        const val EXPIRY_SAFETY_MS = 30_000L
        const val CLIENT_TIMEOUT_MS = 7_000L

        /**
         * Ordered by usefulness and cost. Android VR supplies audio-only
         * adaptive formats; the tokenless iOS producer exposes a direct
         * progressive MP4 for label-backed music videos that reject it.
         */
        val STREAM_CLIENTS = listOf(
            StreamClient("ANDROID_VR_NO_AUTH", YouTubeClient.ANDROID_VR_NO_AUTH, allowProgressive = false),
            StreamClient("IOS_PRODUCER", YouTubeClient.IOS_PRODUCER, allowProgressive = true),
            StreamClient("ANDROID", YouTubeClient.ANDROID, allowProgressive = true),
        )
    }
}
