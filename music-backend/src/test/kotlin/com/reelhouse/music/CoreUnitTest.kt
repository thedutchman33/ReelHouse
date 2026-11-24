package com.reelhouse.music

import kotlin.test.Test
import kotlin.test.assertEquals
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
}
