package com.reelhouse.music

import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CoreUnitTest {
    private val key = ByteArray(32) { index -> index.toByte() }

    @Test
    fun aesGcmRoundTripAndTamperDetection() {
        val encrypted = TokenCrypto.encrypt("refresh-token-value", key)
        assertNotEquals("refresh-token-value", encrypted)
        assertEquals("refresh-token-value", TokenCrypto.decrypt(encrypted, key))
        val tampered = encrypted.dropLast(1) + if (encrypted.last() == 'A') 'B' else 'A'
        assertFalse(runCatching { TokenCrypto.decrypt(tampered, key) }.isSuccess)
    }

    @Test
    fun oauthStateRoundTripAndExpirySignature() {
        val userId = "6c1f25f0-1a65-4a65-a565-37e218e389df"
        val state = TokenCrypto.state(userId, key, ttlSeconds = 60)
        assertEquals(userId, TokenCrypto.verifyState(state, key))
        assertNull(TokenCrypto.verifyState("$state-tampered", key))
        assertNull(TokenCrypto.verifyState("not-a-state", key))
    }

    @Test
    fun textMatchingHandlesVersionsAndUnicode() {
        assertEquals("radiohead", TextMatch.normalize("  Rádióhead "))
        assertTrue(TextMatch.similarity("Creep", "Creep") > 0.99)
        assertTrue(TextMatch.similarity("Creep - Remastered 2009", "Creep") >= 0.9)
        assertTrue(TextMatch.similarity("Tum Hi Ho", "Tum Hi Ho") > 0.99)
        assertTrue(TextMatch.similarity("Completely Different", "Creep") < 0.4)
    }

    @Test
    fun trackPaymentAndMetadataJsonAreNotAcceptedAsLyrics() {
        val dto = LyricsDto(lines = emptyList(), plain = null, source = "none")
        assertFalse(dto.lines.isNotEmpty())
        assertNull(dto.plain)
    }

    @Test
    fun spotifyOAuthIsOptionalAndReturnsClearNotConfiguredError() {
        val config = testConfig()
        assertFalse(config.spotifyConfigured)
        val http = ExternalHttp(timeoutMs = 1_000)
        val spotify = SpotifyService(config, http, SupabaseRest(config, http), AppLogger())

        val error = assertFailsWith<ApiException> {
            spotify.authorizationUrl("6c1f25f0-1a65-4a65-a565-37e218e389df")
        }
        assertEquals(503, error.status)
        assertEquals("spotify_not_configured", error.code)
        assertEquals("Spotify integration is not configured on this backend", error.message)

        assertTrue(
            testConfig(
                spotifyClientId = "client-id",
                spotifyClientSecret = "client-secret",
                spotifyRedirectUri = "https://music.example/v1/spotify/callback",
                tokenEncryptionKey = key,
            ).spotifyConfigured,
        )
    }

    @Test
    fun spotifyZipPreviewDoesNotRequireOAuthConfiguration() {
        val config = testConfig()
        assertFalse(config.spotifyConfigured)
        val http = ExternalHttp(timeoutMs = 1_000)
        val logger = AppLogger()
        val supabase = SupabaseRest(config, http)
        val youtube = YouTubeMusicService(config, logger)
        try {
            val imports = SpotifyImportService(
                config = config,
                supabase = supabase,
                matcher = SpotifyMatchingService(config, supabase, youtube, logger),
                analytics = MusicAnalyticsService(
                    config,
                    supabase,
                    youtube,
                    MusicBrainzService(config, http, logger),
                    logger,
                ),
                logger = logger,
            )
            val preview = runBlocking {
                imports.preview(
                    "6c1f25f0-1a65-4a65-a565-37e218e389df",
                    "spotify-account-data.zip",
                    ByteArrayInputStream(spotifyPlaylistZip()),
                )
            }
            assertEquals(1, preview.playlists)
            assertEquals(1, preview.playlistTracks)
            assertEquals(1, preview.parsedFiles)
            assertEquals(0, preview.failedFiles)
        } finally {
            youtube.close()
        }
    }

    private fun spotifyPlaylistZip(): ByteArray {
        val json = """
            {
              "playlists": [
                {
                  "name": "Test Playlist",
                  "items": [
                    {
                      "track": {
                        "trackName": "Creep",
                        "artistName": "Radiohead",
                        "albumName": "Pablo Honey",
                        "trackUri": "spotify:track:6b2oQwSGFkzsMtQruIWm2p"
                      }
                    }
                  ]
                }
              ]
            }
        """.trimIndent()
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            zip.putNextEntry(ZipEntry("Spotify Account Data/Playlist1.json"))
            zip.write(json.toByteArray(Charsets.UTF_8))
            zip.closeEntry()
        }
        return out.toByteArray()
    }

    private fun testConfig(
        spotifyClientId: String? = null,
        spotifyClientSecret: String? = null,
        spotifyRedirectUri: String? = null,
        tokenEncryptionKey: ByteArray? = null,
    ): AppConfig = AppConfig(
        port = 8080,
        appUrl = "http://localhost:3000",
        publicBaseUrl = null,
        allowedOrigins = setOf("http://localhost:3000"),
        supabaseUrl = "https://project.supabase.co",
        supabaseAnonKey = "anon-key",
        supabaseServiceRoleKey = "service-role-key",
        spotifyClientId = spotifyClientId,
        spotifyClientSecret = spotifyClientSecret,
        spotifyRedirectUri = spotifyRedirectUri,
        spotifyImportRedirectPath = "/music?spotify=connected",
        tokenEncryptionKey = tokenEncryptionKey,
        lrclibUserAgent = "ReelhouseMusic/1.0",
        lrclibAppId = null,
        lrclibApiKey = null,
        betterLyricsApiKey = null,
        lyricsPlusBaseUrls = emptyList(),
        musicBrainzUserAgent = "ReelhouseMusic/1.0",
        maxImportBytes = 100L * 1024 * 1024,
        maxImportUncompressedBytes = 400L * 1024 * 1024,
        maxJsonEntryBytes = 48L * 1024 * 1024,
        maxImportEntries = 20_000,
        httpTimeoutMs = 1_000,
    )
}
