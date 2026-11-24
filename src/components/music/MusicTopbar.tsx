"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  MusicArtist,
  MusicBrowseCategory,
  MusicRoute,
  MusicTrack,
} from "@/lib/music/types";
import AuthStatus from "@/components/auth/AuthStatus";
import { toast } from "@/lib/toast";
import MusicArtwork from "./MusicArtwork";
import {
  CheckIcon,
  FriendsIcon,
  GridIcon,
  HomeIcon,
  LibraryIcon,
  MusicBrandMark,
  PlusIcon,
  SearchIcon,
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
      <button type="button" className="music-search-result-hit" onClick={onOpen}>
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
  searchTracks = [],
  searchArtists = [],
  searchCategories = [],
  likedTracks = [],
  onAddTrack,
  onOpenTrack,
}: {
  route: MusicRoute;
  onSearch: (query: string) => void;
  onHome: () => void;
  onOpenLibrary: () => void;
  searchTracks?: MusicTrack[];
  searchArtists?: MusicArtist[];
  searchCategories?: MusicBrowseCategory[];
  likedTracks?: MusicTrack[];
  onAddTrack?: (track: MusicTrack) => void;
  onOpenTrack?: (track: MusicTrack) => void;
}) {
  const [query, setQuery] = useState(route.kind === "search" ? route.query : "");
  const [open, setOpen] = useState(false);
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
  const results = useMemo(() => {
    if (!cleanQuery) return searchTracks.slice(0, 4);
    return searchTracks
      .filter((track) =>
        `${track.title} ${track.artistName} ${track.genre ?? ""}`.toLowerCase().includes(cleanQuery)
      )
      .slice(0, 6);
  }, [cleanQuery, searchTracks]);

  const suggestions = useMemo(() => {
    const values = [
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
    ];
    if (!cleanQuery) return values.slice(0, 4);

    const typed = query.trim();
    const labels = [typed, `${typed} song`];
    for (const track of searchTracks) {
      if (
        `${track.title} ${track.artistName}`.toLowerCase().includes(cleanQuery)
      ) {
        labels.push(track.title, track.artistName);
      }
    }
    for (const item of values) {
      if (item.label.toLowerCase().includes(cleanQuery)) labels.push(item.label);
    }

    const seen = new Set<string>();
    return labels
      .filter((label) => {
        const key = label.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4)
      .map((label, index) => {
        const match = values.find(
          (item) => item.label.toLowerCase() === label.toLowerCase()
        );
        return {
          id: `${match?.id ?? "query"}:${index}`,
          label,
          seed: match?.seed ?? `${typed}-${index}`,
          artworkUrl: match?.artworkUrl,
        };
      });
  }, [cleanQuery, query, searchArtists, searchCategories, searchTracks]);

  const likedIds = useMemo(() => new Set(likedTracks.map((track) => track.id)), [likedTracks]);

  function submitSearch(value: string) {
    const clean = value.trim();
    sentQueryRef.current = clean;
    setQuery(clean);
    setOpen(false);
    onSearch(clean);
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
                  <div className="music-search-suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="music-search-suggestion music-search-suggestion-query"
                        onClick={() => submitSearch(suggestion.label)}
                      >
                        <SearchIcon size={21} className="music-search-suggestion-icon" />
                        <span>{suggestion.label}</span>
                      </button>
                    ))}
                  </div>
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
                    <p className="music-search-empty">No songs match “{query.trim()}” yet.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="music-search-label">Recent searches</p>
                  <div className="music-search-suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
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
        <button
          type="button"
          className="music-global-icon"
          onClick={() => toast("Friend activity is not available on this deployment yet.")}
          aria-label="Friend activity"
          title="Friend activity"
        >
          <FriendsIcon size={20} />
        </button>
        <AuthStatus />
      </div>
    </header>
  );
}
