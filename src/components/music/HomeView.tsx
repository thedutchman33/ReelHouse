"use client";

import { useMemo, useState } from "react";
import type {
  MusicArtist,
  MusicCollection,
  MusicHomeData,
  MusicTrack,
} from "@/lib/music/types";
import {
  colorFor,
  dedupeTracks,
  formatTrackCount,
  makeMix,
} from "@/lib/music/utils";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import {
  ArtistShelfCard,
  CategoryCard,
  CollectionShelfCard,
  EmptyState,
  FeaturedCollectionCard,
  QuickPickTile,
  RecentArtworkCard,
  Shelf,
  ShelfSkeleton,
  TrackShelfCard,
} from "./MusicUI";
import { MusicNoteIcon as NoteIcon } from "./icons";
import MusicArtwork from "./MusicArtwork";
import { MusicPreferencesDialog } from "./MusicDialogs";

type HomeFilter = "all" | "music" | "podcasts" | "audiobooks";

interface QuickItem {
  id: string;
  title: string;
  artworkUrl?: string;
  seed: string;
  round?: boolean;
  liked?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
  playing: boolean;
}

function putArtworkFirst(tracks: MusicTrack[]): MusicTrack[] {
  const withArtwork = tracks.find((track) => track.artworkUrl);
  if (!withArtwork || tracks[0] === withArtwork) return tracks;
  return [withArtwork, ...tracks.filter((track) => track !== withArtwork)];
}

export default function HomeView({
  home,
  loading,
  error,
  onRetry,
  recentTracks,
  likedTracks,
  followedArtists,
  displayName,
  onPlayTrack,
  onOpenTrack,
  onOpenArtist,
  onOpenCollection,
  onPlayCollection,
  onOpenCategory,
  onOpenSearch,
  onCreatePlaylist,
  onOpenLiked,
  onOpenPlaylist,
}: {
  home: MusicHomeData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  recentTracks: MusicTrack[];
  likedTracks: MusicTrack[];
  followedArtists: MusicArtist[];
  displayName: string;
  onPlayTrack: (track: MusicTrack, queue: MusicTrack[], label: string) => void;
  onOpenTrack: (track: MusicTrack) => void;
  onOpenArtist: (artist: MusicArtist, tracks?: MusicTrack[]) => void;
  onOpenCollection: (collection: MusicCollection) => void;
  onPlayCollection: (collection: MusicCollection) => void;
  onOpenCategory: (categoryId: string) => void;
  onOpenSearch: (query?: string) => void;
  onCreatePlaylist: () => void;
  onOpenLiked: () => void;
  onOpenPlaylist: (id: string) => void;
}) {
  const { currentTrack, isPlaying, playQueue, toggle } = useMusicPlayer();
  const { playlists, savedCollections, favoriteGenres } = useMusicLibrary();
  const [filter, setFilter] = useState<HomeFilter>("all");
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const dailyMixes = useMemo(() => {
    if (!home) return [];
    const pool = dedupeTracks([
      ...home.trending,
      ...home.recommended,
      ...home.underground,
      ...home.latest,
    ]);
    if (pool.length === 0) return [];
    const first = makeMix(
      "daily-mix-1",
      "Daily Mix 1",
      "A daily blend of the tracks you keep coming back to.",
      putArtworkFirst(pool.filter((_, index) => index % 2 === 0).slice(0, 24)),
      "#1ed760"
    );
    const second = makeMix(
      "daily-mix-2",
      "Daily Mix 2",
      "More of what you like, mixed for right now.",
      putArtworkFirst(pool.filter((_, index) => index % 2 === 1).slice(0, 24)),
      "#8e8ee5"
    );
    return [first, second].filter((mix) => mix.tracks.length > 0);
  }, [home]);

  const playlistCollections = useMemo(
    () =>
      playlists.map(
        (playlist) =>
          ({
            id: `user:${playlist.id}`,
            kind: "playlist",
            title: playlist.title,
            description: playlist.description,
            artworkUrl: playlist.tracks[0]?.artworkUrl,
            ownerName: displayName,
            trackCount: playlist.tracks.length,
            tracks: playlist.tracks,
            accent: playlist.accent,
          }) satisfies MusicCollection
      ),
    [displayName, playlists]
  );

  if (loading && !home) {
    return (
      <div className="music-home">
        <div className="music-home-chips">
          {["All", "Music", "Podcasts", "Audiobooks"].map((label) => (
            <span key={label} className="music-home-chip">
              {label}
            </span>
          ))}
        </div>
        <div className="music-quick-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="music-skeleton music-quick-skeleton" />
          ))}
        </div>
        <div className="music-editorial-grid">
          <ShelfSkeleton cards={2} />
          <ShelfSkeleton cards={2} />
        </div>
      </div>
    );
  }

  if (error && !home) {
    return (
      <div className="music-home">
        <EmptyState
          icon={<NoteIcon size={34} />}
          title="The music catalog didn’t load"
          copy="The free catalog service may be briefly busy. Retry to pull the latest tracks."
          action={
            <button type="button" onClick={onRetry} className="music-white-button">
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (!home) return null;

  const allTracks = dedupeTracks([
    ...home.trending,
    ...home.recommended,
    ...home.underground,
    ...home.latest,
    ...recentTracks,
    ...likedTracks,
  ]);

  const isTrackPlaying = (track: MusicTrack) =>
    Boolean(isPlaying && currentTrack?.id === track.id);
  const isCollectionPlaying = (collection: MusicCollection) =>
    Boolean(
      isPlaying &&
        currentTrack &&
        collection.tracks.some((track) => track.id === currentTrack.id)
    );

  function playLiked() {
    if (!likedTracks.length) return;
    if (currentTrack && likedTracks.some((track) => track.id === currentTrack.id) && isPlaying) {
      toggle();
      return;
    }
    playQueue(likedTracks, 0, "Liked Songs");
  }

  const quickItems: QuickItem[] = [];
  quickItems.push({
    id: "liked",
    title: "Liked Songs",
    seed: "liked-songs",
    liked: true,
    onOpen: onOpenLiked,
    onPlay: likedTracks.length > 0 ? playLiked : undefined,
    playing: Boolean(
      isPlaying && currentTrack && likedTracks.some((track) => track.id === currentTrack.id)
    ),
  });
  for (const playlist of playlists) {
    const collection = playlistCollections.find((item) => item.id === `user:${playlist.id}`);
    if (!collection) continue;
    quickItems.push({
      id: collection.id,
      title: playlist.title,
      artworkUrl: playlist.tracks[0]?.artworkUrl,
      seed: playlist.id,
      onOpen: () => onOpenPlaylist(playlist.id),
      onPlay: () => onPlayCollection(collection),
      playing: isCollectionPlaying(collection),
    });
  }
  for (const collection of savedCollections) {
    quickItems.push({
      id: collection.id,
      title: collection.title,
      artworkUrl: collection.artworkUrl,
      seed: collection.id,
      onOpen: () => onOpenCollection(collection),
      onPlay: () => onPlayCollection(collection),
      playing: isCollectionPlaying(collection),
    });
  }
  for (const mix of [...home.mixes, ...dailyMixes]) {
    if (quickItems.some((item) => item.id === mix.id)) continue;
    quickItems.push({
      id: mix.id,
      title: mix.title,
      artworkUrl: mix.artworkUrl,
      seed: mix.id,
      onOpen: () => onOpenCollection(mix),
      onPlay: () => onPlayCollection(mix),
      playing: isCollectionPlaying(mix),
    });
  }
  const visibleQuickItems = quickItems.slice(0, 8);

  const featured: MusicCollection | null =
    home.mixes[0] ??
    playlistCollections.find((collection) => collection.tracks.length > 0) ??
    savedCollections.find((collection) => collection.tracks.length > 0) ??
    (home.trending.length
      ? makeMix(
          "mix-top-hits",
          "Today’s Top Hits",
          "The tracks everyone is playing in the open catalog right now.",
          home.trending.slice(0, 24),
          "#1ed760"
        )
      : null);

  const madeFor = [
    ...playlistCollections.filter((collection) => collection.tracks.length > 0),
    ...dailyMixes,
    ...home.mixes.slice(1),
    ...savedCollections,
  ]
    .filter(
      (collection, index, all) =>
        all.findIndex((item) => item.id === collection.id) === index &&
        collection.id !== featured?.id
    )
    .slice(0, 2);

  const recentItems = dedupeTracks([
    ...recentTracks,
    ...home.latest,
    ...home.trending,
  ]).slice(0, 6);
  const artists = [...followedArtists, ...home.artists].filter(
    (artist, index, all) => all.findIndex((item) => item.id === artist.id) === index
  );
  const topArtist = artists[0];
  const topArtistTracks = topArtist
    ? allTracks.filter((track) => track.artistId === topArtist.id).slice(0, 5)
    : [];

  function chips() {
    return (
      <div className="music-home-chips" role="tablist" aria-label="Home filters">
        {(
          [
            ["all", "All"],
            ["music", "Music"],
            ["podcasts", "Podcasts"],
            ["audiobooks", "Audiobooks"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            data-active={filter === value || undefined}
            className="music-home-chip"
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (filter === "podcasts" || filter === "audiobooks") {
    return (
      <div className="music-home">
        {chips()}
        <EmptyState
          icon={<NoteIcon size={34} />}
          title={filter === "podcasts" ? "Podcasts are not here yet" : "Audiobooks are not here yet"}
          copy="Reelhouse Music currently indexes the open music catalog. Switch back to All or Music."
          action={
            <button type="button" className="music-white-button" onClick={() => setFilter("all")}>
              Back to music
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="music-home">
      {chips()}

      <div className="music-quick-grid">
        {visibleQuickItems.length > 0 ? (
          visibleQuickItems.map((item) => (
            <QuickPickTile
              key={item.id}
              title={item.title}
              artworkUrl={item.artworkUrl}
              seed={item.seed}
              round={item.round}
              liked={item.liked}
              onOpen={item.onOpen}
              onPlay={item.onPlay}
              playing={item.playing}
            />
          ))
        ) : (
          <div className="music-home-welcome">
            <MusicArtwork seed="reelhouse-music" alt="" className="music-home-welcome-art" iconSize={28} />
            <div>
              <strong>Welcome to Reelhouse Music</strong>
              <span>Create a playlist or like a song and it will appear here.</span>
            </div>
            <button type="button" onClick={onCreatePlaylist}>
              Create playlist
            </button>
          </div>
        )}
      </div>

      <div className="music-editorial-grid">
        {featured && (
          <section className="music-editorial-section">
            <div className="music-section-head">
              <h2>Picked for you</h2>
            </div>
            <FeaturedCollectionCard
              title={featured.title}
              description={
                featured.description ||
                `${featured.ownerName} · ${formatTrackCount(featured.trackCount || featured.tracks.length)}`
              }
              artworkUrl={featured.artworkUrl}
              seed={featured.id}
              eyebrow={featured.kind === "mix" ? "Made for you" : featured.kind}
              onOpen={() => onOpenCollection(featured)}
              onPlay={() => onPlayCollection(featured)}
              playing={isCollectionPlaying(featured)}
            />
          </section>
        )}

        {madeFor.length > 0 && (
          <section className="music-editorial-section">
            <div className="music-section-head music-made-head">
              <div>
                <span className="music-eyebrow">Made For</span>
                <h2>{displayName}</h2>
              </div>
              <button type="button" className="music-show-all" onClick={() => onOpenSearch("")}>
                Show all
              </button>
            </div>
            <div className="music-made-grid">
              {madeFor.map((collection) => (
                <CollectionShelfCard
                  key={collection.id}
                  collection={collection}
                  onOpen={() => onOpenCollection(collection)}
                  onPlay={() => onPlayCollection(collection)}
                  playing={isCollectionPlaying(collection)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {recentItems.length > 0 && (
        <section className="music-recents-section">
          <div className="music-section-head">
            <h2>Recents</h2>
            <button type="button" className="music-show-all" onClick={() => onOpenSearch("")}>
              Show all
            </button>
          </div>
          <div className="music-recents-rail">
            {recentItems.map((track) => (
              <RecentArtworkCard
                key={track.id}
                title={track.title}
                artworkUrl={track.artworkUrl}
                seed={track.id}
                onOpen={() => onOpenTrack(track)}
                onPlay={() => {
                  if (isTrackPlaying(track)) toggle();
                  else onPlayTrack(track, recentItems, "Recently played");
                }}
                playing={isTrackPlaying(track)}
              />
            ))}
          </div>
        </section>
      )}

      <Shelf
        title="Trending now"
        action={
          <button type="button" className="music-show-all" onClick={() => onOpenSearch("trending")}>
            Show all
          </button>
        }
      >
        {home.trending.slice(0, 10).map((track) => (
          <TrackShelfCard
            key={track.id}
            track={track}
            onOpen={() => onOpenTrack(track)}
            onPlay={() =>
              onPlayTrack(
                track,
                home.trending.filter((item) => item.genre === track.genre).length > 1
                  ? home.trending.filter((item) => item.genre === track.genre)
                  : home.trending,
                "Trending now"
              )
            }
            playing={isTrackPlaying(track)}
          />
        ))}
      </Shelf>

      <Shelf
        title="Recommended for today"
        action={
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              className="music-show-all"
              onClick={() => setPreferencesOpen(true)}
              title="Choose genres for recommendations"
            >
              {favoriteGenres.length ? "Tuned" : "Tune"}
            </button>
            <button type="button" className="music-show-all" onClick={() => onOpenSearch("recommended")}>
              Show all
            </button>
          </div>
        }
      >
        {home.recommended.slice(0, 10).map((track) => (
          <TrackShelfCard
            key={track.id}
            track={track}
            onOpen={() => onOpenTrack(track)}
            onPlay={() => onPlayTrack(track, home.recommended, "Recommended for today")}
            playing={isTrackPlaying(track)}
          />
        ))}
      </Shelf>

      <Shelf
        title="Fresh releases"
        action={
          <button type="button" className="music-show-all" onClick={() => onOpenSearch("new music")}>
            Show all
          </button>
        }
      >
        {home.latest.slice(0, 10).map((track) => (
          <TrackShelfCard
            key={track.id}
            track={track}
            onOpen={() => onOpenTrack(track)}
            onPlay={() => onPlayTrack(track, home.latest, "Fresh releases")}
            playing={isTrackPlaying(track)}
          />
        ))}
      </Shelf>

      {artists.length > 0 && (
        <Shelf
          title="Artists to watch"
          action={
            <button type="button" className="music-show-all" onClick={() => onOpenSearch("artists")}>
              Show all
            </button>
          }
        >
          {artists.slice(0, 10).map((artist) => (
            <ArtistShelfCard
              key={artist.id}
              artist={artist}
              onOpen={() => onOpenArtist(artist)}
              onPlay={
                allTracks.some((track) => track.artistId === artist.id)
                  ? () =>
                      onPlayTrack(
                        allTracks.find((track) => track.artistId === artist.id)!,
                        allTracks.filter((track) => track.artistId === artist.id),
                        artist.name
                      )
                  : undefined
              }
            />
          ))}
        </Shelf>
      )}

      {topArtist && topArtistTracks.length > 0 && (
        <Shelf
          title={`Because you listened to ${topArtist.name}`}
          action={
            <button
              type="button"
              className="music-show-all"
              onClick={() => onOpenArtist(topArtist, topArtistTracks)}
            >
              Go to artist
            </button>
          }
        >
          {topArtistTracks.map((track) => (
            <TrackShelfCard
              key={track.id}
              track={track}
              onOpen={() => onOpenTrack(track)}
              onPlay={() => onPlayTrack(track, topArtistTracks, topArtist.name)}
              playing={isTrackPlaying(track)}
            />
          ))}
        </Shelf>
      )}

      <Shelf
        title="Underground picks"
        action={
          <button type="button" className="music-show-all" onClick={() => onOpenSearch("underground")}>
            Show all
          </button>
        }
      >
        {home.underground.slice(0, 10).map((track) => (
          <TrackShelfCard
            key={track.id}
            track={track}
            onOpen={() => onOpenTrack(track)}
            onPlay={() => onPlayTrack(track, home.underground, "Underground picks")}
            playing={isTrackPlaying(track)}
          />
        ))}
      </Shelf>

      <section className="music-browse-section">
        <div className="music-section-head">
          <h2>Browse all</h2>
        </div>
        <div className="music-browse-grid">
          {home.categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onClick={() => onOpenCategory(category.id)}
            />
          ))}
        </div>
      </section>

      {preferencesOpen && (
        <MusicPreferencesDialog onClose={() => setPreferencesOpen(false)} />
      )}
    </div>
  );
}
