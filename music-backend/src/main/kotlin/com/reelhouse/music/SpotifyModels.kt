package com.reelhouse.music

import kotlinx.serialization.Serializable

@Serializable
data class SpotifyConnectionDto(
    val connected: Boolean,
    val spotifyUserId: String? = null,
    val displayName: String? = null,
    val country: String? = null,
    val product: String? = null,
    val scopes: List<String> = emptyList(),
    val connectedAt: String? = null,
)

@Serializable
data class SpotifyPlaylistSummaryDto(
    val id: String,
    val spotifyPlaylistId: String,
    val name: String,
    val description: String = "",
    val artworkUrl: String? = null,
    val ownerName: String? = null,
    val ownerId: String? = null,
    val trackCount: Int = 0,
    val isPublic: Boolean? = null,
    val isCollaborative: Boolean? = null,
    val snapshotId: String? = null,
    val lastSyncedAt: String? = null,
    val libraryPlaylistId: String? = null,
)

@Serializable
data class SpotifyCandidateDto(
    val track: MusicTrackDto,
    val confidence: Double,
    val status: String,
)

@Serializable
data class SpotifyTrackDto(
    val id: String,
    val spotifyTrackId: String,
    val spotifyUri: String? = null,
    val name: String,
    val artists: List<String> = emptyList(),
    val artistName: String,
    val albumName: String? = null,
    val artworkUrl: String? = null,
    val durationMs: Int = 0,
    val addedAt: String? = null,
    val position: Int? = null,
    val isLocal: Boolean = false,
    val isAvailable: Boolean = true,
    val matchStatus: String = "pending",
    val matchConfidence: Double? = null,
    val youtubeTrack: MusicTrackDto? = null,
    val candidates: List<SpotifyCandidateDto> = emptyList(),
) {
    val playable: Boolean get() = youtubeTrack != null && matchStatus in setOf("matched", "partial")
}

@Serializable
data class SpotifyPlaylistDto(
    val playlist: SpotifyPlaylistSummaryDto,
    val tracks: List<SpotifyTrackDto>,
    val pendingMatches: Int = 0,
    val matchStats: SpotifyMatchStatsDto = SpotifyMatchStatsDto(),
)

@Serializable
data class SpotifySavedPageDto(
    val tracks: List<SpotifyTrackDto>,
    val total: Int,
    val offset: Int,
    val limit: Int,
    val nextOffset: Int? = null,
    val pendingMatches: Int = 0,
    val matchStats: SpotifyMatchStatsDto = SpotifyMatchStatsDto(),
)

@Serializable
data class SpotifyMatchStatsDto(
    val matched: Int = 0,
    val partial: Int = 0,
    val unmatched: Int = 0,
    val unavailable: Int = 0,
    val pending: Int = 0,
    val total: Int = 0,
)

@Serializable
data class SpotifyLibraryDto(
    val playlists: List<SpotifyPlaylistSummaryDto>,
    val likedCount: Int = 0,
    val lastSyncAt: String? = null,
)

@Serializable
data class SpotifyManualMatchRequest(
    val track: MusicTrackDto,
)

@Serializable
data class SpotifyMatchBatchResultDto(
    val attempted: Int,
    val matched: Int,
    val partial: Int,
    val unmatched: Int,
    val unavailable: Int,
    val pending: Int,
)

@Serializable
data class SpotifyImportFileDto(
    val name: String,
    val kind: String,
    val parsed: Boolean,
    val detail: String? = null,
)

@Serializable
data class SpotifyImportPreviewDto(
    val files: List<SpotifyImportFileDto> = emptyList(),
    val playlists: Int = 0,
    val playlistTracks: Int = 0,
    val likedSongs: Int = 0,
    val albums: Int = 0,
    val artists: Int = 0,
    val listeningEvents: Int = 0,
    val historyStart: String? = null,
    val historyEnd: String? = null,
    val searches: Int = 0,
    val parsedFiles: Int = 0,
    val failedFiles: Int = 0,
    val archives: Int = 1,
    val hasExtendedHistory: Boolean = false,
    val hasAccountData: Boolean = false,
    val notes: List<String> = emptyList(),
)

@Serializable
data class SpotifyImportResultDto(
    val jobId: String,
    val status: String,
    val files: List<SpotifyImportFileDto> = emptyList(),
    val importedPlaylists: Int = 0,
    val importedPlaylistTracks: Int = 0,
    val importedLikedSongs: Int = 0,
    val importedAlbums: Int = 0,
    val importedArtists: Int = 0,
    val importedListeningEvents: Int = 0,
    val importedSearches: Int = 0,
    val duplicatesSkipped: Int = 0,
    val errors: List<String> = emptyList(),
    val stats: SpotifyMatchStatsDto? = null,
)

@Serializable
data class SpotifyStatsDto(
    val totalEvents: Int = 0,
    val totalMsPlayed: Long = 0,
    val uniqueTracks: Int = 0,
    val uniqueArtists: Int = 0,
    val topArtists: List<MusicArtistDto> = emptyList(),
    val topTracks: List<MusicTrackDto> = emptyList(),
    val topAlbums: List<MusicCollectionDto> = emptyList(),
    val topGenres: List<String> = emptyList(),
    val historyStart: String? = null,
    val historyEnd: String? = null,
    val recentlyPlayed: List<MusicTrackDto> = emptyList(),
    val importedSearches: List<String> = emptyList(),
    val computedAt: String? = null,
)

@Serializable
data class RecommendationSectionDto(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val tracks: List<MusicTrackDto> = emptyList(),
    val playlists: List<MusicCollectionDto> = emptyList(),
)

@Serializable
data class PersonalizedHomeDto(
    val sections: List<RecommendationSectionDto> = emptyList(),
    val stats: SpotifyStatsDto = SpotifyStatsDto(),
    val hasListeningData: Boolean = false,
)

@Serializable
data class TracklistMatchTrackDto(
    val title: String,
    val artist: String = "",
    val album: String? = null,
    val durationMs: Int = 0,
)

@Serializable
data class TracklistMatchRequestDto(
    val tracks: List<TracklistMatchTrackDto> = emptyList(),
)

@Serializable
data class TracklistMatchDto(
    val index: Int,
    val status: String,
    val confidence: Double,
    val track: MusicTrackDto? = null,
    val candidates: List<SpotifyCandidateDto> = emptyList(),
)

@Serializable
data class TracklistMatchResponseDto(
    val matches: List<TracklistMatchDto> = emptyList(),
)

data class SpotifyTrackData(
    val spotifyTrackId: String,
    val uri: String?,
    val name: String,
    val artists: List<String>,
    val albumName: String?,
    val artworkUrl: String?,
    val durationMs: Int,
    val addedAt: String?,
    val position: Int? = null,
    val isLocal: Boolean = false,
    val isAvailable: Boolean = true,
) {
    val artistName: String get() = artists.joinToString(", ")
}
