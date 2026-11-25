package com.reelhouse.music

import com.metrolist.innertubex.extraction.PlayerConfig
import com.metrolist.innertubex.extraction.YtConfigParser
import kotlinx.coroutines.CancellationException

/**
 * Metrolist's InnerTubeXPlayer uses this fallback for the watch-page config
 * fetch. A datacenter IP can receive HTTP 302 for the watch page even though
 * the embedded player config remains available. Without this wrapper the
 * extractor aborts before it ever attempts a PO-token-backed player request.
 */
internal fun YtConfigParser.withEmbeddedConfigFallback(logger: AppLogger): YtConfigParser =
    object : YtConfigParser by this {
        override suspend fun fetchConfig(
            videoId: String,
            useLoginCookies: Boolean,
        ): PlayerConfig = try {
            this@withEmbeddedConfigFallback.fetchConfig(videoId, useLoginCookies)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: IllegalStateException) {
            logger.warn(
                "yt_config_watch_failed",
                mapOf(
                    "videoId" to videoId,
                    "detail" to safeConfigDetail(error.message),
                ),
            )
            try {
                this@withEmbeddedConfigFallback.fetchEmbeddedConfig(videoId, useLoginCookies)
                    .also {
                        logger.info(
                            "yt_config_embedded_fallback",
                            mapOf("videoId" to videoId),
                        )
                    }
            } catch (fallback: Exception) {
                if (fallback is CancellationException) throw fallback
                logger.warn(
                    "yt_config_embedded_failed",
                    mapOf(
                        "videoId" to videoId,
                        "type" to (fallback::class.simpleName ?: "Exception"),
                        "detail" to safeConfigDetail(fallback.message),
                    ),
                )
                throw error
            }
        }
    }

private val CONFIG_SECRET = Regex(
    "(?i)(pot|token|visitorData|signature|sig|key|cookie|authorization)=([^&\\s]+)",
)

private fun safeConfigDetail(value: String?): String? =
    value
        ?.replace(CONFIG_SECRET, "${'$'}1=<redacted>")
        ?.replace('\r', ' ')
        ?.replace('\n', ' ')
        ?.trim()
        ?.take(220)
        ?.takeIf(String::isNotBlank)
