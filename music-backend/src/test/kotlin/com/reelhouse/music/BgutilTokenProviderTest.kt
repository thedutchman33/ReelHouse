package com.reelhouse.music

import com.metrolist.innertubex.extraction.strategy.PoTokenProviderKind
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BgutilTokenProviderTest {
    private val servers = mutableListOf<HttpServer>()

    @AfterTest
    fun stopServers() {
        servers.forEach { it.stop(0) }
        servers.clear()
    }

    @Test
    fun returnsVisitorBoundPlayerTokenAndVideoBoundStreamingToken() = runBlocking {
        val bindings = CopyOnWriteArrayList<String>()
        val server = startServer { exchange ->
            val binding = bindingFrom(exchange)
            bindings += binding
            respond(
                exchange,
                200,
                """{"poToken":"${if (binding.startsWith("visitor")) "player" else "video"}-token","contentBinding":"$binding","expiresAt":"${futureExpiry()}"}""",
            )
        }
        val provider = provider(server)
        val result = provider.getPoToken("NJAv_7lHUIU", "visitor-123", cookie = null)

        assertNotNull(result)
        assertEquals("player-token", result.playerRequestToken)
        assertEquals("video-token", result.streamingDataToken)
        assertEquals("visitor-123", result.visitorData)
        assertEquals(listOf("visitor-123", "NJAv_7lHUIU"), bindings)
        provider.close()
    }

    @Test
    fun cachesPlayerTokenPerVisitorAndVideoTokenPerVideo() = runBlocking {
        val bindings = CopyOnWriteArrayList<String>()
        val server = startServer { exchange ->
            val binding = bindingFrom(exchange)
            bindings += binding
            respond(exchange, 200, response(binding))
        }
        val provider = provider(server)

        provider.getPoToken("NJAv_7lHUIU", "visitor-123", null)
        provider.getPoToken("NJAv_7lHUIU", "visitor-123", null)
        provider.getPoToken("U8_MuWSnkCg", "visitor-123", null)

        assertEquals(listOf("visitor-123", "NJAv_7lHUIU", "U8_MuWSnkCg"), bindings)
        provider.close()
    }

    @Test
    fun rejectsATokenWhoseContentBindingDoesNotMatch() = runBlocking {
        val server = startServer { exchange ->
            bindingFrom(exchange)
            respond(
                exchange,
                200,
                """{"poToken":"token","contentBinding":"some-other-binding","expiresAt":"${futureExpiry()}"}""",
            )
        }
        val provider = provider(server)

        assertNull(provider.getPoToken("NJAv_7lHUIU", "visitor-123", null))
        provider.close()
    }

    @Test
    fun sidecarFailureReturnsNullAndDoesNotHammerTheProvider() = runBlocking {
        var requests = 0
        val server = startServer {
            requests += 1
            respond(it, 503, """{"error":"unavailable"}""")
        }
        val provider = provider(server)

        assertNull(provider.getPoToken("NJAv_7lHUIU", "visitor-123", null))
        assertNull(provider.getPoToken("NJAv_7lHUIU", "visitor-123", null))

        assertEquals(1, requests)
        provider.invalidateAttestation()
        assertNull(provider.getPoToken("NJAv_7lHUIU", "visitor-123", null))
        assertEquals(2, requests)
        provider.close()
    }

    @Test
    fun expiredSidecarTokenIsRejected() = runBlocking {
        val server = startServer { exchange ->
            val binding = bindingFrom(exchange)
            respond(
                exchange,
                200,
                """{"poToken":"token","contentBinding":"$binding","expiresAt":"2020-01-01T00:00:00Z"}""",
            )
        }
        val provider = provider(server)

        assertNull(provider.getPoToken("NJAv_7lHUIU", "visitor-123", null))
        provider.close()
    }

    @Test
    fun refusesANonLoopbackProviderUrl() {
        assertFailsWith<IllegalArgumentException> {
            BgutilTokenProvider("https://tokens.example.com", 2_000, AppLogger())
        }
    }

    @Test
    fun advertisesTheJvmWebBotguardCapability() = runBlocking {
        val server = startServer { respond(it, 200, "{}") }
        val provider = provider(server)

        assertTrue(PoTokenProviderKind.WEB_BOTGUARD in provider.capabilities.providers)
        assertEquals(false, provider.capabilities.usesWebView)
        provider.close()
    }

    private fun provider(server: HttpServer): BgutilTokenProvider =
        BgutilTokenProvider(
            providerUrl = "http://127.0.0.1:${server.address.port}",
            timeoutMs = 2_000,
            logger = AppLogger(),
        )

    private fun startServer(handler: (HttpExchange) -> Unit): HttpServer {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            try {
                handler(exchange)
            } finally {
                exchange.close()
            }
        }
        server.start()
        servers += server
        return server
    }

    private fun bindingFrom(exchange: HttpExchange): String {
        val body = exchange.requestBody.readAllBytes().decodeToString()
        return Regex("\"content_binding\"\\s*:\\s*\"([^\"]+)\"")
            .find(body)
            ?.groupValues
            ?.getOrNull(1)
            ?: error("missing content_binding")
    }

    private fun response(binding: String): String =
        """{"poToken":"token-$binding","contentBinding":"$binding","expiresAt":"${futureExpiry()}"}"""

    private fun futureExpiry(): String = Instant.now().plusSeconds(600).toString()

    private fun respond(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }
}
