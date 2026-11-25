package com.reelhouse.music

import com.metrolist.innertubex.InnerTubeLogEvent
import com.metrolist.innertubex.InnerTubeLogLevel
import com.metrolist.innertubex.InnerTubeLogger

/**
 * Bridges InnerTubeX diagnostics into the backend's JSON logger. Only
 * non-sensitive fields are retained; player URLs, cookies, and PO tokens are
 * never emitted.
 */
internal class AppInnerTubeLogger(private val logger: AppLogger) : InnerTubeLogger {
    override fun log(event: InnerTubeLogEvent) {
        val fields = buildMap {
            put("tag", safeLogValue(event.tag)?.take(80) ?: "innertube")
            event.mediaId
                ?.takeIf(String::isNotBlank)
                ?.let { put("mediaId", it.take(64)) }
            safeLogValue(event.message)
                ?.let { put("message", it) }
            for ((key, value) in event.details) {
                if (key.lowercase() in SAFE_DETAIL_KEYS) {
                    safeLogValue(value)?.let { put(key.take(40), it) }
                }
            }
        }
        when (event.level) {
            InnerTubeLogLevel.ERROR -> logger.error("innertube_log", fields + ("level" to "error"))
            InnerTubeLogLevel.WARN -> logger.warn("innertube_log", fields + ("level" to "warn"))
            InnerTubeLogLevel.INFO -> logger.info("innertube_log", fields + ("level" to "info"))
            InnerTubeLogLevel.DEBUG -> logger.info("innertube_log", fields + ("level" to "debug"))
        }
    }

    private fun safeLogValue(value: String?): String? =
        value
            ?.replace(SECRET, "${'$'}1=<redacted>")
            ?.replace('\r', ' ')
            ?.replace('\n', ' ')
            ?.trim()
            ?.take(300)
            ?.takeIf(String::isNotBlank)

    private companion object {
        val SECRET = Regex(
            "(?i)(pot|token|visitorData|signature|sig|key|cookie|authorization)=([^&\\s]+)",
        )
        val SAFE_DETAIL_KEYS = setOf(
            "client",
            "profile",
            "status",
            "reason",
            "httpStatus",
            "itag",
            "mime",
            "attempt",
            "elapsedMs",
            "count",
            "source",
            "type",
            "formatCount",
            "streamingPresent",
            "adaptiveFormatCount",
            "adaptiveDirectCount",
            "adaptiveCipherCount",
            "progressiveFormatCount",
            "progressiveDirectCount",
            "progressiveCipherCount",
            "hlsPresent",
            "dashPresent",
            "sabrPresent",
            "sabrConfigPresent",
            "tokenPresent",
            "tokenUnavailable",
            "failurePresent",
            "requestFailure",
            "profilePresent",
            "playable",
            "exceptionType",
            "budgetExhausted",
            "failureStatus",
            "desktopLegacyAgeGateReason",
        )
    }
}
