package com.reelhouse.music

import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.strategy.ClientFallbackStrategy
import com.metrolist.innertubex.extraction.strategy.ClientSelectionRequest
import com.metrolist.innertubex.extraction.strategy.ClientSelectionResult
import com.metrolist.innertubex.extraction.strategy.ContentAwareFallbackStrategy
import com.metrolist.innertubex.extraction.strategy.PoTokenProviderKind
import com.metrolist.innertubex.extraction.strategy.PoTokenRequirement
import com.metrolist.innertubex.extraction.strategy.PoTokenRule
import com.metrolist.innertubex.models.PoTokenBinding
import com.metrolist.innertubex.models.YouTubeClient

/**
 * InnerTubeX's WEB_REMIX manifest only declares the video-bound GVS token as
 * required (PlaybackClientCatalog "WEB_REMIX"). PlayerClientDirector therefore
 * sends one untokenized WEB_REMIX request first and only mints tokens when that
 * response is playable or the content is uploaded/age-restricted
 * (PlayerClientDirector.kt "token fetch skipped"). On datacenter egress YouTube
 * rejects the untokenized request, so the director returns without ever calling
 * the sidecar and the request falls through to login-required legacy clients.
 *
 * WEB_REMIX also accepts the visitor-bound player token. Marking that binding
 * as required makes the director take its tokenized path first, so the provider
 * mints the visitor-bound player token and the video-bound streaming token
 * before the first WEB_REMIX request.
 */
internal class TokenFirstWebRemixStrategy(
    private val delegate: ClientFallbackStrategy = ContentAwareFallbackStrategy(),
    private val logger: AppLogger,
) : ClientFallbackStrategy {
    override fun resolveClients(hints: ContentHints): List<YouTubeClient> =
        delegate.resolveClients(hints)

    override fun selectClients(request: ClientSelectionRequest): ClientSelectionResult {
        val selection = delegate.selectClients(request)
        if (request.hints.playbackClientOverrideId != WEB_REMIX) return selection
        return selection.copy(
            candidates = selection.candidates.map { candidate ->
                val manifest = candidate.manifest
                if (manifest?.id != WEB_REMIX) return@map candidate
                logger.info(
                    "stream_token_policy",
                    mapOf(
                        "client" to WEB_REMIX,
                        "playerBinding" to PoTokenBinding.VISITOR_DATA.name,
                        "streamingBinding" to PoTokenBinding.VIDEO_ID.name,
                        "provider" to PoTokenProviderKind.WEB_BOTGUARD.name,
                        "reason" to "token_first",
                    ),
                )
                candidate.copy(
                    manifest = manifest.copy(
                        poTokens = manifest.poTokens.copy(
                            player = PoTokenRule(
                                requirement = PoTokenRequirement.REQUIRED,
                                binding = PoTokenBinding.VISITOR_DATA,
                                providers = setOf(PoTokenProviderKind.WEB_BOTGUARD),
                            ),
                        ),
                    ),
                )
            },
        )
    }

    private companion object {
        const val WEB_REMIX = "WEB_REMIX"
    }
}
