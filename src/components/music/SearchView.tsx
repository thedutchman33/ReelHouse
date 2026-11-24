"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MusicArtist,
  MusicBrowseCategory,
  MusicCollection,
  MusicSearchResults,
  MusicTrack,
} from "@/lib/music/types";
import { useMusicPlayer } from "./MusicPlayerProvider";
import MusicTrackList from "./MusicTrackList";
import {
  ArtistShelfCard,
  CategoryCard,
  CollectionShelfCard,
  EmptyState,
  PlayCircle,
  Shelf,
  ShelfSkeleton,
} from "./MusicUI";
import { MusicNoteIcon, SearchIcon } from "./icons";
import MusicArtwork from "./MusicArtwork";
import { mergeSearchResults } from "@/lib/music/search-merge";

type SearchFilter = "all" | "songs" | "artists" | "albums" | "playlists";

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "playlists", label: "Playlists" },
];

export default function SearchView({
  initialQuery,
  categories,
  onPlayTrack,
  onPlayCollection,
  onOpenArtist,
  onOpenCollection,
  onOpenCategory,
  onAddToPlaylist,
}: {
  initialQuery: string;
  categories: MusicBrowseCategory[];
  onPlayTrack: (track: MusicTrack, queue: MusicTrack[], label: string) => void;
  onPlayCollection: (collection: MusicCollection) => void;
  onOpenArtist: (artist: MusicArtist, tracks?: MusicTrack[]) => void;
  onOpenCollection: (collection: MusicCollection) => void;
  onOpenCategory: (id: string) => void;
  onAddToPlaylist: (track: MusicTrack) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<MusicSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const { currentTrack, isPlaying, toggle } = useMusicPlayer();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const clean = query.trim();
    loadMoreControllerRef.current?.abort();
    setLoadingMore(false);
    setMoreError(null);
    if (clean.length < 2) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/music/search?q=${encodeURIComponent(clean)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search unavailable");
          return (await response.json()) as MusicSearchResults;
        })
        .then((results) => {
          setData(results);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setError("Search is temporarily unavailable. Try again in a moment.");
          setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    return () => loadMoreControllerRef.current?.abort();
  }, []);

  async function loadMore() {
    const clean = query.trim();
    const next = data?.pagination?.next;
    if (!clean || !next || loadingMore) return;

    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setMoreError(null);

    const nextOffset = next.offset ?? next.jamendoOffset;
    const params = new URLSearchParams({
      q: clean,
      limit: String(data?.pagination?.limit ?? 10),
      offset: String(nextOffset),
    });

    try {
      const response = await fetch(`/api/music/search?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Search unavailable");
      const results = (await response.json()) as MusicSearchResults;
      setData((current) => mergeSearchResults(current, results));
      setLoadingMore(false);
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setMoreError("Couldn’t load more results. Try again.");
      setLoadingMore(false);
    }
  }

  const hasResults = Boolean(
    data &&
      (data.tracks.length ||
        data.artists.length ||
        data.albums.length ||
        data.playlists.length)
  );
  const top = useMemo(() => {
    if (!data) return null;
    if (data.artists[0]) return { kind: "artist" as const, artist: data.artists[0] };
    if (data.tracks[0]) return { kind: "track" as const, track: data.tracks[0] };
    return null;
  }, [data]);

  if (query.trim().length < 2) {
    return (
      <div className="music-search-page">
        <h1 className="music-search-title">Browse all</h1>
        <div className="music-search-categories">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onClick={() => onOpenCategory(category.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  const emptyForFilter =
    filter === "songs"
      ? data?.tracks.length === 0
      : filter === "artists"
        ? data?.artists.length === 0
        : filter === "albums"
          ? data?.albums.length === 0
          : filter === "playlists"
            ? data?.playlists.length === 0
            : false;

  return (
    <div className="music-search-page">
      <div className="music-search-filters" role="group" aria-label="Search filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            data-active={filter === item.id || undefined}
            className="music-search-filter"
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="music-search-loading">
          <ShelfSkeleton cards={4} />
          <ShelfSkeleton cards={4} />
        </div>
      ) : error ? (
        <EmptyState icon={<MusicNoteIcon size={30} />} title="Search hit a snag" copy={error} />
      ) : !hasResults || !data ? (
        <EmptyState
          icon={<SearchIcon size={30} />}
          title={`No results for “${query.trim()}”`}
          copy="Check the spelling or try a broader artist, album or genre."
        />
      ) : (
        <div className="music-search-results">
          {filter === "all" && top && (
            <div className="music-search-top">
              <section className="music-search-block">
                <h2>Top result</h2>
                {top.kind === "artist" ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenArtist(top.artist)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenArtist(top.artist);
                      }
                    }}
                    className="music-search-top-card"
                  >
                    <MusicArtwork
                      src={top.artist.avatarUrl}
                      alt={top.artist.name}
                      seed={top.artist.id}
                      rounded="rounded-full"
                      className="music-search-top-art"
                      iconSize={26}
                    />
                    <div className="music-search-top-copy">
                      <h3>{top.artist.name}</h3>
                      <p>
                        <span>Artist</span>
                        {top.artist.verified && (
                          <span className="music-search-verified">Verified artist</span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onPlayTrack(top.track, data.tracks, "Search results")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPlayTrack(top.track, data.tracks, "Search results");
                      }
                    }}
                    className="music-search-top-card"
                  >
                    <MusicArtwork
                      src={top.track.artworkUrl}
                      alt={top.track.title}
                      seed={top.track.id}
                      rounded="rounded-sm"
                      className="music-search-top-art"
                      iconSize={26}
                      fallbackArtist={top.track.artistName}
                      fallbackAlbum={top.track.albumTitle ?? top.track.title}
                    />
                    <div className="music-search-top-copy">
                      <h3>{top.track.title}</h3>
                      <p>
                        <span>Song</span>
                        <span className="music-search-dot">•</span>
                        <span>{top.track.artistName}</span>
                      </p>
                    </div>
                    <PlayCircle
                      size={48}
                      label={`Play ${top.track.title}`}
                      playing={Boolean(isPlaying && currentTrack?.id === top.track.id)}
                      onClick={() => {
                        if (currentTrack?.id === top.track.id) toggle();
                        else onPlayTrack(top.track, data.tracks, "Search results");
                      }}
                    />
                  </div>
                )}
              </section>

              {data.tracks.length > 0 && (
                <section className="music-search-block music-search-songs">
                  <div className="music-search-block-head">
                    <h2>Songs</h2>
                    {data.tracks.length > 4 && (
                      <button type="button" onClick={() => setFilter("songs")}>
                        Show all
                      </button>
                    )}
                  </div>
                  <MusicTrackList
                    tracks={data.tracks.slice(0, 4)}
                    onPlay={(track, index) =>
                      onPlayTrack(track, data.tracks, "Search results")
                    }
                    showAlbum={false}
                    compact
                    onAddToPlaylist={onAddToPlaylist}
                    onGoToArtist={(track) =>
                      onOpenArtist({
                        id: track.artistId,
                        name: track.artistName,
                        avatarUrl: track.artistAvatarUrl,
                      })
                    }
                  />
                </section>
              )}
            </div>
          )}

          {filter === "songs" && data.tracks.length > 0 && (
            <section className="music-search-section">
              <div className="music-search-section-head">
                <h2>Songs</h2>
              </div>
              <MusicTrackList
                tracks={data.tracks}
                onPlay={(track) => onPlayTrack(track, data.tracks, "Search results")}
                showAlbum={false}
                compact
                onAddToPlaylist={onAddToPlaylist}
                onGoToArtist={(track) =>
                  onOpenArtist({
                    id: track.artistId,
                    name: track.artistName,
                    avatarUrl: track.artistAvatarUrl,
                  })
                }
              />
            </section>
          )}

          {(filter === "all" || filter === "artists") && data.artists.length > 0 && (
            <Shelf title="Artists">
              {data.artists.map((artist) => (
                <ArtistShelfCard
                  key={artist.id}
                  artist={artist}
                  onOpen={() => onOpenArtist(artist)}
                />
              ))}
            </Shelf>
          )}

          {(filter === "all" || filter === "albums") && data.albums.length > 0 && (
            <Shelf title="Albums">
              {data.albums.map((album) => (
                <CollectionShelfCard
                  key={album.id}
                  collection={album}
                  onOpen={() => onOpenCollection(album)}
                  onPlay={() => onPlayCollection(album)}
                  playing={false}
                />
              ))}
            </Shelf>
          )}

          {(filter === "all" || filter === "playlists") && data.playlists.length > 0 && (
            <Shelf title="Playlists">
              {data.playlists.map((playlist) => (
                <CollectionShelfCard
                  key={playlist.id}
                  collection={playlist}
                  onOpen={() => onOpenCollection(playlist)}
                  onPlay={() => onPlayCollection(playlist)}
                  playing={false}
                />
              ))}
            </Shelf>
          )}

          {emptyForFilter && (
            <EmptyState
              icon={<SearchIcon size={30} />}
              title={`No ${filter} for “${query.trim()}”`}
              copy="Try another filter or a broader search."
            />
          )}

          {data.pagination?.next && (
            <div className="music-search-more">
              <button
                type="button"
                className="music-white-button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="music-spin h-4 w-4 rounded-full border-2 border-black/25 border-t-black"
                    />
                    Loading
                  </>
                ) : (
                  "Load more"
                )}
              </button>
              {moreError && (
                <p className="music-search-more-error" role="alert">
                  {moreError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
