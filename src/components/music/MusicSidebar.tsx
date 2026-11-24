"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MusicRoute } from "@/lib/music/types";
import { formatTrackCount } from "@/lib/music/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import {
  ChevronDownIcon,
  CheckIcon,
  HeartIcon,
  LibraryIcon,
  MusicNoteIcon,
  PanelLeftIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  XIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";

type LibraryFilter = "playlists" | "artists" | "albums" | "podcasts";
type LibrarySort = "recents" | "recently-added" | "alphabetical";

interface LibraryEntry {
  id: string;
  title: string;
  subtitle: string;
  artworkUrl?: string;
  seed: string;
  round: boolean;
  active: boolean;
  contextPlaying: boolean;
  route: MusicRoute;
  pinned: boolean;
  sortAt: string;
}

export default function MusicSidebar({
  route,
  onNavigate,
  onCreatePlaylist,
  onClose,
  onToggle,
  collapsed = false,
}: {
  route: MusicRoute;
  onNavigate: (route: MusicRoute) => void;
  onCreatePlaylist: () => void;
  onClose?: () => void;
  onToggle?: () => void;
  collapsed?: boolean;
}) {
  const { user } = useAuth();
  const {
    playlists,
    likedTracks,
    savedAlbums,
    followedArtists,
    savedCollections,
  } = useMusicLibrary();
  const { isPlaying, contextLabel } = useMusicPlayer();
  const [filters, setFilters] = useState<LibraryFilter[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("recents");
  const [sortOpen, setSortOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen && !createOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) setSortOpen(false);
      if (createRef.current && !createRef.current.contains(event.target as Node)) setCreateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSortOpen(false);
        setCreateOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen, createOpen]);

  function go(next: MusicRoute) {
    onNavigate(next);
    onClose?.();
  }

  function toggleFilter(filter: LibraryFilter) {
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter]
    );
  }

  const libraryEntries = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    const matches = (title: string) => !query || title.toLowerCase().includes(query);
    const showPlaylists = filters.length === 0 || filters.includes("playlists");
    const showAlbums = filters.length === 0 || filters.includes("albums");
    const showArtists = filters.length === 0 || filters.includes("artists");
    const owner = user?.email?.split("@")[0] || "You";
    const list: LibraryEntry[] = [];

    if (showPlaylists && matches("Liked Songs")) {
      list.push({
        id: "liked",
        title: "Liked Songs",
        subtitle: `Playlist · ${formatTrackCount(likedTracks.length)}`,
        seed: "liked-songs",
        round: false,
        active: route.kind === "liked",
        contextPlaying: isPlaying && contextLabel === "Liked Songs",
        route: { kind: "liked" },
        pinned: true,
        sortAt: "9999",
      });
    }

    if (showPlaylists) {
      for (const playlist of playlists.filter((item) => matches(item.title))) {
        list.push({
          id: `playlist-${playlist.id}`,
          title: playlist.title,
          subtitle: `Playlist · ${owner}`,
          artworkUrl: playlist.tracks[0]?.artworkUrl,
          seed: playlist.id,
          round: false,
          active: route.kind === "playlist" && route.id === playlist.id,
          contextPlaying: isPlaying && contextLabel === playlist.title,
          route: { kind: "playlist", id: playlist.id },
          pinned: true,
          sortAt: playlist.updatedAt,
        });
      }
      for (const collection of savedCollections.filter((item) => matches(item.title))) {
        list.push({
          id: `saved-${collection.id}`,
          title: collection.title,
          subtitle: `Playlist · Saved`,
          artworkUrl: collection.artworkUrl,
          seed: collection.id,
          round: false,
          active:
            route.kind === "collection" && route.collection.id === collection.id,
          contextPlaying: isPlaying && contextLabel === collection.title,
          route: { kind: "collection", collection },
          pinned: true,
          sortAt: collection.createdAt ?? "",
        });
      }
    }

    if (showAlbums) {
      for (const album of savedAlbums.filter((item) => matches(item.title))) {
        list.push({
          id: `album-${album.id}`,
          title: album.title,
          subtitle: `Album · ${album.ownerName}`,
          artworkUrl: album.artworkUrl,
          seed: album.id,
          round: false,
          active: route.kind === "collection" && route.collection.id === album.id,
          contextPlaying: isPlaying && contextLabel === album.title,
          route: { kind: "collection", collection: album },
          pinned: false,
          sortAt: "",
        });
      }
    }

    if (showArtists) {
      for (const artist of followedArtists.filter((item) => matches(item.name))) {
        list.push({
          id: `artist-${artist.id}`,
          title: artist.name,
          subtitle: "Artist",
          artworkUrl: artist.avatarUrl,
          seed: artist.id,
          round: true,
          active: route.kind === "artist" && route.artist.id === artist.id,
          contextPlaying: isPlaying && contextLabel === artist.name,
          route: { kind: "artist", artist },
          pinned: false,
          sortAt: "",
        });
      }
    }

    if (sort === "alphabetical") return list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "recently-added") return list.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [
    filters,
    libraryQuery,
    likedTracks.length,
    playlists,
    route,
    savedAlbums,
    savedCollections,
    followedArtists,
    sort,
    user?.email,
    isPlaying,
    contextLabel,
  ]);

  const hasLibrary =
    likedTracks.length > 0 ||
    playlists.length > 0 ||
    savedAlbums.length > 0 ||
    followedArtists.length > 0 ||
    savedCollections.length > 0;
  const podcastOnly =
    filters.length === 1 && filters.includes("podcasts");

  if (collapsed) {
    return (
      <div className="music-library-panel music-library-collapsed">
        <button
          type="button"
          className="music-library-collapse"
          onClick={onToggle}
          aria-label="Expand Your Library"
          title="Expand Your Library"
        >
          <PanelLeftIcon size={20} />
        </button>
        <button
          type="button"
          className="music-library-collapsed-add"
          onClick={onCreatePlaylist}
          aria-label="Create playlist"
          title="Create playlist"
        >
          <PlusIcon size={21} />
        </button>
        <div className="music-library-collapsed-list">
          {likedTracks.length > 0 && (
            <button type="button" onClick={() => go({ kind: "liked" })} title="Liked Songs">
              <span className="music-liked-cover">
                <HeartIcon size={18} filled />
              </span>
            </button>
          )}
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => go({ kind: "playlist", id: playlist.id })}
              title={playlist.title}
            >
              <MusicArtwork
                src={playlist.tracks[0]?.artworkUrl}
                alt=""
                seed={playlist.id}
                className="music-collapsed-cover"
                iconSize={15}
              />
            </button>
          ))}
          {savedCollections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              onClick={() => go({ kind: "collection", collection })}
              title={collection.title}
            >
              <MusicArtwork
                src={collection.artworkUrl}
                alt=""
                seed={collection.id}
                className="music-collapsed-cover"
                iconSize={15}
              />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="music-library-panel">
      {onClose && (
        <button type="button" className="music-library-mobile-close" onClick={onClose} aria-label="Close library">
          <XIcon size={18} />
        </button>
      )}

      <div className="music-library-head">
        <button
          type="button"
          className="music-library-title"
          onClick={() => go({ kind: "library" })}
          title="Your Library"
        >
          <LibraryIcon size={23} filled={route.kind === "library"} />
          <span>Your Library</span>
        </button>
        <div className="music-library-head-actions">
          <div ref={createRef} className="music-create-wrap">
            <button
              type="button"
              className="music-create-button"
              onClick={() => setCreateOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={createOpen}
            >
              <PlusIcon size={17} />
              <span>Create</span>
            </button>
            {createOpen && (
              <div role="menu" className="music-create-menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreatePlaylist();
                  }}
                >
                  <span className="music-create-menu-icon">
                    <MusicNoteIcon size={19} />
                  </span>
                  <span>
                    <strong>Playlist</strong>
                    <small>Create a playlist with songs or episodes</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  title="Folders are not available yet"
                >
                  <span className="music-create-menu-icon">
                    <LibraryIcon size={19} />
                  </span>
                  <span>
                    <strong>Folder</strong>
                    <small>Organize your playlists</small>
                  </span>
                </button>
              </div>
            )}
          </div>
          {onToggle && (
            <button
              type="button"
              className="music-library-collapse"
              onClick={onToggle}
              aria-label="Collapse Your Library"
              title="Collapse Your Library"
            >
              <PanelLeftIcon size={19} />
            </button>
          )}
        </div>
      </div>

      <div className="music-library-filters">
        {(
          [
            ["playlists", "Playlists"],
            ["artists", "Artists"],
            ["albums", "Albums"],
            ["podcasts", "Podcasts"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleFilter(value)}
            aria-pressed={filters.includes(value)}
            data-active={filters.includes(value) || undefined}
            className="music-library-filter"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="music-library-search-row">
        {searchOpen ? (
          <div className="music-library-search-input">
            <SearchIcon size={16} />
            <input
              autoFocus
              value={libraryQuery}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Search in Your Library"
              aria-label="Search in Your Library"
            />
            <button
              type="button"
              aria-label="Close library search"
              onClick={() => {
                setLibraryQuery("");
                setSearchOpen(false);
              }}
            >
              <XIcon size={15} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="music-library-search-toggle"
            aria-label="Search in Your Library"
            title="Search in Your Library"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon size={18} />
          </button>
        )}

        <div ref={sortRef} className="music-sort-wrap">
          <button
            type="button"
            onClick={() => setSortOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            className="music-sort-button"
          >
            {sort === "recents"
              ? "Recents"
              : sort === "recently-added"
                ? "Recently Added"
                : "Alphabetical"}
            <SortIcon size={15} />
          </button>
          {sortOpen && (
            <div role="menu" className="music-sort-menu">
              {(
                [
                  ["recents", "Recents"],
                  ["recently-added", "Recently Added"],
                  ["alphabetical", "Alphabetical"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSort(value);
                    setSortOpen(false);
                  }}
                  data-active={sort === value || undefined}
                >
                  <span>{label}</span>
                  {sort === value && <CheckIcon size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="music-library-scroll">
        {podcastOnly ? (
          <div className="music-library-empty">
            <MusicNoteIcon size={24} />
            <strong>No podcasts yet</strong>
            <span>Podcasts are not part of the open catalog.</span>
          </div>
        ) : libraryEntries.length === 0 ? (
          <div className="music-library-empty">
            <strong>{hasLibrary ? "No matches" : "Create your first playlist"}</strong>
            <span>{hasLibrary ? "Try another search or filter." : "It’s easy, we’ll help you."}</span>
            {!hasLibrary && (
              <button type="button" onClick={onCreatePlaylist}>
                Create playlist
              </button>
            )}
          </div>
        ) : (
          libraryEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => go(entry.route)}
              data-active={entry.active || undefined}
              data-playing={entry.contextPlaying || undefined}
              className="music-library-row"
              title={entry.title}
            >
              {entry.id === "liked" ? (
                <span className="music-liked-cover">
                  <HeartIcon size={20} filled />
                </span>
              ) : (
                <MusicArtwork
                  src={entry.artworkUrl}
                  alt=""
                  seed={entry.seed}
                  rounded={entry.round ? "rounded-full" : "rounded"}
                  className="music-library-cover"
                  iconSize={17}
                />
              )}
              <span className="music-library-copy">
                <strong>{entry.title}</strong>
                <span>
                  {entry.pinned && <PinIcon size={12} className="music-library-pin" />}
                  {entry.subtitle}
                </span>
              </span>
              {entry.contextPlaying && (
                <span className="music-library-playing" aria-label="Playing">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
