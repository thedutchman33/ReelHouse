package com.reelhouse.music

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PlayerWireDiagnosticsTest {
    @Test
    fun reportsPlayableAudioCountsWithoutLeakingUrlsOrTokens() {
        val summary =
            summarizePlayerWireResponse(
                httpStatus = 200,
                body =
                    """
                    {
                      "playabilityStatus": {"status": "OK"},
                      "videoDetails": {"videoId": "OUilrtigWGg"},
                      "streamingData": {
                        "adaptiveFormats": [
                          {"mimeType": "audio/mp4", "url": "https://rr.googlevideo.com/videoplayback?pot=secret"},
                          {"mimeType": "audio/webm", "signatureCipher": "s=secret&pot=secret"}
                        ],
                        "formats": [],
                        "hlsManifestUrl": "https://manifest.googlevideo.com/api/manifest/hls?token=secret"
                      }
                    }
                    """.trimIndent(),
            )

        assertEquals(200, summary["httpStatus"])
        assertEquals("OK", summary["playabilityStatus"])
        assertEquals("OUilrtigWGg", summary["videoId"])
        assertEquals(true, summary["streamingPresent"])
        assertEquals(2, summary["formatCount"])
        assertEquals(2, summary["audioFormatCount"])
        assertEquals(1, summary["audioDirectCount"])
        assertEquals(1, summary["audioCipherCount"])
        assertEquals(true, summary["hlsPresent"])

        val rendered = summary.toString()
        assertFalse(rendered.contains("secret"), rendered)
        assertFalse(rendered.contains("googlevideo"), rendered)
        assertFalse(rendered.contains("https://"), rendered)
    }

    @Test
    fun reportsPlayabilityRejectionAndRedactsReason() {
        val summary =
            summarizePlayerWireResponse(
                httpStatus = 200,
                body =
                    """
                    {
                      "playabilityStatus": {
                        "status": "LOGIN_REQUIRED",
                        "reason": "Sign in to confirm you're not a bot (visitorData=secret)"
                      },
                      "streamingData": {}
                    }
                    """.trimIndent(),
            )

        assertEquals("LOGIN_REQUIRED", summary["playabilityStatus"])
        val reason = summary["playabilityReason"] as String
        assertTrue(reason.contains("Sign in to confirm"), reason)
        assertFalse(reason.contains("secret"), reason)
        assertEquals(0, summary["formatCount"])
        assertEquals(0, summary["audioFormatCount"])
    }

    @Test
    fun distinguishesSabrOnlyResponseWithNoDirectAudio() {
        val summary =
            summarizePlayerWireResponse(
                httpStatus = 200,
                body =
                    """
                    {
                      "playabilityStatus": {"status": "OK"},
                      "streamingData": {
                        "serverAbrStreamingUrl": "https://rr.googlevideo.com/videoplayback?pot=secret"
                      }
                    }
                    """.trimIndent(),
            )

        assertEquals("OK", summary["playabilityStatus"])
        assertEquals(0, summary["formatCount"])
        assertEquals(0, summary["audioFormatCount"])
        assertEquals(0, summary["audioDirectCount"])
        assertEquals(false, summary["hlsPresent"])
        assertEquals(true, summary["sabrPresent"])
    }

    @Test
    fun reportsNonJsonBodyWithoutLoggingIt() {
        val summary = summarizePlayerWireResponse(403, "<html>request blocked</html>")

        assertEquals(403, summary["httpStatus"])
        assertEquals("invalid_json", summary["parse"])
        assertFalse(summary.toString().contains("request blocked"))
    }

    @Test
    fun reportsEmptyBody() {
        val summary = summarizePlayerWireResponse(204, " ")

        assertEquals("empty_body", summary["parse"])
    }

    @Test
    fun sanitizesSensitiveReasonDetails() {
        assertEquals("token=<redacted>", sanitizePlayerWireDetail("token=secret"))
        assertEquals("visitorData=<redacted>", sanitizePlayerWireDetail("visitorData=secret"))
        assertEquals("poToken=<redacted>", sanitizePlayerWireDetail("poToken=secret"))
    }
}
