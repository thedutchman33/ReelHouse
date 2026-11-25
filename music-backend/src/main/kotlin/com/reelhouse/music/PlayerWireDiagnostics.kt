package com.reelhouse.music

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Logs the wire-level result of WEB_REMIX player requests without consuming the
 * response body. InnerTubeX's own "tokenized response unavailable" branch logs
 * only the client name; this captures the HTTP status, playability status and
 * reason, and enough format counts to distinguish a playability rejection from
 * a response that has no direct/HLS audio.
 *
 * Never logs request or response URLs, PO tokens, visitor data, cookies, or
 * headers.
 */
internal class PlayerWireDiagnostics(
    private val logger: AppLogger,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.isWebRemixPlayerRequest()) {
            return chain.proceed(request)
        }

        val response =
            try {
                chain.proceed(request)
            } catch (error: IOException) {
                logger.warn(
                    "youtube_player_wire",
                    mapOf(
                        "transportError" to (error::class.simpleName ?: "IOException"),
                        "detail" to sanitizePlayerWireDetail(error.message),
                    ),
                )
                throw error
            }

        val body =
            try {
                response.peekBody(MAX_PEEK_BYTES).string()
            } catch (error: Exception) {
                logger.warn(
                    "youtube_player_wire",
                    mapOf(
                        "httpStatus" to response.code,
                        "peekError" to (error::class.simpleName ?: "Exception"),
                    ),
                )
                return response
            }

        val summary = summarizePlayerWireResponse(response.code, body)
        if (response.code !in 200..299 || summary["playabilityStatus"] != "OK") {
            logger.warn("youtube_player_wire", summary)
        } else {
            logger.info("youtube_player_wire", summary)
        }
        return response
    }

    private fun okhttp3.Request.isWebRemixPlayerRequest(): Boolean =
        url.host.equals(MUSIC_HOST, ignoreCase = true) &&
            url.encodedPath.endsWith(PLAYER_PATH)

    private companion object {
        const val MUSIC_HOST = "music.youtube.com"
        const val PLAYER_PATH = "/youtubei/v1/player"
        const val MAX_PEEK_BYTES = 512L * 1024
    }
}

internal fun summarizePlayerWireResponse(
    httpStatus: Int,
    body: String?,
): Map<String, Any?> {
    val summary = linkedMapOf<String, Any?>("httpStatus" to httpStatus)
    if (body.isNullOrBlank()) {
        summary["parse"] = "empty_body"
        return summary
    }

    val root = runCatching { AppJson.parseToJsonElement(body).asObjectOrNull() }.getOrNull()
    if (root == null) {
        summary["parse"] = "invalid_json"
        summary["bodyLength"] = body.length
        return summary
    }

    summary["parse"] = "ok"
    summary["bodyLength"] = body.length

    val videoDetails = root["videoDetails"].asObjectOrNull()
    videoDetails?.get("videoId").asStringOrNull()?.take(11)?.let { summary["videoId"] = it }

    val playability = root["playabilityStatus"].asObjectOrNull()
    summary["playabilityStatus"] = playability?.get("status").asStringOrNull() ?: "missing"
    sanitizePlayerWireDetail(playability?.get("reason").asStringOrNull())
        ?.let { summary["playabilityReason"] = it }
    playability?.get("desktopLegacyAgeGateReason").asIntOrNull()
        ?.let { summary["desktopLegacyAgeGateReason"] = it }

    val streaming = root["streamingData"].asObjectOrNull()
    summary["streamingPresent"] = streaming != null

    val formats =
        (
            streaming?.get("adaptiveFormats").asArrayOrNull().orEmpty() +
                streaming?.get("formats").asArrayOrNull().orEmpty()
        ).mapNotNull { it.asObjectOrNull() }
    val audioFormats =
        formats.filter { format ->
            format["mimeType"].asStringOrNull()?.startsWith("audio/", ignoreCase = true) == true
        }

    summary["formatCount"] = formats.size
    summary["audioFormatCount"] = audioFormats.size
    summary["audioDirectCount"] =
        audioFormats.count { format ->
            format["url"].asStringOrNull() != null
        }
    summary["audioCipherCount"] =
        audioFormats.count { format ->
            format["signatureCipher"].asStringOrNull() != null ||
                format["cipher"].asStringOrNull() != null
        }
    summary["hlsPresent"] = streaming?.get("hlsManifestUrl").asStringOrNull() != null
    summary["dashPresent"] = streaming?.get("dashManifestUrl").asStringOrNull() != null
    summary["sabrPresent"] = streaming?.get("serverAbrStreamingUrl").asStringOrNull() != null
    return summary
}

internal fun sanitizePlayerWireDetail(value: String?): String? =
    value
        ?.replace(WIRE_SECRET, "${'$'}1=<redacted>")
        ?.replace('\r', ' ')
        ?.replace('\n', ' ')
        ?.trim()
        ?.take(180)
        ?.takeIf(String::isNotBlank)

private val WIRE_SECRET = Regex(
    "(?i)(po_?token|pot|token|visitorData|signature|sig|key|cookie|authorization)=([^&\\s]+)",
)
