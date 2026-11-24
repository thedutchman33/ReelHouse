package com.reelhouse.music

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object TokenCrypto {
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val decoder = Base64.getUrlDecoder()
    private const val VERSION = "v1"

    fun encrypt(value: String, key: ByteArray): String {
        require(key.size == 32) { "Token encryption key must be 32 bytes" }
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val encrypted = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return "$VERSION:${encoder.encodeToString(iv + encrypted)}"
    }

    fun decrypt(value: String, key: ByteArray): String {
        require(key.size == 32) { "Token encryption key must be 32 bytes" }
        val parts = value.split(':', limit = 2)
        if (parts.size != 2 || parts[0] != VERSION) throw IllegalArgumentException("Unsupported ciphertext version")
        val bytes = decoder.decode(parts[1])
        if (bytes.size < 13) throw IllegalArgumentException("Invalid ciphertext")
        val iv = bytes.copyOfRange(0, 12)
        val encrypted = bytes.copyOfRange(12, bytes.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return cipher.doFinal(encrypted).toString(StandardCharsets.UTF_8)
    }

    fun randomToken(bytes: Int = 32): String =
        encoder.encodeToString(ByteArray(bytes).also(random::nextBytes))

    fun state(userId: String, key: ByteArray, ttlSeconds: Long = 600): String {
        val expiresAt = System.currentTimeMillis() / 1000 + ttlSeconds
        val payload = "$userId|$expiresAt|${randomToken(12)}"
        val encoded = encoder.encodeToString(payload.toByteArray(StandardCharsets.UTF_8))
        return "$encoded.${hmac(encoded, key)}"
    }

    fun verifyState(state: String, key: ByteArray): String? {
        val parts = state.split('.', limit = 2)
        if (parts.size != 2) return null
        val expected = hmac(parts[0], key)
        if (!MessageDigest.isEqual(expected.toByteArray(), parts[1].toByteArray())) return null
        val payload = runCatching { decoder.decode(parts[0]).toString(StandardCharsets.UTF_8) }.getOrNull() ?: return null
        val fields = payload.split('|')
        if (fields.size != 3) return null
        val expiresAt = fields[1].toLongOrNull() ?: return null
        if (expiresAt < System.currentTimeMillis() / 1000) return null
        return fields[0].takeIf { UUID_PATTERN.matches(it) }
    }

    private fun hmac(value: String, key: ByteArray): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return encoder.encodeToString(mac.doFinal(value.toByteArray(StandardCharsets.UTF_8)))
    }

    private val UUID_PATTERN =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
}
