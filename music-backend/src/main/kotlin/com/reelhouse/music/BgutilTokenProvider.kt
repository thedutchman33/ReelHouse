package com.reelhouse.music

import com.metrolist.innertubex.extraction.PoTokenResult
import com.metrolist.innertubex.extraction.TokenProvider
import com.metrolist.innertubex.extraction.TokenProviderCapabilities
import com.metrolist.innertubex.extraction.strategy.PoTokenProviderKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URI
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min

/**
 * InnerTubeX token provider backed by Metrolist's pinned loopback bgutil sidecar.
 *
 * The sidecar performs the real BotGuard challenge and returns a short-lived
 * WEB_BOTGUARD token. This class only transports and caches those tokens; it
 * never fabricates, scrapes, or logs them.
 */
internal class BgutilTokenProvider(
    providerUrl: String,
    private val timeoutMs: Long,
    private val logger: AppLogger,
    private val http: ExternalHttp = ExternalHttp(timeoutMs),
) : TokenProvider {
    private data class CachedToken(val value: String, val expiresAtMs: Long)

    private val baseUrl = providerUrl.trim().trimEnd('/')

    init {
        val uri = runCatching { URI.create(baseUrl) }.getOrNull()
        require(uri != null && uri.scheme == "http" && uri.host in LOOPBACK_HOSTS) {
            "PO_TOKEN_PROVIDER_URL must be a loopback http URL"
        }
        logger.info(
            "po_token_provider_initialized",
            mapOf(
                "provider" to "WEB_BOTGUARD",
                "usesWebView" to false,
                "host" to uri.host,
                "port" to uri.port,
                "timeoutMs" to timeoutMs,
            ),
        )
    }

    private val playerTokens = ConcurrentHashMap<String, CachedToken>()
    private val streamingTokens = ConcurrentHashMap<String, CachedToken>()
    private val tokenLocks = ConcurrentHashMap<String, Mutex>()
    private val lockGuard = Any()

    @Volatile
    private var failureCooldownUntilMs: Long = 0L

    override val capabilities: TokenProviderCapabilities =
        TokenProviderCapabilities(
            providers = setOf(PoTokenProviderKind.WEB_BOTGUARD),
            usesWebView = false,
        )

    override suspend fun getPoToken(
        videoId: String,
        visitorData: String,
        cookie: String?,
    ): PoTokenResult? {
        if (videoId.isBlank() || visitorData.isBlank()) return null
        val playerToken = tokenFor(
            cache = playerTokens,
            key = "player:$visitorData",
            binding = visitorData,
            kind = "visitor",
            maximumLifetimeMs = PLAYER_TOKEN_TTL_MS,
        ) ?: return null
        val streamingToken = tokenFor(
            cache = streamingTokens,
            key = "video:$videoId",
            binding = videoId,
            kind = "video",
            maximumLifetimeMs = STREAMING_TOKEN_TTL_MS,
        ) ?: return null
        return PoTokenResult(
            playerRequestToken = playerToken,
            streamingDataToken = streamingToken,
            visitorData = visitorData,
        )
    }

    override suspend fun prewarm(cookie: String?) {
        if (System.currentTimeMillis() < failureCooldownUntilMs) {
            logger.info("po_token_provider_cooldown", mapOf("operation" to "prewarm"))
            return
        }
        runCatching {
            val response = http.get("$baseUrl/ping", timeoutMs = timeoutMs)
            if (response.status in 200..299) {
                logger.info("po_token_provider_ready")
            } else {
                logger.warn("po_token_provider_unready", mapOf("status" to response.status))
            }
        }.onFailure { error ->
            if (error is CancellationException) throw error
            logger.warn("po_token_provider_unready", mapOf("type" to error::class.simpleName))
        }
    }

    override suspend fun invalidateAttestation() {
        playerTokens.clear()
        streamingTokens.clear()
        tokenLocks.clear()
        failureCooldownUntilMs = 0L
    }

    override suspend fun close() {
        playerTokens.clear()
        streamingTokens.clear()
        tokenLocks.clear()
    }

    private suspend fun tokenFor(
        cache: ConcurrentHashMap<String, CachedToken>,
        key: String,
        binding: String,
        kind: String,
        maximumLifetimeMs: Long,
    ): String? {
        val now = System.currentTimeMillis()
        cache[key]?.takeIf { it.expiresAtMs - now > EXPIRY_SAFETY_MS }?.let { return it.value }

        val lock = synchronized(lockGuard) { tokenLocks.getOrPut(key) { Mutex() } }
        return lock.withLock {
            val lockedNow = System.currentTimeMillis()
            cache[key]?.takeIf { it.expiresAtMs - lockedNow > EXPIRY_SAFETY_MS }?.let {
                return@withLock it.value
            }
            val fetched = fetchToken(binding, kind) ?: return@withLock null
            val expiresAtMs = min(fetched.expiresAtMs, lockedNow + maximumLifetimeMs)
            if (expiresAtMs <= lockedNow) return@withLock null
            if (expiresAtMs - lockedNow > EXPIRY_SAFETY_MS) {
                cache[key] = CachedToken(fetched.value, expiresAtMs)
                if (cache.size > MAX_CACHE_ENTRIES) {
                    cache.entries.removeIf { it.value.expiresAtMs <= lockedNow }
                    while (cache.size > MAX_CACHE_ENTRIES) {
                        cache.keys.firstOrNull()?.let(cache::remove)
                    }
                }
            }
            logger.info(
                "po_token_acquired",
                mapOf(
                    "kind" to kind,
                    "expiresInMs" to (expiresAtMs - lockedNow),
                    "cached" to (expiresAtMs - lockedNow > EXPIRY_SAFETY_MS),
                ),
            )
            fetched.value
        }
    }

    private suspend fun fetchToken(binding: String, kind: String): CachedToken? {
        val started = System.currentTimeMillis()
        if (started < failureCooldownUntilMs) {
            logger.info("po_token_request_skipped", mapOf("kind" to kind, "reason" to "cooldown"))
            return null
        }
        return try {
            val response = http.postJson(
                url = "$baseUrl/get_pot",
                body = buildJsonObject { put("content_binding", binding) }.toString(),
                timeoutMs = timeoutMs,
            )
            if (response.status !in 200..299) {
                fail(kind, "http_${response.status}", started)
                return null
            }
            val root = runCatching {
                AppJson.parseToJsonElement(response.body).jsonObject
            }.getOrNull()
            val token = root?.get("poToken")?.jsonPrimitive?.contentOrNull
                ?.takeIf { it.length in 1..MAX_TOKEN_LENGTH }
            val returnedBinding = root?.get("contentBinding")?.jsonPrimitive?.contentOrNull
            val expiresAtMs = root?.get("expiresAt")?.jsonPrimitive?.contentOrNull
                ?.let(::parseExpiry)
            if (token == null || returnedBinding != binding || expiresAtMs == null) {
                fail(kind, "invalid_response", started)
                return null
            }
            if (expiresAtMs - System.currentTimeMillis() <= EXPIRY_SAFETY_MS) {
                fail(kind, "expired", started)
                return null
            }
            CachedToken(token, expiresAtMs)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (error: Exception) {
            fail(kind, error::class.simpleName ?: "Exception", started)
            null
        }
    }

    private fun fail(kind: String, reason: String, started: Long) {
        failureCooldownUntilMs = System.currentTimeMillis() + FAILURE_COOLDOWN_MS
        logger.warn(
            "po_token_failed",
            mapOf(
                "kind" to kind,
                "reason" to reason,
                "elapsedMs" to (System.currentTimeMillis() - started),
            ),
        )
    }

    private fun parseExpiry(value: String): Long? =
        runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()

    private companion object {
        val LOOPBACK_HOSTS = setOf("127.0.0.1", "localhost", "::1", "[::1]")
        const val PLAYER_TOKEN_TTL_MS = 10 * 60 * 1000L
        const val STREAMING_TOKEN_TTL_MS = 10 * 60 * 1000L
        const val EXPIRY_SAFETY_MS = 30_000L
        const val FAILURE_COOLDOWN_MS = 30_000L
        const val MAX_TOKEN_LENGTH = 8_192
        const val MAX_CACHE_ENTRIES = 512
    }
}
