package com.reelhouse.music

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MusicTrackDto(
    val id: String,
    val provider: String,
    val providerId: String? = null,
    @SerialName("videoId") val videoId: String? = null,
    val title: String,
    val artistId: String,
    val artistName: String,
    val artistHandle: String? = null,
    val artistAvatarUrl: String? = null,
    val albumId: String? = null,
    val albumTitle: String? = null,
    val artworkUrl: String? = null,
    val duration: Int = 0,
    val genre: String? = null,
    val mood: String? = null,
    val playCount: Long? = null,
    val releaseDate: String? = null,
    val permalink: String? = null,
    val streamUrl: String? = null,
    val isStreamable: Boolean = true,
    val licenseUrl: String? = null,
    val externalUrl: String? = null,
    val source: String? = null,
    val matchStatus: String? = null,
    val matchConfidence: Double? = null,
    val musicBrainzId: String? = null,
)

@Serializable
data class MusicArtistDto(
    val id: String,
    val provider: String = "youtube",
    val providerId: String? = null,
    val name: String,
    val handle: String? = null,
    val avatarUrl: String? = null,
    val headerUrl: String? = null,
    val bio: String? = null,
    val verified: Boolean? = null,
    val followers: Long? = null,
    val trackCount: Int? = null,
    val externalUrl: String? = null,
)

@Serializable
data class MusicCollectionDto(
    val id: String,
    val provider: String = "youtube",
    val providerId: String? = null,
    val kind: String,
    val title: String,
    val description: String? = null,
    val artworkUrl: String? = null,
    val ownerName: String,
    val ownerId: String? = null,
    val trackCount: Int,
    val tracks: List<MusicTrackDto> = emptyList(),
    val accent: String? = null,
    val createdAt: String? = null,
    val isEditorial: Boolean? = null,
    val externalUrl: String? = null,
)

@Serializable
data class MusicBrowseCategoryDto(
    val id: String,
    val title: String,
    val color: String,
    val coverUrl: String? = null,
)

@Serializable
data class MusicHomeDto(
    val trending: List<MusicTrackDto>,
    val recommended: List<MusicTrackDto>,
    val underground: List<MusicTrackDto>,
    val latest: List<MusicTrackDto>,
    val artists: List<MusicArtistDto>,
    val categories: List<MusicBrowseCategoryDto>,
    val mixes: List<MusicCollectionDto>,
)

@Serializable
data class SearchPaginationDto(
    val offset: Int,
    val limit: Int,
    val hasMore: Boolean,
    val next: SearchNextDto? = null,
)

@Serializable
data class SearchNextDto(
    val offset: Int,
)

@Serializable
data class MusicSearchResultsDto(
    val tracks: List<MusicTrackDto>,
    val artists: List<MusicArtistDto>,
    val albums: List<MusicCollectionDto>,
    val playlists: List<MusicCollectionDto>,
    val pagination: SearchPaginationDto? = null,
    val providers: List<String> = listOf("youtube"),
)

@Serializable
data class MusicArtistDetailDto(
    val artist: MusicArtistDto,
    val topTracks: List<MusicTrackDto>,
    val albums: List<MusicCollectionDto>,
)

@Serializable
data class LyricsWordDto(val time: Double, val text: String)

@Serializable
data class LyricLineDto(
    val time: Double,
    val text: String,
    val words: List<LyricsWordDto> = emptyList(),
)

@Serializable
data class LyricsDto(
    val lines: List<LyricLineDto>,
    val plain: String? = null,
    val instrumental: Boolean = false,
    val source: String,
)

@Serializable
data class MusicBrainzEnrichmentDto(
    val recordingId: String? = null,
    val releaseId: String? = null,
    val releaseDate: String? = null,
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val isrcs: List<String> = emptyList(),
)

@Serializable
data class HealthDto(
    val status: String,
    val service: String = "reelhouse-music-backend",
    val innerTube: Boolean = true,
    val supabase: Boolean,
    val spotify: Boolean,
)

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail)

@Serializable
data class ApiErrorDetail(val code: String, val message: String)

data class AuthUser(val id: String, val email: String? = null)
