package com.reelhouse.music

import java.util.Base64

data class AppConfig(
    val port: Int,
    val appUrl: String,
    val publicBaseUrl: String?,
    val allowedOrigins: Set<String>,
    val supabaseUrl: String?,
    val supabaseAnonKey: String?,
    val supabaseServiceRoleKey: String?,
    val spotifyClientId: String?,
    val spotifyClientSecret: String?,
    val spotifyRedirectUri: String?,
    val spotifyImportRedirectPath: String,
    val tokenEncryptionKey: ByteArray?,
    val lrclibUserAgent: String,
    val lrclibAppId: String?,
    val lrclibApiKey: String?,
    val betterLyricsApiKey: String?,
    val lyricsPlusBaseUrls: List<String>,
    val musicBrainzUserAgent: String,
    val maxImportBytes: Long,
    val maxImportUncompressedBytes: Long,
    val maxJsonEntryBytes: Long,
    val maxImportEntries: Int,
    val httpTimeoutMs: Long,
    val poTokenProviderUrl: String = "http://127.0.0.1:4416",
    val poTokenProviderTimeoutMs: Long = 15_000L,
) {
    val supabaseConfigured: Boolean
        get() = !supabaseUrl.isNullOrBlank() &&
            !supabaseAnonKey.isNullOrBlank() &&
            !supabaseServiceRoleKey.isNullOrBlank()

    val spotifyConfigured: Boolean
        get() = !spotifyClientId.isNullOrBlank() &&
            !spotifyClientSecret.isNullOrBlank() &&
            !spotifyRedirectUri.isNullOrBlank() &&
            tokenEncryptionKey != null

    companion object {
        fun fromEnvironment(): AppConfig {
            val appUrl = env("REELHOUSE_APP_URL")?.trimEnd('/') ?: "http://localhost:3000"
            val origins = buildSet {
                add(appUrl)
                env("REELHOUSE_ALLOWED_ORIGINS")
                    ?.split(',')
                    ?.map(String::trim)
                    ?.map { it.trimEnd('/') }
                    ?.filter(String::isNotBlank)
                    ?.forEach(::add)
            }
            val encryptionKey = env("MUSIC_TOKEN_ENCRYPTION_KEY")?.let {
                runCatching { Base64.getDecoder().decode(it.trim()) }
                    .getOrNull()
                    ?.takeIf { bytes -> bytes.size == 32 }
            }
            return AppConfig(
                port = env("PORT")?.toIntOrNull() ?: 8080,
                appUrl = appUrl,
                publicBaseUrl = env("MUSIC_BACKEND_PUBLIC_URL")?.trimEnd('/'),
                allowedOrigins = origins,
                supabaseUrl = env("SUPABASE_URL") ?: env("NEXT_PUBLIC_SUPABASE_URL"),
                supabaseAnonKey = env("SUPABASE_ANON_KEY") ?: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
                supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY"),
                spotifyClientId = env("SPOTIFY_CLIENT_ID"),
                spotifyClientSecret = env("SPOTIFY_CLIENT_SECRET"),
                spotifyRedirectUri = env("SPOTIFY_REDIRECT_URI"),
                spotifyImportRedirectPath = env("SPOTIFY_CONNECT_REDIRECT_PATH") ?: "/music?spotify=connected",
                tokenEncryptionKey = encryptionKey,
                lrclibUserAgent = env("LRCLIB_USER_AGENT")
                    ?: "ReelhouseMusic/1.0 (https://reelhouse.app; music@reelhouse.app)",
                lrclibAppId = env("LRCLIB_APP_ID"),
                lrclibApiKey = env("LRCLIB_API_KEY"),
                betterLyricsApiKey = env("BETTERLYRICS_API_KEY"),
                lyricsPlusBaseUrls = (env("LYRICSPLUS_BASE_URL")?.let(::listOf)
                    ?: listOf(
                        "https://lyricsplus.prjktla.workers.dev",
                        "https://lyricsplus.atomix.one",
                        "https://lyricsplus.binimum.org",
                    )).map { it.trimEnd('/') },
                musicBrainzUserAgent = env("MUSICBRAINZ_USER_AGENT")
                    ?: env("REELHOUSE_MUSIC_USER_AGENT")
                    ?: "ReelhouseMusic/1.0 (https://reelhouse.app; music@reelhouse.app)",
                maxImportBytes = envLong("MUSIC_MAX_IMPORT_BYTES", 100L * 1024 * 1024),
                maxImportUncompressedBytes = envLong("MUSIC_MAX_IMPORT_UNCOMPRESSED_BYTES", 400L * 1024 * 1024),
                maxJsonEntryBytes = envLong("MUSIC_MAX_JSON_ENTRY_BYTES", 48L * 1024 * 1024),
                maxImportEntries = env("MUSIC_MAX_IMPORT_ENTRIES")?.toIntOrNull() ?: 20_000,
                httpTimeoutMs = env("MUSIC_HTTP_TIMEOUT_MS")?.toLongOrNull() ?: 12_000L,
                poTokenProviderUrl = env("PO_TOKEN_PROVIDER_URL") ?: "http://127.0.0.1:4416",
                poTokenProviderTimeoutMs = envLong("PO_TOKEN_PROVIDER_TIMEOUT_MS", 15_000L),
            )
        }

        private fun env(name: String): String? =
            System.getenv(name)?.trim()?.takeIf(String::isNotBlank)

        private fun envLong(name: String, fallback: Long): Long =
            env(name)?.toLongOrNull()?.takeIf { it > 0 } ?: fallback
    }
}
