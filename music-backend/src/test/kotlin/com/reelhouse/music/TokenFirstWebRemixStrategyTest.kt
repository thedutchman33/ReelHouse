package com.reelhouse.music

import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.strategy.AuthenticationPolicy
import com.metrolist.innertubex.extraction.strategy.ClientContentCapabilities
import com.metrolist.innertubex.extraction.strategy.ClientFallbackStrategy
import com.metrolist.innertubex.extraction.strategy.ClientLifecycle
import com.metrolist.innertubex.extraction.strategy.ClientPoTokenCapabilities
import com.metrolist.innertubex.extraction.strategy.ClientRequestCapabilities
import com.metrolist.innertubex.extraction.strategy.ClientSelectionMode
import com.metrolist.innertubex.extraction.strategy.ClientSelectionRequest
import com.metrolist.innertubex.extraction.strategy.ClientSelectionResult
import com.metrolist.innertubex.extraction.strategy.JavaScriptRequirement
import com.metrolist.innertubex.extraction.strategy.PlaybackClientManifest
import com.metrolist.innertubex.extraction.strategy.PlaybackTransport
import com.metrolist.innertubex.extraction.strategy.PoTokenProviderKind
import com.metrolist.innertubex.extraction.strategy.PoTokenRequirement
import com.metrolist.innertubex.extraction.strategy.PoTokenRule
import com.metrolist.innertubex.extraction.strategy.SelectedClient
import com.metrolist.innertubex.models.PoTokenBinding
import com.metrolist.innertubex.models.YouTubeClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class TokenFirstWebRemixStrategyTest {
    @Test
    fun webRemixOverrideRequiresBothBindingsBeforeItsFirstRequest() {
        val manifest = webRemixManifest()
        val strategy = TokenFirstWebRemixStrategy(
            delegate = FixedStrategy(
                ClientSelectionResult(listOf(SelectedClient(YouTubeClient.WEB_REMIX, manifest))),
            ),
            logger = AppLogger(),
        )

        val selected = strategy.selectClients(request("WEB_REMIX")).candidates.single().manifest!!
        val player = selected.poTokens.player
        val streaming = selected.poTokens.gvs

        // These are the two bindings BgutilTokenProvider returns from one
        // getPoToken call. Requiring the player binding makes InnerTubeX take
        // its tokenized path before the first WEB_REMIX player request.
        assertEquals(PoTokenRequirement.REQUIRED, player.requirement)
        assertEquals(PoTokenBinding.VISITOR_DATA, player.binding)
        assertEquals(setOf(PoTokenProviderKind.WEB_BOTGUARD), player.providers)
        assertEquals(PoTokenRequirement.REQUIRED, streaming.requirement)
        assertEquals(PoTokenBinding.VIDEO_ID, streaming.binding)
        assertEquals(setOf(PoTokenProviderKind.WEB_BOTGUARD), streaming.providers)
    }

    @Test
    fun otherOverridesKeepTheUpstreamManifest() {
        val manifest = webRemixManifest()
        val strategy = TokenFirstWebRemixStrategy(
            delegate = FixedStrategy(
                ClientSelectionResult(listOf(SelectedClient(YouTubeClient.WEB_REMIX, manifest))),
            ),
            logger = AppLogger(),
        )

        val selected = strategy.selectClients(request("TVHTML5_SIMPLY")).candidates.single().manifest
        assertSame(manifest, selected)
        assertEquals(PoTokenRequirement.NONE, selected?.poTokens?.player?.requirement)
    }

    @Test
    fun rejectedAndUnrelatedCandidatesAreStable() {
        val manifest = webRemixManifest()
        val unrelated = SelectedClient(YouTubeClient.ANDROID_VR_NO_AUTH)
        val strategy = TokenFirstWebRemixStrategy(
            delegate = FixedStrategy(
                ClientSelectionResult(
                    candidates = listOf(SelectedClient(YouTubeClient.WEB_REMIX, manifest), unrelated),
                    rejected = emptyList(),
                ),
            ),
            logger = AppLogger(),
        )

        val selection = strategy.selectClients(request("WEB_REMIX"))
        assertEquals(2, selection.candidates.size)
        assertSame(unrelated, selection.candidates[1])
        assertEquals(PoTokenRequirement.REQUIRED, selection.candidates[0].manifest?.poTokens?.player?.requirement)
    }

    private fun request(overrideId: String) =
        ClientSelectionRequest(
            hints = ContentHints(playbackClientOverrideId = overrideId),
            authenticated = false,
            availablePoTokenProviders = setOf(PoTokenProviderKind.WEB_BOTGUARD),
            javaScriptRuntimeAvailable = true,
            webViewAvailable = false,
        )

    private fun webRemixManifest() =
        PlaybackClientManifest(
            id = "WEB_REMIX",
            displayName = "Web Remix",
            client = YouTubeClient.WEB_REMIX,
            lifecycle = ClientLifecycle.STABLE,
            selectionMode = ClientSelectionMode.AUTOMATIC,
            authentication = AuthenticationPolicy.OPTIONAL,
            transports = setOf(PlaybackTransport.DIRECT, PlaybackTransport.HLS),
            poTokens = ClientPoTokenCapabilities(
                player = PoTokenRule(),
                gvs = PoTokenRule(
                    requirement = PoTokenRequirement.REQUIRED,
                    binding = PoTokenBinding.VIDEO_ID,
                    providers = setOf(PoTokenProviderKind.WEB_BOTGUARD),
                ),
            ),
            request = ClientRequestCapabilities(
                signatureTimestamp = true,
                signatureCipher = JavaScriptRequirement.RESPONSE_DEPENDENT,
                nTransform = JavaScriptRequirement.RESPONSE_DEPENDENT,
                cookies = true,
            ),
            content = ClientContentCapabilities(),
            priority = 70,
        )

    private class FixedStrategy(
        private val selection: ClientSelectionResult,
    ) : ClientFallbackStrategy {
        override fun resolveClients(hints: ContentHints): List<YouTubeClient> =
            selection.candidates.map(SelectedClient::client)

        override fun selectClients(request: ClientSelectionRequest): ClientSelectionResult =
            selection
    }
}
