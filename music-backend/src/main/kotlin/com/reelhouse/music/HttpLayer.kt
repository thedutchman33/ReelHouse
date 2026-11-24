package com.reelhouse.music

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.coroutines.cancellation.CancellationException

class ApiException(
    val status: Int,
    val code: String,
    override val message: String,
    val retryAfter: String? = null,
) : RuntimeException(message)

class HttpRequest(
    val method: String,
    val path: String,
    val query: Map<String, String>,
    val headers: Map<String, String>,
    val remoteAddress: String?,
    private val bodyStream: InputStream,
) {
    fun header(name: String): String? = headers[name.lowercase()]

    fun query(name: String): String? = query[name]

    fun queryInt(name: String, fallback: Int, min: Int, max: Int): Int =
        query[name]?.toIntOrNull()?.coerceIn(min, max) ?: fallback

    fun readBody(limit: Long): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        var total = 0L
        while (true) {
            val read = bodyStream.read(buffer)
            if (read < 0) break
            total += read
            if (total > limit) throw ApiException(413, "payload_too_large", "Request body is too large")
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    fun readJson(limit: Long = 1_048_576): JsonObject {
        val text = readBody(limit).toString(StandardCharsets.UTF_8)
        return runCatching { AppJson.parseToJsonElement(text).asObjectOrNull() }
            .getOrNull()
            ?: throw ApiException(400, "invalid_json", "Request body must be a JSON object")
    }

    fun bodyStream(): InputStream = bodyStream
}

class HttpResponse(
    val status: Int,
    val body: ByteArray = ByteArray(0),
    val contentType: String = "application/json; charset=utf-8",
    val headers: Map<String, String> = emptyMap(),
    val bodyStream: InputStream? = null,
    val contentLength: Long = body.size.toLong(),
) {
    companion object {
        inline fun <reified T> json(
            value: T,
            status: Int = 200,
            cacheControl: String? = null,
            headers: Map<String, String> = emptyMap(),
        ): HttpResponse {
            val encoded = when (value) {
                is String -> value
                is ByteArray -> value.toString(StandardCharsets.UTF_8)
                else -> AppJson.encodeToString(value)
            }
            return HttpResponse(
                status = status,
                body = encoded.toByteArray(StandardCharsets.UTF_8),
                headers = buildMap {
                    putAll(headers)
                    if (cacheControl != null) put("Cache-Control", cacheControl)
                },
            )
        }

        fun error(status: Int, code: String, message: String, retryAfter: String? = null): HttpResponse {
            val body = ApiErrorBody(ApiErrorDetail(code, message))
            return json(
                body,
                status,
                cacheControl = "no-store",
                headers = buildMap { if (retryAfter != null) put("Retry-After", retryAfter) },
            )
        }

        fun redirect(location: String, status: Int = 302): HttpResponse =
            HttpResponse(status = status, headers = mapOf("Location" to location, "Cache-Control" to "no-store"))

        fun empty(status: Int = 204): HttpResponse = HttpResponse(status = status)
    }
}

fun interface RouteHandler {
    suspend fun handle(request: HttpRequest): HttpResponse
}

private data class Route(
    val method: String,
    val segments: List<String>,
    val handler: RouteHandler,
)

class Router {
    private val routes = mutableListOf<Route>()

    fun get(pattern: String, handler: RouteHandler) = add("GET", pattern, handler)
    fun head(pattern: String, handler: RouteHandler) = add("HEAD", pattern, handler)
    fun post(pattern: String, handler: RouteHandler) = add("POST", pattern, handler)
    fun put(pattern: String, handler: RouteHandler) = add("PUT", pattern, handler)
    fun delete(pattern: String, handler: RouteHandler) = add("DELETE", pattern, handler)

    fun add(method: String, pattern: String, handler: RouteHandler) {
        routes += Route(method.uppercase(), pattern.trim('/').split('/').filter(String::isNotEmpty), handler)
    }

    suspend fun dispatch(request: HttpRequest): HttpResponse {
        val segments = request.path.trim('/').split('/').filter(String::isNotEmpty)
        for (route in routes) {
            if (route.method != request.method || route.segments.size != segments.size) continue
            val params = mutableMapOf<String, String>()
            var matched = true
            for ((index, pattern) in route.segments.withIndex()) {
                val value = segments[index]
                if (pattern.startsWith(":")) {
                    params[pattern.substring(1)] = runCatching {
                        URLDecoder.decode(value, StandardCharsets.UTF_8)
                    }.getOrDefault(value)
                }
                else if (pattern != value) {
                    matched = false
                    break
                }
            }
            if (!matched) continue
            val enriched = if (params.isEmpty()) request else copyRequest(request, params)
            return route.handler.handle(enriched)
        }
        throw ApiException(404, "not_found", "Route not found")
    }

    private fun copyRequest(request: HttpRequest, params: Map<String, String>): HttpRequest =
        HttpRequest(
            method = request.method,
            path = request.path,
            query = request.query + params,
            headers = request.headers,
            remoteAddress = request.remoteAddress,
            bodyStream = request.bodyStream(),
        )
}

class ApiServer(
    private val config: AppConfig,
    private val router: Router,
    private val logger: AppLogger,
) {
    private val server = HttpServer.create(InetSocketAddress("0.0.0.0", config.port), 0)

    fun start() {
        server.executor = Executors.newFixedThreadPool(16) { runnable ->
            Thread(runnable, "music-http").apply { isDaemon = true }
        }
        server.createContext("/") { exchange -> handle(exchange) }
        server.start()
        logger.info("server_started", mapOf("port" to config.port))
    }

    fun stop() {
        server.stop(0)
    }

    private fun handle(exchange: HttpExchange) {
        val started = System.nanoTime()
        val requestId = UUID.randomUUID().toString()
        val method = exchange.requestMethod.uppercase()
        val path = exchange.requestURI.path ?: "/"
        val origin = exchange.requestHeaders.getFirst("Origin")
        try {
            if (origin != null && !isAllowedOrigin(origin)) {
                logger.warn("origin_rejected", mapOf("requestId" to requestId, "origin" to origin, "path" to path))
                write(exchange, HttpResponse.error(403, "origin_not_allowed", "Origin is not allowed"), origin = null)
                return
            }
            if (method == "OPTIONS") {
                write(
                    exchange,
                    HttpResponse.empty(204).let {
                        HttpResponse(
                            status = 204,
                            headers = mapOf(
                                "Access-Control-Allow-Methods" to "GET, POST, PUT, DELETE, OPTIONS",
                                "Access-Control-Allow-Headers" to
                                    "Authorization, Content-Type, X-Import-Categories, X-Import-Archive-Name",
                                "Access-Control-Max-Age" to "600",
                            ),
                        )
                    },
                    origin = origin,
                )
                return
            }

            val headers = exchange.requestHeaders.entries.associate { (key, values) ->
                key.lowercase() to values.joinToString(",")
            }
            val request = HttpRequest(
                method = method,
                path = path,
                query = parseQuery(exchange.requestURI.rawQuery),
                headers = headers,
                remoteAddress = exchange.remoteAddress?.address?.hostAddress,
                bodyStream = exchange.requestBody,
            )
            val response = kotlinx.coroutines.runBlocking {
                try {
                    router.dispatch(request)
                } catch (error: ApiException) {
                    HttpResponse.error(error.status, error.code, error.message, error.retryAfter)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    logger.error(
                        "request_failed",
                        mapOf(
                            "requestId" to requestId,
                            "method" to method,
                            "path" to path,
                            "error" to (error::class.simpleName ?: "Exception"),
                            "detail" to (error.message ?: "").take(300),
                        ),
                    )
                    HttpResponse.error(500, "internal_error", "The music service could not complete this request")
                }
            }
            write(exchange, response, origin = origin)
            val elapsedMs = (System.nanoTime() - started) / 1_000_000
            logger.info(
                "request",
                mapOf(
                    "requestId" to requestId,
                    "method" to method,
                    "path" to path,
                    "status" to response.status,
                    "elapsedMs" to elapsedMs,
                ),
            )
        } catch (error: Exception) {
            logger.error("request_crash", mapOf("requestId" to requestId, "error" to error.message.orEmpty().take(200)))
            runCatching {
                write(exchange, HttpResponse.error(500, "internal_error", "The music service could not complete this request"), origin = null)
            }
        } finally {
            runCatching { exchange.close() }
        }
    }

    private fun write(exchange: HttpExchange, response: HttpResponse, origin: String?) {
        val headers = exchange.responseHeaders
        headers.set("Content-Type", response.contentType)
        headers.set("X-Content-Type-Options", "nosniff")
        headers.set("Referrer-Policy", "no-referrer")
        headers.set("Cache-Control", response.headers["Cache-Control"] ?: "no-store")
        headers.set("Vary", "Origin")
        if (origin != null && isAllowedOrigin(origin)) {
            headers.set("Access-Control-Allow-Origin", origin)
            headers.set("Access-Control-Allow-Credentials", "false")
        }
        for ((key, value) in response.headers) {
            if (key.equals("Cache-Control", ignoreCase = true)) continue
            headers.set(key, value)
        }
        if (response.bodyStream != null) {
            val declaredLength = response.contentLength
            if (declaredLength > 0) headers.set("Content-Length", declaredLength.toString())
            exchange.sendResponseHeaders(
                response.status,
                if (declaredLength > 0) declaredLength else 0,
            )
            response.bodyStream.use { input ->
                exchange.responseBody.use { output -> input.copyTo(output, 64 * 1024) }
            }
            return
        }
        if (response.status == 204 || response.status == 304 || response.body.isEmpty()) {
            exchange.sendResponseHeaders(response.status, -1)
            return
        }
        exchange.sendResponseHeaders(response.status, response.body.size.toLong())
        exchange.responseBody.use { it.write(response.body) }
    }

    private fun isAllowedOrigin(origin: String): Boolean {
        val normalized = origin.trimEnd('/')
        return config.allowedOrigins.any { it.equals(normalized, ignoreCase = true) }
    }

    private fun parseQuery(raw: String?): Map<String, String> {
        if (raw.isNullOrBlank()) return emptyMap()
        return raw.split('&').mapNotNull { pair ->
            val index = pair.indexOf('=')
            if (index < 0) null
            else {
                val key = URLDecoder.decode(pair.substring(0, index), StandardCharsets.UTF_8)
                val value = URLDecoder.decode(pair.substring(index + 1), StandardCharsets.UTF_8)
                key to value
            }
        }.toMap()
    }
}

class AppLogger {
    fun info(event: String, fields: Map<String, Any?> = emptyMap()) = log("info", event, fields)
    fun warn(event: String, fields: Map<String, Any?> = emptyMap()) = log("warn", event, fields)
    fun error(event: String, fields: Map<String, Any?> = emptyMap()) = log("error", event, fields)

    private fun log(level: String, event: String, fields: Map<String, Any?>) {
        val payload = buildJsonObject {
            put("time", Instant.now().toString())
            put("level", level)
            put("event", event)
            for ((key, value) in fields) {
                when (value) {
                    null -> Unit
                    else -> put(key, value.toString().take(500))
                }
            }
        }
        println(AppJson.encodeToString(JsonObject.serializer(), payload))
    }
}
