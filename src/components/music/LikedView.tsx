"use client";

import { useState } from "react";
import type { MusicTrack } from "@/lib/music/types";
import {
  collectionDuration,
  formatTotalDuration,
  formatTrackCount,
} from "@/lib/music/utils";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import MusicTrackList from "./MusicTrackList";
import { HeartIcon, MusicNoteIcon, PlayIcon, SearchIcon, ShuffleIcon } from "./icons";
import { EmptyState } from "./MusicUI";

export default function LikedView({
  onOpenAlbum,
  onOpenArtist,
  onAddToPlaylist,
  onFindMusic,
}: {
  onOpenAlbum: (track: MusicTrack) => void;
  onOpenArtist: (track: MusicTrack) => void;
  onAddToPlaylist: (track: MusicTrack) => void;
  onFindMusic: () => void;
}) {
  const { likedTracks } = useMusicLibrary();
  const { playQueue, currentTrack, isPlaying } = useMusicPlayer();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "artist">("recent");

  const filtered = likedTracks
    .filter((track) =>
      [track.title, track.artistName, track.albumTitle]
        .some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))
    )
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "artist") return a.artistName.localeCompare(b.artistName);
      return 0;
    });

  const totalDuration = collectionDuration(likedTracks);
  const isCollectionPlaying = Boolean(
    isPlaying && currentTrack && likedTracks.some((track) => track.id === currentTrack.id)
  );

  return (
    <div>
      <div className="music-hero" style={{ background: "linear-gradient(135deg, #4c1d95 0%, #1d4ed8 52%, #132f5c 100%)" }}>
        <div className="music-hero-wash" />
        <div className="relative flex flex-col gap-5 px-4 pb-6 pt-12 sm:flex-row sm:items-end sm:px-6 sm:pt-16 md:px-8">
          <div className="grid h-32 w-32 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#450af5] via-[#8e8ee5] to-[#c4efd9] text-white shadow-[0_16px_60px_rgba(0,0,0,0.5)] sm:h-52 sm:w-52">
            <HeartIcon size={56} filled />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Playlist</p>
            <h1 className="mt-2 text-[40px] font-black leading-[0.92] tracking-[-0.05em] text-white sm:text-[64px] lg:text-[80px]">
              Liked Songs
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-white/70">
              <span className="font-semibold text-white">You</span>
              <span>·</span>
              <span>{formatTrackCount(likedTracks.length)}</span>
              {likedTracks.length > 0 && (
                <>
                  <span>·</span>
                  <span>{formatTotalDuration(totalDuration)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="relative px-4 pb-12 pt-5 sm:px-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => (isCollectionPlaying ? undefined : playQueue(likedTracks, 0, "Liked Songs"))}
            disabled={likedTracks.length === 0}
            aria-label="Play Liked Songs"
            className="grid h-14 w-14 place-items-center rounded-full bg-[#1ed760] text-black shadow-lg transition hover:scale-105 hover:bg-[#3be477] disabled:opacity-40"
          >
            <PlayIcon size={22} />
          </button>
          <button
            type="button"
            onClick={() => {
              const shuffled = [...likedTracks].sort(() => Math.random() - 0.5);
              playQueue(shuffled, 0, "Liked Songs");
            }}
            disabled={likedTracks.length === 0}
            aria-label="Shuffle Liked Songs"
            className="text-white/55 transition hover:text-white disabled:opacity-35"
          >
            <ShuffleIcon size={24} />
          </button>
          <div className="relative ml-1 flex-1 sm:max-w-[280px]">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search in Liked Songs"
              className="h-9 w-full rounded-md bg-white/[0.06] pl-9 pr-3 text-[13px] text-white outline-none transition placeholder:text-white/35 focus:bg-white/[0.1]"
            />
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            aria-label="Sort liked songs"
            className="h-9 rounded-md bg-white/[0.06] px-3 text-[12px] text-white/70 outline-none"
          >
            <option value="recent">Recently liked</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
          </select>
        </div>

        {likedTracks.length === 0 ? (
          <EmptyState
            icon={<HeartIcon size={34} />}
            title="Songs you like will appear here"
            copy="Tap the heart on any track. Your likes sync to your Reelhouse account."
            action={
              <button
                type="button"
                onClick={onFindMusic}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-105"
              >
                <MusicNoteIcon size={16} /> Find music
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <p className="px-2 py-12 text-center text-sm text-white/45">
            No liked songs match “{search}”.
          </p>
        ) : (
          <MusicTrackList
            tracks={filtered}
            onPlay={(track, index) => playQueue(filtered, index, "Liked Songs")}
            showAlbum
            showDateAdded
            addedLabel="Liked"
            onAddToPlaylist={onAddToPlaylist}
            onGoToArtist={onOpenArtist}
            onGoToAlbum={onOpenAlbum}
          />
        )}
      </div>
    </div>
  );
}
