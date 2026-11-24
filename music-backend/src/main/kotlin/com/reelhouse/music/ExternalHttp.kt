package com.reelhouse.music

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

data class TextHttpResponse(
    val status: Int,
    val body: String,
    val headers: Map<String, List<String>>,
) {
    fun header(name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.firstOrNull()
}

class StreamHttpResponse(
    val status: Int,
    val stream: java.io.InputStream,
    val headers: Map<String, List<String>>,
) : AutoCloseable {
    fun header(name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.firstOrNull()

    override fun close() = stream.close()
}

class ExternalHttp(private val timeoutMs: Long = 12_000L) {
    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(timeoutMs.coerceAtMost(10_000)))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()

    suspend fun get(
        url: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = this.timeoutMs,
    ): TextHttpResponse = send("GET", url, headers, null, timeoutMs)

    suspend fun postForm(
        url: String,
        form: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = this.timeoutMs,
    ): TextHttpResponse = send(
        "POST",
        url,
        headers + mapOf("Content-Type" to "application/x-www-form-urlencoded"),
        form.toByteArray(Charsets.UTF_8),
        timeoutMs,
    )

    suspend fun postJson(
        url: String,
        body: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = this.timeoutMs,
    ): TextHttpResponse = send(
        "POST",
        url,
        headers + mapOf("Content-Type" to "application/json"),
        body.toByteArray(Charsets.UTF_8),
        timeoutMs,
    )

    suspend fun delete(
        url: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = this.timeoutMs,
    ): TextHttpResponse = send("DELETE", url, headers, null, timeoutMs)

    /** Opens a response body without buffering it in memory (used for audio proxying). */
    suspend fun openGet(
        url: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = this.timeoutMs,
    ): StreamHttpResponse = withContext(Dispatchers.IO) {
        val builder = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofMillis(timeoutMs.coerceAtLeast(2_000)))
        headers.forEach { (key, value) -> if (value.isNotBlank()) builder.header(key, value) }
        builder.GET()
        val response = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
        StreamHttpResponse(
            status = response.statusCode(),
            stream = response.body(),
            headers = response.headers().map(),
        )
    }

    suspend fun send(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: ByteArray?,
        timeoutMs: Long,
    ): TextHttpResponse = withContext(Dispatchers.IO) {
        val builder = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofMillis(timeoutMs.coerceAtLeast(2_000)))
        headers.forEach { (key, value) -> if (value.isNotBlank()) builder.header(key, value) }
        when (method) {
            "GET" -> builder.GET()
            "DELETE" -> builder.DELETE()
            else -> builder.method(method, HttpRequest.BodyPublishers.ofByteArray(body ?: ByteArray(0)))
        }
        val response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString(Charsets.UTF_8))
        TextHttpResponse(
            status = response.statusCode(),
            body = response.body(),
            headers = response.headers().map(),
        )
    }
}
