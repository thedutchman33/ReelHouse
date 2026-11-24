"use client";

import { useEffect, useState } from "react";
import type { MusicArtist, MusicArtistDetail, MusicCollection, MusicTrack } from "@/lib/music/types";
import { dedupeTracks, formatPlayCount, formatTrackCount } from "@/lib/music/utils";
import { catalogLabelForArtist } from "@/lib/music/providers";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import MusicTrackList from "./MusicTrackList";
import {
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  ShuffleIcon,
  VerifiedIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";
import { CollectionShelfCard, EmptyState } from "./MusicUI";

export default function ArtistView({
  artist,
  initialTracks = [],
  onPlayTracks,
  onOpenCollection,
  onOpenAlbumTrack,
  onAddToPlaylist,
}: {
  artist: MusicArtist;
  initialTracks?: MusicTrack[];
  onPlayTracks: (tracks: MusicTrack[], startIndex: number, label: string) => void;
  onOpenCollection: (collection: MusicCollection) => void;
  onOpenAlbumTrack: (track: MusicTrack) => void;
  onAddToPlaylist: (track: MusicTrack) => void;
}) {
  const [detail, setDetail] = useState<MusicArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { isArtistFollowed, toggleFollowArtist } = useMusicLibrary();
  const { currentTrack, isPlaying, playQueue, toggle } = useMusicPlayer();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(`/api/music/artist?id=${encodeURIComponent(artist.id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Artist unavailable");
        return (await response.json()) as MusicArtistDetail;
      })
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [artist.id]);

  const shownArtist = detail?.artist ?? artist;
  const topTracks = dedupeTracks([...(detail?.topTracks ?? []), ...initialTracks]).slice(0, 10);
  const albums = detail?.albums ?? [];
  const followed = isArtistFollowed(shownArtist.id);
  const artistTracksPlaying =
    isPlaying && currentTrack && topTracks.some((track) => track.id === currentTrack.id);
  const header = shownArtist.headerUrl || shownArtist.avatarUrl;

  return (
    <div>
      <div
        className="relative min-h-[260px] overflow-hidden bg-[#282828] sm:min-h-[330px]"
        style={{
          backgroundImage: header
            ? `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(18,18,18,0.92)), url("${header}")`
            : `linear-gradient(135deg, ${shownArtist.avatarUrl ? "#1f3a2f" : "#25402f"}, #121212)`,
          backgroundSize: "cover",
          backgroundPosition: "center 28%",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-4 pb-6 sm:flex-row sm:items-end sm:px-6 md:px-8">
          <MusicArtwork
            src={shownArtist.avatarUrl}
            alt={shownArtist.name}
            seed={shownArtist.id}
            rounded="rounded-full"
            className="h-28 w-28 shrink-0 border border-white/10 shadow-2xl sm:h-36 sm:w-36"
            iconSize={30}
          />
          <div className="min-w-0 pb-1">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
              <VerifiedIcon size={16} className="text-[#3d91f4]" /> {shownArtist.verified ? "Verified artist" : "Artist"}
            </span>
            <h1 className="mt-2 line-clamp-2 text-[42px] font-black leading-[0.92] tracking-[-0.05em] text-white sm:text-[64px] lg:text-[76px]">
              {shownArtist.name}
            </h1>
            <p className="mt-3 text-[13px] text-white/65">
              {shownArtist.followers
                ? `${shownArtist.followers.toLocaleString("en-US")} followers`
                : `Independent artist on ${catalogLabelForArtist(shownArtist)}`}
              {shownArtist.trackCount ? ` · ${formatTrackCount(shownArtist.trackCount)}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-12 pt-5 sm:px-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            aria-label={artistTracksPlaying ? `Pause ${shownArtist.name}` : `Play ${shownArtist.name}`}
            disabled={topTracks.length === 0}
            onClick={() => {
              if (artistTracksPlaying) toggle();
              else playQueue(topTracks, 0, shownArtist.name);
            }}
            className="grid h-14 w-14 place-items-center rounded-full bg-[#1ed760] text-black shadow-lg transition hover:scale-105 hover:bg-[#3be477] disabled:opacity-40"
          >
            {artistTracksPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button
            type="button"
            aria-label={`Shuffle ${shownArtist.name}`}
            title="Shuffle play"
            disabled={topTracks.length === 0}
            onClick={() => playQueue([...topTracks].sort(() => Math.random() - 0.5), 0, shownArtist.name)}
            className="text-white/55 transition hover:text-white disabled:opacity-35"
          >
            <ShuffleIcon size={24} />
          </button>
          <button
            type="button"
            onClick={() => toggleFollowArtist(shownArtist)}
            className={`rounded-full border px-5 py-2 text-[13px] font-bold transition ${
              followed
                ? "border-[#1ed760] text-[#1ed760] hover:bg-[#1ed760]/10"
                : "border-white/25 text-white hover:border-white/60"
            }`}
          >
            {followed ? "Following" : "Follow"}
          </button>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
          <section>
            <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Popular</h2>
            {loading && topTracks.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="music-skeleton h-14 rounded" />
                ))}
              </div>
            ) : topTracks.length === 0 ? (
              <EmptyState
                icon={<MusicNoteIcon size={28} />}
                title={error ? "Couldn’t load this artist" : "No tracks published yet"}
                copy={
                  error
                    ? "The artist profile or tracks could not be fetched. Try opening another result."
                    : "This artist does not have any playable tracks in the catalog."
                }
              />
            ) : (
              <MusicTrackList
                tracks={topTracks.slice(0, 5)}
                onPlay={(track, index) => playQueue(topTracks, index, shownArtist.name)}
                showAlbum
                compact
                onAddToPlaylist={onAddToPlaylist}
                onGoToArtist={() => undefined}
                onGoToAlbum={onOpenAlbumTrack}
              />
            )}
          </section>

          <section className="rounded-lg bg-white/[0.035] p-5">
            <h2 className="text-lg font-bold text-white">About</h2>
            {shownArtist.bio ? (
              <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-white/55">
                {shownArtist.bio.slice(0, 1200)}
              </p>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-white/45">
                Independent artist in the open {catalogLabelForArtist(shownArtist)} catalog.
              </p>
            )}
            <div className="mt-5 space-y-2 text-[12px] text-white/45">
              {shownArtist.followers != null && (
                <p>{formatPlayCount(shownArtist.followers).replace("plays", "followers")}</p>
              )}
              {shownArtist.trackCount != null && <p>{formatTrackCount(shownArtist.trackCount)}</p>}
              {shownArtist.handle && <p className="text-white/30">@{shownArtist.handle}</p>}
            </div>
          </section>
        </div>

        {albums.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Discography</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {albums.map((album) => (
                <CollectionShelfCard
                  key={album.id}
                  collection={album}
                  onOpen={() => onOpenCollection(album)}
                  onPlay={() => onOpenCollection(album)}
                  playing={false}
                />
              ))}
            </div>
          </section>
        )}

        <p className="mt-10 text-[11px] leading-relaxed text-white/30">
          Artist profile, artwork and catalog by {catalogLabelForArtist(shownArtist)} · Reelhouse Music
        </p>
      </div>
    </div>
  );
}
