"use client";

import type {
  MusicBrowseCategory,
  MusicCollection,
  MusicTrack,
} from "@/lib/music/types";
import { colorFor, formatTrackCount, tracksForCategory } from "@/lib/music/utils";
import { useMusicPlayer } from "./MusicPlayerProvider";
import MusicTrackList from "./MusicTrackList";
import { CategoryCard, CollectionShelfCard, EmptyState, PlayCircle } from "./MusicUI";
import { MusicNoteIcon, PlayIcon, ShuffleIcon } from "./icons";
import MusicArtwork from "./MusicArtwork";

export default function CategoryView({
  category,
  allTracks,
  mixes,
  categories,
  onPlayTrack,
  onPlayCollection,
  onOpenCollection,
  onOpenCategory,
  onAddToPlaylist,
  onOpenArtist,
  onOpenAlbumTrack,
}: {
  category: MusicBrowseCategory;
  allTracks: MusicTrack[];
  mixes: MusicCollection[];
  categories: MusicBrowseCategory[];
  onPlayTrack: (track: MusicTrack, queue: MusicTrack[], label: string) => void;
  onPlayCollection: (collection: MusicCollection) => void;
  onOpenCollection: (collection: MusicCollection) => void;
  onOpenCategory: (id: string) => void;
  onAddToPlaylist: (track: MusicTrack) => void;
  onOpenArtist: (track: MusicTrack) => void;
  onOpenAlbumTrack: (track: MusicTrack) => void;
}) {
  const { currentTrack, isPlaying, playQueue } = useMusicPlayer();
  const tracks = tracksForCategory(allTracks, category);
  const categoryMixes = mixes.filter((mix) =>
    mix.title.toLowerCase().includes(category.title.toLowerCase().split(" ")[0])
  );
  const accent = category.color || colorFor(category.id);

  return (
    <div>
      <div
        className="relative min-h-[240px] overflow-hidden sm:min-h-[300px]"
        style={{ background: `linear-gradient(135deg, ${accent}, #121212 86%)` }}
      >
        <span
          className="pointer-events-none absolute -bottom-12 right-[-3%] h-[240px] w-[240px] rotate-[24deg] overflow-hidden rounded-md opacity-70 shadow-2xl sm:h-[310px] sm:w-[310px]"
          aria-hidden="true"
        >
          <MusicArtwork
            src={category.coverUrl}
            alt=""
            seed={category.id}
            rounded="rounded-md"
            className="h-full w-full"
            iconSize={40}
          />
        </span>
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent" />
        <div className="relative flex h-full min-h-[240px] flex-col justify-end px-4 pb-6 pt-16 sm:min-h-[300px] sm:px-6 md:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Genre</p>
          <h1 className="mt-2 text-[44px] font-black leading-none tracking-[-0.05em] text-white sm:text-[64px] lg:text-[84px]">
            {category.title}
          </h1>
          <p className="mt-3 text-[13px] text-white/60">
            {formatTrackCount(tracks.length)} in the open catalog
          </p>
        </div>
      </div>

      <div className="px-4 pb-12 pt-5 sm:px-6 md:px-8">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => playQueue(tracks, 0, category.title)}
            aria-label={`Play ${category.title}`}
            className="grid h-14 w-14 place-items-center rounded-full bg-[#1ed760] text-black shadow-lg transition hover:scale-105 hover:bg-[#3be477] disabled:opacity-40"
          >
            <PlayIcon size={22} />
          </button>
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => playQueue([...tracks].sort(() => Math.random() - 0.5), 0, category.title)}
            aria-label={`Shuffle ${category.title}`}
            className="text-white/55 transition hover:text-white disabled:opacity-35"
          >
            <ShuffleIcon size={24} />
          </button>
        </div>

        {tracks.length === 0 ? (
          <EmptyState
            icon={<MusicNoteIcon size={30} />}
            title="No tracks in this genre right now"
            copy="Discovery feeds rotate often. Browse another genre or search the catalog."
          />
        ) : (
          <>
            <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Popular in {category.title}</h2>
            <MusicTrackList
              tracks={tracks}
              onPlay={(track, index) => onPlayTrack(track, tracks, category.title)}
              showAlbum
              onAddToPlaylist={onAddToPlaylist}
              onGoToArtist={onOpenArtist}
              onGoToAlbum={onOpenAlbumTrack}
            />
          </>
        )}

        {categoryMixes.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Made for this mood</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {categoryMixes.map((mix) => (
                <CollectionShelfCard
                  key={mix.id}
                  collection={mix}
                  onOpen={() => onOpenCollection(mix)}
                  onPlay={() => onPlayCollection(mix)}
                  playing={Boolean(
                    isPlaying && currentTrack && mix.tracks.some((track) => track.id === currentTrack.id)
                  )}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] text-white">Browse something else</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {categories
              .filter((item) => item.id !== category.id)
              .slice(0, 12)
              .map((item) => (
                <CategoryCard
                  key={item.id}
                  category={item}
                  onClick={() => onOpenCategory(item.id)}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
