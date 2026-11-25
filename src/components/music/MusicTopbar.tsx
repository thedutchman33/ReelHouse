"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  MusicArtist,
  MusicBrowseCategory,
  MusicCollection,
  MusicRoute,
  MusicTrack,
} from "@/lib/music/types";
import AuthStatus from "@/components/auth/AuthStatus";
import MusicArtwork from "./MusicArtwork";
import {
  CheckIcon,
  GridIcon,
  HomeIcon,
  LibraryIcon,
  MusicBrandMark,
  PlusIcon,
  SearchIcon,
  SpotifyIcon,
  XIcon,
} from "./icons";

function SearchTrackRow({
  track,
  liked,
  onOpen,
  onAdd,
}: {
  track: MusicTrack;
  liked: boolean;
  onOpen: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="music-search-result">
      <button
        type="button"
        className="music-search-result-hit"
        data-search-option
        onClick={onOpen}
      >
        <MusicArtwork
          seed={track.id}
          alt=""
          src={track.artworkUrl}
          className="music-search-result-art"
          iconSize={18}
        />
        <span className="music-search-result-copy">
          <strong>{track.title}</strong>
          <span>{track.artistName}</span>
        </span>
      </button>
      {onAdd && (
        <button
          type="button"
          className="music-search-result-add"
          data-liked={liked || undefined}
          aria-label={`${liked ? "Saved" : "Add"} ${track.title}`}
          title={liked ? "Saved to Liked Songs" : "Add to playlist"}
          onClick={onAdd}
        >
          {liked ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
        </button>
      )}
    </div>
  );
}

export default function MusicTopbar({
  route,
  onSearch,
  onHome,
  onOpenLibrary,
  onOpenSpotify,
  searchTracks = [],
  searchArtists = [],
  searchCategories = [],
  likedTracks = [],
  onAddTrack,
  onOpenTrack,
  onOpenArtist,
  onOpenCollection,
}: {
  route: MusicRoute;
  onSearch: (query: string) => void;
  onHome: () => void;
  onOpenLibrary: () => void;
  onOpenSpotify?: () => void;
  searchTracks?: MusicTrack[];
  searchArtists?: MusicArtist[];
  searchCategories?: MusicBrowseCategory[];
  likedTracks?: MusicTrack[];
  onAddTrack?: (track: MusicTrack) => void;
  onOpenTrack?: (track: MusicTrack) => void;
  onOpenArtist?: (artist: MusicArtist) => void;
  onOpenCollection?: (collection: MusicCollection) => void;
}) {
  const [query, setQuery] = useState(route.kind === "search" ? route.query : "");
  const [open, setOpen] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [liveResults, setLiveResults] = useState<{
    tracks: MusicTrack[];
    artists: MusicArtist[];
    albums: MusicCollection[];
    playlists: MusicCollection[];
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const sentQueryRef = useRef(route.kind === "search" ? route.query : "");
  const searchRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const next = route.kind === "search" ? route.query : "";
    if (next === sentQueryRef.current) return;
    sentQueryRef.current = next;
    setQuery(next);
  }, [route]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const cleanQuery = query.trim().toLowerCase();
  const localResults = useMemo(() => {
    if (!cleanQuery) return [];
    return searchTracks
      .filter((track) =>
        `${track.title} ${track.artistName} ${track.genre ?? ""}`.toLowerCase().includes(cleanQuery)
      )
      .slice(0, 6);
  }, [cleanQuery, searchTracks]);
  const results = liveResults?.tracks?.length ? liveResults.tracks.slice(0, 6) : localResults;

  const browseItems = useMemo(
    () =>
      [
        ...searchArtists.map((artist) => ({
          id: `artist:${artist.id}`,
          label: artist.name,
          seed: artist.id,
          artworkUrl: artist.avatarUrl,
        })),
        ...searchCategories.map((category) => ({
          id: `category:${category.id}`,
          label: category.title,
          seed: category.id,
          artworkUrl: undefined,
        })),
      ].slice(0, 4),
    [searchArtists, searchCategories]
  );

  // Real catalog suggestions and results, debounced and cancelled when the
  // query changes. Nothing is synthesized from the local library alone.
  useEffect(() => {
    if (!open) return;
    const clean = query.trim();
    if (clean.length < 2) {
      setLiveSuggestions([]);
      setLiveResults(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void Promise.all([
        fetch(`/api/music/suggestions?q=${encodeURIComponent(clean)}`, {
          signal: controller.signal,
        })
          .then(async (response) =>
            response.ok
              ? ((await response.json()) as { suggestions?: string[] })
              : null
          )
          .catch(() => null),
        fetch(`/api/music/search?q=${encodeURIComponent(clean)}&limit=6`, {
          signal: controller.signal,
        })
          .then(async (response) =>
            response.ok
              ? ((await response.json()) as {
                  tracks?: MusicTrack[];
                  artists?: MusicArtist[];
                  albums?: MusicCollection[];
                  playlists?: MusicCollection[];
                })
              : null
          )
          .catch(() => null),
      ]).then(([suggestions, search]) => {
        if (controller.signal.aborted) return;
        setLiveSuggestions(
          Array.isArray(suggestions?.suggestions)
            ? suggestions.suggestions.slice(0, 5)
            : []
        );
        setLiveResults(
          search
            ? {
                tracks: Array.isArray(search.tracks) ? search.tracks : [],
                artists: Array.isArray(search.artists) ? search.artists : [],
                albums: Array.isArray(search.albums) ? search.albums : [],
                playlists: Array.isArray(search.playlists) ? search.playlists : [],
              }
            : null
        );
        setSearching(false);
      });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const likedIds = useMemo(() => new Set(likedTracks.map((track) => track.id)), [likedTracks]);

  function submitSearch(value: string) {
    const clean = value.trim();
    sentQueryRef.current = clean;
    setQuery(clean);
    setOpen(false);
    onSearch(clean);
  }

  function handleSearchKeys(event: React.KeyboardEvent<HTMLFormElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      searchRef.current?.querySelectorAll<HTMLButtonElement>("[data-search-option]") ?? []
    ).filter((item) => item.offsetParent !== null);
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      index === -1
        ? event.key === "ArrowDown"
          ? 0
          : items.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <header className="music-global-header">
      <div className="music-global-left">
        <Link href="/music" className="music-global-logo" aria-label="Reelhouse Music home">
          <MusicBrandMark size={32} />
        </Link>
        <button
          type="button"
          className="music-mobile-library"
          onClick={onOpenLibrary}
          aria-label="Open Your Library"
          title="Your Library"
        >
          <LibraryIcon size={20} />
        </button>
      </div>

      <div className="music-global-center">
        <button
          type="button"
          onClick={onHome}
          className="music-home-button"
          data-active={route.kind === "home" || undefined}
          aria-label="Home"
          title="Home"
        >
          <HomeIcon size={25} filled={route.kind === "home"} />
        </button>

        <form
          ref={searchRef}
          role="search"
          className="music-global-search"
          onKeyDown={handleSearchKeys}
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(query);
          }}
        >
          <SearchIcon size={21} className="music-global-search-icon" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.slice(0, 100));
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="What do you want to play?"
            aria-label="Search Reelhouse Music"
            aria-expanded={open}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              className="music-search-clear"
              onClick={() => {
                setQuery("");
                sentQueryRef.current = "";
                setOpen(true);
                if (route.kind === "search") onSearch("");
              }}
            >
              <XIcon size={16} />
            </button>
          )}
          <span className="music-search-divider" aria-hidden="true" />
          <button
            type="submit"
            className="music-search-browse"
            aria-label="Search the catalog"
            title="Browse"
          >
            <GridIcon size={21} />
          </button>

          {open && (
            <div className="music-search-pop" role="dialog" aria-label="Search suggestions">
              {cleanQuery ? (
                <>
                  <div className="music-search-nav-hint">
                    <span>
                      <kbd>↑</kbd>
                      <kbd>↓</kbd>
                      Navigate
                    </span>
                    <span>
                      <kbd>Enter</kbd>
                      Search
                    </span>
                  </div>
                  {liveSuggestions.length > 0 && (
                    <div className="music-search-suggestions">
                      {liveSuggestions.map((label) => (
                        <button
                          key={label}
                          type="button"
                          data-search-option
                          className="music-search-suggestion music-search-suggestion-query"
                          onClick={() => submitSearch(label)}
                        >
                          <SearchIcon size={21} className="music-search-suggestion-icon" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {liveSuggestions.length === 0 && searching && (
                    <p className="music-search-label">Searching YouTube Music…</p>
                  )}
                  {results.length > 0 ? (
                    <div className="music-search-results music-search-query-results">
                      {results.map((track) => (
                        <SearchTrackRow
                          key={track.id}
                          track={track}
                          liked={likedIds.has(track.id)}
                          onOpen={() => {
                            setOpen(false);
                            onOpenTrack?.(track);
                          }}
                          onAdd={onAddTrack ? () => onAddTrack(track) : undefined}
                        />
                      ))}
                    </div>
                  ) : (
                    !searching && (
                      <p className="music-search-empty">
                        No songs match “{query.trim()}” yet.
                      </p>
                    )
                  )}
                  {liveResults &&
                    (liveResults.artists.length > 0 ||
                      liveResults.albums.length > 0 ||
                      liveResults.playlists.length > 0) && (
                      <div className="music-search-results music-search-query-results">
                        {liveResults.artists.slice(0, 2).map((artist) => (
                          <button
                            key={artist.id}
                            type="button"
                            data-search-option
                            className="music-search-result"
                            onClick={() => {
                              setOpen(false);
                              onOpenArtist?.(artist);
                            }}
                          >
                            <MusicArtwork
                              seed={artist.id}
                              alt=""
                              src={artist.avatarUrl}
                              rounded="rounded-full"
                              className="music-search-result-art"
                              iconSize={18}
                            />
                            <span className="music-search-result-copy">
                              <strong>{artist.name}</strong>
                              <span>Artist</span>
                            </span>
                          </button>
                        ))}
                        {[
                          ...liveResults.albums.slice(0, 2),
                          ...liveResults.playlists.slice(0, 2),
                        ].map((collection) => (
                          <button
                            key={`${collection.kind}:${collection.id}`}
                            type="button"
                            data-search-option
                            className="music-search-result"
                            onClick={() => {
                              setOpen(false);
                              onOpenCollection?.(collection);
                            }}
                          >
                            <MusicArtwork
                              seed={collection.id}
                              alt=""
                              src={collection.artworkUrl}
                              className="music-search-result-art"
                              iconSize={18}
                            />
                            <span className="music-search-result-copy">
                              <strong>{collection.title}</strong>
                              <span>
                                {collection.kind === "album" ? "Album" : "Playlist"}
                                {collection.ownerName ? ` · ${collection.ownerName}` : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                </>
              ) : (
                <>
                  {browseItems.length > 0 && (
                    <>
                      <p className="music-search-label">Browse</p>
                      <div className="music-search-suggestions">
                        {browseItems.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            data-search-option
                            className="music-search-suggestion"
                            onClick={() => submitSearch(suggestion.label)}
                          >
                            <MusicArtwork
                              seed={suggestion.seed}
                              alt=""
                              src={suggestion.artworkUrl}
                              className="music-search-suggestion-art"
                              iconSize={16}
                            />
                            <span>{suggestion.label}</span>
                            <SearchIcon size={16} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {searchTracks.length > 0 && (
                    <>
                      <p className="music-search-label music-search-label-songs">Songs for you</p>
                      <div className="music-search-results">
                        {searchTracks.slice(0, 4).map((track) => (
                          <SearchTrackRow
                            key={track.id}
                            track={track}
                            liked={likedIds.has(track.id)}
                            onOpen={() => {
                              setOpen(false);
                              onOpenTrack?.(track);
                            }}
                            onAdd={onAddTrack ? () => onAddTrack(track) : undefined}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </form>
      </div>

      <div className="music-global-actions">
        <Link href="/" className="music-back-pill">
          Back to Reelhouse
        </Link>
        {onOpenSpotify && (
          <button
            type="button"
            className="music-global-icon music-global-spotify"
            onClick={onOpenSpotify}
            aria-label="Spotify integration and playlist import"
            title="Spotify — connect or import playlists"
          >
            <SpotifyIcon size={20} />
          </button>
        )}
        <AuthStatus />
      </div>
    </header>
  );
}
