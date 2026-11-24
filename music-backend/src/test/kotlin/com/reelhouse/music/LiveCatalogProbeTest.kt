package com.reelhouse.music

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import kotlin.test.Test
import kotlin.test.assertTrue

@EnabledIfEnvironmentVariable(named = "MUSIC_LIVE_TESTS", matches = "true")
class LiveCatalogProbeTest {
    @Test
    fun catalogAndStream() = runBlocking {
        val service = YouTubeMusicService(AppConfig.fromEnvironment(), AppLogger())
        try {
            val result = service.search("Radiohead", 8, 0)
            println("SEARCH tracks=${result.tracks.size} artists=${result.artists.size} albums=${result.albums.size} playlists=${result.playlists.size} next=${result.pagination?.next}")
            println("FIRST TRACK " + result.tracks.firstOrNull())
            println("FIRST ARTIST " + result.artists.firstOrNull())
            assertTrue(result.tracks.isNotEmpty(), "songs should be returned")
            assertTrue(result.artists.isNotEmpty(), "artists should be returned")
            assertTrue(result.albums.isNotEmpty(), "albums should be returned")

            val artist = result.artists.first()
            val detail = service.artist(artist.id)
            println("ARTIST ${detail.artist.name} top=${detail.topTracks.size} albums=${detail.albums.size}")

            val album = result.albums.first()
            val collection = service.collection(album.id, "album")
            println("ALBUM ${collection.title} tracks=${collection.tracks.size} duration=${collection.tracks.firstOrNull()?.duration}")

            val track = result.tracks.first()
            val stream = service.stream(track.videoId!!)
            println("STREAM mime=${stream.mimeType} itag=${stream.itag} expires=${stream.expiresAt}")
            assertTrue(stream.url.startsWith("https://"))
        } finally {
            service.close()
        }
    }
}
