"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  MusicArtist,
  MusicCollection,
  MusicTrack,
  UserPlaylist,
} from "@/lib/music/types";
import {
  collectionDuration,
  colorFor,
  formatDuration,
  formatTotalDuration,
  formatTrackCount,
} from "@/lib/music/utils";
import { catalogLabelForCollection } from "@/lib/music/providers";
import { toast } from "@/lib/toast";
import { displayNameFor, useAuth } from "@/components/auth/AuthProvider";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import MusicTrackList from "./MusicTrackList";
import {
  CheckCircleIcon,
  CheckIcon,
  EditIcon,
  ExternalIcon,
  ListIcon,
  MoreIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  PlusCircleIcon,
  PlusIcon,
  SearchIcon,
  ShuffleIcon,
  SpotifyIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";
import { CollectionShelfCard, EmptyState } from "./MusicUI";

export default function CollectionView({
  collection,
  playlist,
  onBackToSearch,
  onPlayCollection,
  onOpenCollection,
  onOpenArtist,
  onOpenAlbumTrack,
  onAddToPlaylist,
  onAddTrackToPlaylist,
  onRemoveTrack,
  onMoveTrack,
  onEditPlaylist,
  onDeletePlaylist,
  onImportSpotify,
}: {
  collection: MusicCollection;
  playlist?: UserPlaylist;
  onBackToSearch: () => void;
  onPlayCollection: (collection: MusicCollection) => void;
  onOpenCollection: (collection: MusicCollection) => void;
  onOpenArtist: (artist: MusicArtist) => void;
  onOpenAlbumTrack: (track: MusicTrack) => void;
  onAddToPlaylist: (track: MusicTrack) => void;
  onAddTrackToPlaylist?: (track: MusicTrack) => void;
  onRemoveTrack?: (track: MusicTrack) => void;
  onMoveTrack?: (from: number, to: number) => void;
  onEditPlaylist?: () => void;
  onDeletePlaylist?: () => void;
  onImportSpotify?: () => void;
}) {
  const { user } = useAuth();
  const { currentTrack, isPlaying, playQueue, toggle } = useMusicPlayer();
  const {
    isAlbumSaved,
    toggleSavedAlbum,
    isCollectionSaved,
    toggleSavedCollection,
  } = useMusicLibrary();
  const [details, setDetails] = useState<MusicCollection | null>(null);
  const [playlistTracksOverride, setPlaylistTracksOverride] = useState<MusicTrack[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [finderOpen, setFinderOpen] = useState(Boolean(playlist));
  const [condensed, setCondensed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const effective = useMemo<MusicCollection>(() => {
    const base = details ?? collection;
    if (!playlist) return base;
    return {
      ...base,
      title: playlist.title,
      description: playlist.description,
      artworkUrl:
        playlist.imageUrl ??
        playlistTracksOverride?.[0]?.artworkUrl ??
        playlist.tracks[0]?.artworkUrl ??
        base.artworkUrl,
      ownerName: displayNameFor(user) || "You",
      trackCount: playlistTracksOverride?.length ?? playlist.tracks.length,
      tracks: playlistTracksOverride ?? playlist.tracks,
      accent: playlist.accent,
    };
  }, [collection, details, playlist, playlistTracksOverride, user]);

  const shouldFetch =
    collection.tracks.length === 0 &&
    collection.kind !== "mix" &&
    Boolean(collection.id) &&
    !playlist;

  // Clear the previous collection when the route changes. Keeping this out of
  // the fetch effect matters: resetting `details` from inside the effect that
  // `details` also gates re-runs fetch on every render and never settles.
  useEffect(() => {
    setDetails(null);
    setFetchError(false);
    setLoading(false);
  }, [collection.id]);

  useEffect(() => {
    if (!shouldFetch) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      id: collection.id,
      title: collection.title,
      kind: collection.kind === "album" ? "album" : "playlist",
    });
    if (collection.provider) params.set("provider", collection.provider);
    if (collection.ownerName) params.set("owner", collection.ownerName);
    if (collection.ownerId) params.set("ownerId", collection.ownerId);
    if (collection.artworkUrl) params.set("artwork", collection.artworkUrl);
    fetch(`/api/music/collection?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Collection unavailable");
        return (await response.json()) as MusicCollection;
      })
      .then((data) => {
        setDetails(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setFetchError(true);
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id, shouldFetch]);

  useEffect(() => {
    const scroller = rootRef.current?.closest(".music-main-scroll") as HTMLElement | null;
    if (!scroller) return;
    const onScroll = () => setCondensed(scroller.scrollTop > 280);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const isUserPlaylist = Boolean(playlist);
  const accent =
    effective.kind === "mix" || isUserPlaylist
      ? effective.accent || colorFor(effective.id)
      : colorFor(effective.id);
  const total = collectionDuration(effective.tracks);
  const saved =
    effective.kind === "album"
      ? isAlbumSaved(effective.id)
      : isCollectionSaved(effective.id);
  const collectionPlaying = Boolean(
    isPlaying &&
      currentTrack &&
      effective.tracks.some((track) => track.id === currentTrack.id)
  );
  const spotifyPlaylistId = playlist?.externalId?.replace(/^spotify:playlist:/, "");
  const spotifyEmbed = spotifyPlaylistId
    ? `https://open.spotify.com/embed/playlist/${spotifyPlaylistId}?utm_source=generator&theme=0`
    : null;
  const typeLabel = playlist?.source === "spotify"
    ? playlist.importMode === "embed"
      ? "Spotify playlist"
      : "Imported from Spotify"
    : effective.kind === "album"
      ? effective.trackCount <= 1
        ? "Single"
        : "Album"
      : effective.kind === "mix"
        ? "Made for you"
        : "Public Playlist";

  function toggleSave() {
    if (isUserPlaylist) return;
    if (effective.kind === "album") toggleSavedAlbum(effective);
    else toggleSavedCollection(effective);
  }

  // Spotify import keeps unmatched entries visible, but they must never be
  // queued as if they were playable.
  const playableTracks = effective.tracks.filter(
    (track) => track.isStreamable !== false && track.provider !== "spotify"
  );
  const playableCollection: MusicCollection =
    playableTracks.length === effective.tracks.length
      ? effective
      : { ...effective, tracks: playableTracks, trackCount: playableTracks.length };

  function play() {
    if (playableTracks.length === 0) {
      toast("No playable YouTube Music matches in this playlist yet.");
      return;
    }
    if (collectionPlaying) toggle();
    else onPlayCollection(playableCollection);
  }

  function addTrackDirectly(track: MusicTrack) {
    if (!onAddTrackToPlaylist) return;
    onAddTrackToPlaylist(track);
    setPlaylistTracksOverride((tracks) => {
      const base = tracks ?? playlist?.tracks ?? [];
      if (base.some((item) => item.id === track.id)) return base;
      return [...base, track];
    });
    setFinderOpen(true);
    toast(`Added to ${effective.title}`, { tone: "success" });
  }

  const heroStyle = {
    background: `linear-gradient(180deg, ${accent} 0%, ${accent}99 47%, #121212 100%)`,
    "--music-hero-art": effective.artworkUrl
      ? `url("${effective.artworkUrl}")`
      : "none",
  } as CSSProperties;
  const condensedStyle = {
    background: `linear-gradient(180deg, ${accent}99 0%, #202020 100%)`,
  };

  return (
    <div ref={rootRef} className="music-detail">
      <div
        className="music-collection-condensed"
        data-visible={condensed || undefined}
        style={condensedStyle}
      >
        <button
          type="button"
          className="music-detail-play music-detail-play-small"
          onClick={play}
          disabled={loading || playableTracks.length === 0}
          aria-label={collectionPlaying ? `Pause ${effective.title}` : `Play ${effective.title}`}
        >
          {collectionPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
        </button>
        <strong>{effective.title}</strong>
        <div className="music-collection-condensed-actions">
          <button type="button" onClick={() => setListMenuOpen((value) => !value)}>
            <ListIcon size={18} />
          </button>
          <button type="button" onClick={() => setMenuOpen((value) => !value)}>
            <MoreIcon size={19} />
          </button>
        </div>
      </div>

      <header className="music-detail-hero" style={heroStyle}>
        <MusicArtwork
          src={effective.artworkUrl}
          alt={effective.title}
          seed={effective.id}
          className="music-detail-art"
          iconSize={44}
          priority
          fallbackArtist={
            effective.kind === "album" ? effective.ownerName : undefined
          }
          fallbackAlbum={
            effective.kind === "album" ? effective.title : undefined
          }
        />
        <div className="music-detail-copy">
          <span className="music-detail-type">{typeLabel}</span>
          <h1>{effective.title}</h1>
          {effective.description && <p className="music-detail-description">{effective.description}</p>}
          <div className="music-detail-meta">
            {effective.ownerId ? (
              <button
                type="button"
                onClick={() =>
                  onOpenArtist({
                    id: effective.ownerId!,
                    name: effective.ownerName,
                  })
                }
              >
                {effective.ownerName}
              </button>
            ) : (
              <span>{effective.ownerName}</span>
            )}
            {effective.createdAt && (
              <>
                <span>•</span>
                <span>{effective.createdAt.slice(0, 4)}</span>
              </>
            )}
            <span>•</span>
            <span>{formatTrackCount(effective.trackCount || effective.tracks.length)}</span>
            {total > 0 && (
              <>
                <span>•</span>
                <span>{formatTotalDuration(total)}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="music-detail-body">
        <div className="music-detail-toolbar">
          <button
            type="button"
            className="music-detail-play"
            onClick={play}
            disabled={loading || playableTracks.length === 0}
            aria-label={collectionPlaying ? `Pause ${effective.title}` : `Play ${effective.title}`}
          >
            {collectionPlaying ? <PauseIcon size={23} /> : <PlayIcon size={23} />}
          </button>
          <button
            type="button"
            className="music-detail-tool"
            onClick={() => {
              const shuffled = [...playableTracks].sort(() => Math.random() - 0.5);
              playQueue(shuffled, 0, effective.title);
            }}
            disabled={loading || playableTracks.length === 0}
            aria-label="Shuffle play"
            title="Shuffle play"
          >
            <ShuffleIcon size={25} />
          </button>
          {!isUserPlaylist && (
            <button
              type="button"
              className="music-detail-tool"
              onClick={toggleSave}
              aria-label={saved ? "Remove from Your Library" : "Save to Your Library"}
              title={saved ? "Remove from Your Library" : "Save to Your Library"}
              data-saved={saved || undefined}
            >
              {saved ? <CheckCircleIcon size={26} /> : <PlusCircleIcon size={26} />}
            </button>
          )}
          <button
            type="button"
            className="music-detail-tool"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).then(
                () => toast("Link copied to clipboard", { tone: "success" }),
                () => undefined
              );
            }}
            aria-label="Copy link"
            title="Copy link"
          >
            <ExternalIcon size={22} />
          </button>
          <div className="music-detail-more-wrap">
            <button
              type="button"
              className="music-detail-tool"
              onClick={() => setMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More options"
              title="More options"
            >
              <MoreIcon size={25} />
            </button>
            {menuOpen && (
              <div className="music-context-menu music-detail-menu" role="menu">
                {isUserPlaylist && onEditPlaylist && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onEditPlaylist();
                    }}
                  >
                    <EditIcon size={16} /> Edit details
                  </button>
                )}
                {isUserPlaylist && onDeletePlaylist && (
                  <button
                    type="button"
                    role="menuitem"
                    className="music-menu-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePlaylist();
                    }}
                  >
                    <TrashIcon size={16} /> Delete playlist
                  </button>
                )}
                {!isUserPlaylist && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      toggleSave();
                    }}
                  >
                    {saved ? <CheckIcon size={16} /> : <MusicNoteIcon size={16} />}
                    {saved ? "Remove from Your Library" : "Add to Your Library"}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void navigator.clipboard?.writeText(window.location.href).then(
                      () => toast("Link copied to clipboard", { tone: "success" }),
                      () => undefined
                    );
                  }}
                >
                  <ExternalIcon size={16} /> Copy link
                </button>
              </div>
            )}
          </div>
          <div className="music-detail-view-wrap">
            <button
              type="button"
              className="music-detail-list-button"
              onClick={() => setListMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={listMenuOpen}
            >
              <span>{compactView ? "Compact" : "List"}</span>
              <ListIcon size={19} />
            </button>
            {listMenuOpen && (
              <div className="music-context-menu music-list-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  data-active={!compactView || undefined}
                  onClick={() => {
                    setCompactView(false);
                    setListMenuOpen(false);
                  }}
                >
                  <span>List</span>
                  {!compactView && <CheckIcon size={15} />}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-active={compactView || undefined}
                  onClick={() => {
                    setCompactView(true);
                    setListMenuOpen(false);
                  }}
                >
                  <span>Compact</span>
                  {compactView && <CheckIcon size={15} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="music-track-skeletons">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="music-skeleton music-track-skeleton" />
            ))}
          </div>
        ) : fetchError ? (
          <EmptyState
            icon={<MusicNoteIcon size={30} />}
            title="Couldn’t load this collection"
            copy="The catalog could not return the track list. Go back and try another result."
            action={
              <button type="button" onClick={onBackToSearch} className="music-white-button">
                Back to search
              </button>
            }
          />
        ) : effective.tracks.length === 0 ? (
          isUserPlaylist && playlist?.importMode === "embed" && spotifyEmbed ? (
            <div className="music-spotify-embed">
              <div className="music-spotify-embed-head">
                <span>
                  <SpotifyIcon size={17} /> Official Spotify playlist
                </span>
                {playlist.externalUrl && (
                  <a href={playlist.externalUrl} target="_blank" rel="noreferrer">
                    Open on Spotify <ExternalIcon size={13} />
                  </a>
                )}
              </div>
              <iframe
                src={spotifyEmbed}
                title={`${effective.title} on Spotify`}
                width="100%"
                height={420}
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              />
              <p className="music-spotify-embed-note">
                This playlist is linked to Spotify and plays through Spotify's own embed.
                Reelhouse cannot read the embed's track list, so it is not represented as a
                native playlist.
              </p>
              <div className="music-spotify-embed-actions">
                {onImportSpotify && (
                  <button
                    type="button"
                    className="music-white-button"
                    onClick={onImportSpotify}
                  >
                    <PlusIcon size={16} /> Create a native playlist
                  </button>
                )}
                <button
                  type="button"
                  className="music-detail-pill"
                  onClick={() => setFinderOpen(true)}
                >
                  Add songs manually
                </button>
              </div>
            </div>
          ) : isUserPlaylist && finderOpen ? (
            <PlaylistTrackFinder
              onAdd={addTrackDirectly}
              onClose={() => setFinderOpen(false)}
            />
          ) : isUserPlaylist ? (
            <div className="music-playlist-empty">
              <div>
                <h2>Let’s find something for your playlist</h2>
                <p>Search the catalog and add a track to get started.</p>
              </div>
              <button type="button" className="music-white-button" onClick={() => setFinderOpen(true)}>
                <PlusIcon size={16} /> Add songs
              </button>
              {onEditPlaylist && (
                <button type="button" className="music-detail-pill" onClick={onEditPlaylist}>
                  <EditIcon size={15} /> Name &amp; details
                </button>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<MusicNoteIcon size={30} />}
              title="No tracks here yet"
              copy="This collection does not have any playable tracks."
              action={
                <button type="button" onClick={onBackToSearch} className="music-white-button">
                  Find something to listen to
                </button>
              }
            />
          )
        ) : (
          <>
            <MusicTrackList
              tracks={effective.tracks}
              onPlay={(track, index) => playQueue(effective.tracks, index, effective.title)}
              showAlbum={!compactView && effective.kind !== "album"}
              showArtwork={effective.kind !== "album"}
              showDateAdded={false}
              addedLabel={isUserPlaylist ? "Recently" : "Catalog"}
              compact={compactView}
              playlistId={playlist?.id}
              onAddToPlaylist={onAddToPlaylist}
              onRemoveFromPlaylist={onRemoveTrack}
              onMoveTrack={onMoveTrack}
              onGoToArtist={(track) =>
                onOpenArtist({
                  id: track.artistId,
                  name: track.artistName,
                  avatarUrl: track.artistAvatarUrl,
                })
              }
              onGoToAlbum={onOpenAlbumTrack}
            />

            {effective.kind === "album" && (
              <div className="music-release-info">
                <p>{effective.createdAt ? effective.createdAt.slice(0, 10) : `Released via ${catalogLabelForCollection(effective)}`}</p>
                <p>© {new Date().getFullYear()} {effective.ownerName}</p>
                <p>Catalog metadata and artwork by {catalogLabelForCollection(effective)}.</p>
              </div>
            )}

            {effective.kind === "album" && effective.ownerId && (
              <MoreByArtist
                artistId={effective.ownerId}
                artistName={effective.ownerName}
                onOpenCollection={onOpenCollection}
                onPlayCollection={onPlayCollection}
              />
            )}

            {playlist?.source === "spotify" && (
              <div className="music-spotify-provenance">
                <SpotifyIcon size={17} />
                <span>
                  {playlist.importMode === "embed"
                    ? "Linked from Spotify"
                    : "Imported from Spotify"}
                </span>
                {playlist.externalUrl && (
                  <a href={playlist.externalUrl} target="_blank" rel="noreferrer">
                    Open original playlist <ExternalIcon size={12} />
                  </a>
                )}
                {onImportSpotify && (
                  <button type="button" onClick={onImportSpotify}>
                    Update tracklist
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <p className="music-detail-credit">
          {isUserPlaylist
            ? `Created by ${effective.ownerName} · Reelhouse Music`
            : `${effective.ownerName} · Catalog by ${catalogLabelForCollection(effective)} · Reelhouse Music`}
        </p>
      </div>
    </div>
  );
}

function PlaylistTrackFinder({
  onAdd,
  onClose,
}: {
  onAdd: (track: MusicTrack) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/music/search?q=${encodeURIComponent(clean)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search unavailable");
          return (await response.json()) as { tracks?: MusicTrack[] };
        })
        .then((data) => {
          setResults((data.tracks ?? []).slice(0, 6));
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setResults([]);
          setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="music-playlist-finder">
      <div className="music-playlist-finder-head">
        <h2>Let’s find something for your playlist</h2>
        <button type="button" onClick={onClose} aria-label="Close playlist search">
          <XIcon size={20} />
        </button>
      </div>
      <label className="music-playlist-search">
        <SearchIcon size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for songs or episodes"
          autoFocus
          aria-label="Search for songs"
        />
      </label>
      {loading && <div className="music-skeleton music-playlist-search-skeleton" />}
      {!loading && results.length > 0 && (
        <div className="music-playlist-search-results">
          {results.map((track) => (
            <div key={track.id} className="music-playlist-search-row">
              <MusicArtwork
                src={track.artworkUrl}
                alt=""
                seed={track.id}
                className="music-playlist-search-art"
                iconSize={14}
              />
              <div className="min-w-0">
                <strong>{track.title}</strong>
                <span>{track.artistName}</span>
              </div>
              <span>{formatDuration(track.duration)}</span>
              <button
                type="button"
                onClick={() => onAdd(track)}
                aria-label={`Add ${track.title}`}
                title="Add to playlist"
              >
                <PlusCircleIcon size={23} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="music-playlist-search-empty">No songs found.</p>
      )}
    </div>
  );
}

function MoreByArtist({
  artistId,
  artistName,
  onOpenCollection,
  onPlayCollection,
}: {
  artistId: string;
  artistName: string;
  onOpenCollection: (collection: MusicCollection) => void;
  onPlayCollection: (collection: MusicCollection) => void;
}) {
  const [albums, setAlbums] = useState<MusicCollection[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/music/artist?id=${encodeURIComponent(artistId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { albums?: MusicCollection[] };
      })
      .then((data) => setAlbums((data?.albums ?? []).slice(0, 6)))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setAlbums([]);
      });
    return () => controller.abort();
  }, [artistId]);

  if (albums.length === 0) return null;

  return (
    <section className="music-more-by">
      <div className="music-section-head">
        <h2>More by {artistName}</h2>
      </div>
      <div className="music-more-grid">
        {albums.map((album) => (
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
  );
}

