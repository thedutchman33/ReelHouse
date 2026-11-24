package com.reelhouse.music

import java.util.concurrent.CountDownLatch

fun main() {
    val config = AppConfig.fromEnvironment()
    val logger = AppLogger()
    val http = ExternalHttp(config.httpTimeoutMs)
    val auth = SupabaseAuth(config, http)
    val supabase = SupabaseRest(config, http)
    val youtube = YouTubeMusicService(config, logger)
    val lyrics = LyricsService(config, http, logger)
    val musicBrainz = MusicBrainzService(config, http, logger)
    val spotify = SpotifyService(config, http, supabase, logger)
    val matcher = SpotifyMatchingService(config, supabase, youtube, logger)
    val analytics = MusicAnalyticsService(config, supabase, youtube, musicBrainz, logger)
    val imports = SpotifyImportService(config, supabase, matcher, analytics, logger)

    val router = Router()
    MusicRoutes(
        config = config,
        youtube = youtube,
        lyrics = lyrics,
        musicBrainz = musicBrainz,
        analytics = analytics,
        spotify = spotify,
        matcher = matcher,
        imports = imports,
        auth = auth,
        http = http,
        logger = logger,
    ).install(router)
    router.get("/") {
        HttpResponse.json(
            mapOf(
                "service" to "reelhouse-music-backend",
                "status" to "ok",
                "health" to "/v1/health",
            ),
            cacheControl = "no-store",
        )
    }

    val server = ApiServer(config, router, logger)
    val shutdown = CountDownLatch(1)
    Runtime.getRuntime().addShutdownHook(
        Thread {
            logger.info("server_stopping")
            runCatching { server.stop() }
            runCatching { youtube.close() }
            shutdown.countDown()
        },
    )
    server.start()
    println(
        """{"time":"${java.time.Instant.now()}","level":"info","event":"service_ready","port":${config.port},"supabaseConfigured":${config.supabaseConfigured},"spotifyConfigured":${config.spotifyConfigured}}""",
    )
    shutdown.await()
}
