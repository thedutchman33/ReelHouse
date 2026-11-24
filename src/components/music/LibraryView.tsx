"use client";

import { useState } from "react";
import type {
  MusicArtist,
  MusicCollection,
  UserPlaylist,
} from "@/lib/music/types";
import { formatTrackCount } from "@/lib/music/utils";
import { useMusicPlayer } from "./MusicPlayerProvider";
import { useMusicLibrary } from "./MusicLibraryProvider";
import {
  ArtistShelfCard,
  CollectionShelfCard,
  EmptyState,
  ShelfCard,
} from "./MusicUI";
import { HeartIcon, LibraryIcon, MusicNoteIcon, PlusIcon } from "./icons";
import MusicArtwork from "./MusicArtwork";

type Filter = "all" | "playlists" | "albums" | "artists";

export default function LibraryView({
  onOpenLiked,
  onOpenPlaylist,
  onOpenCollection,
  onOpenArtist,
  onPlayCollection,
  onCreatePlaylist,
  onOpenSearch,
  onOpenSpotify,
}: {
  onOpenLiked: () => void;
  onOpenPlaylist: (playlist: UserPlaylist) => void;
  onOpenCollection: (collection: MusicCollection) => void;
  onOpenArtist: (artist: MusicArtist) => void;
  onPlayCollection: (collection: MusicCollection) => void;
  onCreatePlaylist: () => void;
  onOpenSearch: () => void;
  onOpenSpotify: () => void;
}) {
  const {
    playlists,
    likedTracks,
    savedAlbums,
    followedArtists,
    savedCollections,
  } = useMusicLibrary();
  const { currentTrack, isPlaying } = useMusicPlayer();
  const [filter, setFilter] = useState<Filter>("all");

  const collections = playlists.map((playlist) => ({
    kind: "playlist" as const,
    playlist,
    collection: {
      id: `user:${playlist.id}`,
      kind: "playlist" as const,
      title: playlist.title,
      description: playlist.description,
      artworkUrl: playlist.tracks[0]?.artworkUrl,
      ownerName: "You",
      trackCount: playlist.tracks.length,
      tracks: playlist.tracks,
      accent: playlist.accent,
    } satisfies MusicCollection,
  }));

  const nothing =
    playlists.length === 0 &&
    likedTracks.length === 0 &&
    savedAlbums.length === 0 &&
    followedArtists.length === 0 &&
    savedCollections.length === 0;

  const showPlaylists = filter === "all" || filter === "playlists";
  const showAlbums = filter === "all" || filter === "albums";
  const showArtists = filter === "all" || filter === "artists";

  return (
    <div className="px-4 pb-12 pt-4 sm:px-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">Collection</p>
          <h1 className="mt-1 text-[32px] font-bold tracking-[-0.035em] text-white">Your Library</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSpotify}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-xs font-bold text-white transition hover:border-white/50"
          >
            <MusicNoteIcon size={15} /> Spotify & imports
          </button>
          <button
            type="button"
            onClick={onCreatePlaylist}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-black transition hover:scale-105"
          >
            <PlusIcon size={15} /> Create playlist
          </button>
        </div>
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-2">
        {(["all", "playlists", "albums", "artists"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium capitalize transition ${
              filter === value
                ? "bg-white text-black"
                : "bg-white/[0.08] text-white/80 hover:bg-white/[0.13] hover:text-white"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {nothing ? (
        <EmptyState
          icon={<LibraryIcon size={34} />}
          title="Your Library is waiting"
          copy="Create a playlist, like a song, save an album or follow an artist and it will all live here across your devices."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onCreatePlaylist}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-105"
              >
                Create playlist
              </button>
              <button
                type="button"
                onClick={onOpenSearch}
                className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-bold text-white transition hover:border-white/45"
              >
                Find music
              </button>
            </div>
          }
        />
      ) : (
        <div className="space-y-10">
          {showPlaylists && (
            <section>
              <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Playlists</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                <button
                  type="button"
                  onClick={onOpenLiked}
                  className="music-card text-left"
                >
                  <span className="mb-3 block aspect-square w-full overflow-hidden rounded-md bg-gradient-to-br from-[#450af5] via-[#8e8ee5] to-[#c4efd9] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                    <span className="grid h-full w-full place-items-center text-white">
                      <HeartIcon size={44} filled />
                    </span>
                  </span>
                  <p className="truncate text-[15px] font-semibold text-white">Liked Songs</p>
                  <p className="mt-1 text-[13px] text-white/55">
                    {formatTrackCount(likedTracks.length)}
                  </p>
                </button>

                {collections.map(({ playlist, collection }) => (
                  <CollectionShelfCard
                    key={playlist.id}
                    collection={collection}
                    onOpen={() => onOpenPlaylist(playlist)}
                    onPlay={() => onPlayCollection(collection)}
                    playing={Boolean(isPlaying && currentTrack && playlist.tracks.some((track) => track.id === currentTrack.id))}
                  />
                ))}

                {savedCollections.map((collection) => (
                  <CollectionShelfCard
                    key={collection.id}
                    collection={collection}
                    onOpen={() => onOpenCollection(collection)}
                    onPlay={() => onPlayCollection(collection)}
                    playing={Boolean(isPlaying && currentTrack && collection.tracks.some((track) => track.id === currentTrack.id))}
                  />
                ))}

                <button
                  type="button"
                  onClick={onCreatePlaylist}
                  className="music-card flex aspect-auto min-h-[220px] flex-col items-center justify-center border border-dashed border-white/10 text-white/45 transition hover:border-white/30 hover:text-white"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[0.06]">
                    <PlusIcon size={24} />
                  </span>
                  <span className="mt-4 text-sm font-semibold">Create playlist</span>
                </button>
              </div>
            </section>
          )}

          {showAlbums && savedAlbums.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Albums</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {savedAlbums.map((album) => (
                  <CollectionShelfCard
                    key={album.id}
                    collection={album}
                    onOpen={() => onOpenCollection(album)}
                    onPlay={() => onPlayCollection(album)}
                    playing={false}
                  />
                ))}
              </div>
            </section>
          )}

          {showArtists && followedArtists.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Artists</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {followedArtists.map((artist) => (
                  <ArtistShelfCard
                    key={artist.id}
                    artist={artist}
                    onOpen={() => onOpenArtist(artist)}
                  />
                ))}
              </div>
            </section>
          )}

          {savedCollections.length === 0 && playlists.length === 0 && showPlaylists && (
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-5 py-4">
              <MusicNoteIcon size={18} className="shrink-0 text-[#1ed760]" />
              <p className="text-xs leading-relaxed text-white/45">
                Playlists you create and mixes you save from Reelhouse Music will appear here.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
