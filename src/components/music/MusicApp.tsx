"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MusicArtist,
  MusicBrowseCategory,
  MusicCollection,
  MusicHomeData,
  MusicPanelTab,
  MusicRoute,
  MusicTrack,
  UserPlaylist,
} from "@/lib/music/types";
import { artistFromTrack, colorFor, dedupeTracks } from "@/lib/music/utils";
import { buildTasteProfile } from "@/lib/music/recommendations";
import { getMusicAuthHeaders } from "@/lib/music/client";
import { displayNameFor, useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/lib/toast";
import MusicLibraryProvider, { useMusicLibrary } from "./MusicLibraryProvider";
import MusicPlayerProvider, { useMusicPlayer } from "./MusicPlayerProvider";
import MusicSidebar from "./MusicSidebar";
import MusicTopbar from "./MusicTopbar";
import MusicPlayerBar from "./MusicPlayerBar";
import NowPlayingPanel from "./NowPlayingPanel";
import LyricsView from "./LyricsView";
import HomeView from "./HomeView";
import SearchView from "./SearchView";
import LibraryView from "./LibraryView";
import SpotifyView from "./SpotifyView";
import LikedView from "./LikedView";
import CollectionView from "./CollectionView";
import ArtistView from "./ArtistView";
import CategoryView from "./CategoryView";
import {
  AddToPlaylistDialog,
  ConfirmDialog,
  PlaylistFormDialog,
} from "./MusicDialogs";
import SpotifyImportDialog from "./SpotifyImportDialog";
import { MusicNoteIcon } from "./icons";

function albumTitleForTrack(track: MusicTrack): string {
  const albumTitle = track.albumTitle?.trim();
  if (!albumTitle) return track.title;
  // Some Audius imports expose an internal catalog slug as the release name.
  // A single reads much better under the track title, as it does on streaming
  // services, than under an opaque identifier.
  return /^i\d+-al-[a-z0-9-]+$/i.test(albumTitle) ? track.title : albumTitle;
}

function collectionForPlaylist(
  playlist: UserPlaylist | undefined,
  ownerName: string
): MusicCollection {
  return {
    id: `user:${playlist?.id ?? "playlist"}`,
    kind: "playlist",
    title: playlist?.title ?? "Playlist",
    description: playlist?.description,
    artworkUrl: playlist?.tracks[0]?.artworkUrl,
    ownerName,
    trackCount: playlist?.tracks.length ?? 0,
    tracks: playlist?.tracks ?? [],
    accent: playlist?.accent ?? "#1ed760",
  };
}

async function fetchCollection(collection: MusicCollection): Promise<MusicCollection> {
  const params = new URLSearchParams({
    id: collection.id,
    title: collection.title,
    kind: collection.kind === "album" ? "album" : "playlist",
  });
  if (collection.provider) params.set("provider", collection.provider);
  if (collection.ownerName) params.set("owner", collection.ownerName);
  if (collection.ownerId) params.set("ownerId", collection.ownerId);
  if (collection.artworkUrl) params.set("artwork", collection.artworkUrl);
  const response = await fetch(`/api/music/collection?${params.toString()}`);
  if (!response.ok) throw new Error("Collection unavailable");
  return (await response.json()) as MusicCollection;
}

export default function MusicApp() {
  return (
    <MusicLibraryProvider>
      <MusicPlayerProvider>
        <MusicExperience />
      </MusicPlayerProvider>
    </MusicLibraryProvider>
  );
}

function MusicExperience() {
  const { user } = useAuth();
  const {
    playlists,
    likedTracks,
    savedAlbums,
    followedArtists,
    savedCollections,
    recentTracks,
    favoriteGenres,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    moveTrackInPlaylist,
    getPlaylist,
    recordPlay,
    refreshLibrary,
  } = useMusicLibrary();
  const { currentTrack, isPlaying, playQueue, contextLabel } = useMusicPlayer();

  const [home, setHome] = useState<MusicHomeData | null>(null);
  const [personalizedTracks, setPersonalizedTracks] = useState<MusicTrack[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [route, setRoute] = useState<MusicRoute>({ kind: "home" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<MusicPanelTab>("now-playing");
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [spotifyImportOpen, setSpotifyImportOpen] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(null);
  const [pendingTrack, setPendingTrack] = useState<MusicTrack | null>(null);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<MusicTrack | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef<string | null>(null);

  const loadHome = useCallback(() => {
    setHomeLoading(true);
    setHomeError(null);
    fetch("/api/music/discover")
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        return (await response.json()) as MusicHomeData;
      })
      .then((data) => {
        setHome(data);
        setHomeLoading(false);
      })
      .catch(() => {
        setHomeError("The catalog didn’t load.");
        setHomeLoading(false);
      });
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const tasteProfile = useMemo(
    () =>
      buildTasteProfile({
        likedTracks,
        recentTracks,
        playlists,
        followedArtists,
        favoriteGenres,
      }),
    [likedTracks, recentTracks, playlists, followedArtists, favoriteGenres]
  );

  useEffect(() => {
    if (!tasteProfile.hasSignals) {
      setPersonalizedTracks([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        const auth = await getMusicAuthHeaders();
        try {
          const response = await fetch("/api/music/recommendations", {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              genres: tasteProfile.genres.map((genre) => genre.label),
              artists: tasteProfile.artists.map((artist) => ({
                id: artist.id,
                name: artist.name,
              })),
              excludeIds: tasteProfile.seedIds,
              limit: 20,
            }),
          });
          if (!response.ok) return;
          const data = (await response.json()) as { tracks?: MusicTrack[] };
          if (!Array.isArray(data.tracks)) return;
          setPersonalizedTracks(data.tracks.slice(0, 20));
        } catch (cause: unknown) {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          // Keep the catalog shelf rather than showing an error for an
          // additive personalization request.
        }
      })();
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tasteProfile]);

  const homeView = useMemo<MusicHomeData | null>(() => {
    if (!home) return null;
    if (!personalizedTracks.length) return home;
    return { ...home, recommended: personalizedTracks };
  }, [home, personalizedTracks]);

  const navigate = useCallback((next: MusicRoute) => {
    setRoute(next);
    setLyricsOpen(false);
    setMobileLibraryOpen(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, []);

  useEffect(() => {
    if (!currentTrack) setLyricsOpen(false);
  }, [currentTrack]);

  useEffect(() => {
    if (!currentTrack) return;
    if (recordedRef.current === currentTrack.id) return;
    recordedRef.current = currentTrack.id;
    recordPlay(currentTrack);
  }, [currentTrack, recordPlay]);

  const displayName = user ? displayNameFor(user) : "You";
  const allTracks = useMemo(
    () =>
      dedupeTracks([
        ...(homeView?.trending ?? []),
        ...(homeView?.recommended ?? []),
        ...(homeView?.underground ?? []),
        ...(homeView?.latest ?? []),
        ...recentTracks,
        ...likedTracks,
      ]),
    [homeView, likedTracks, recentTracks]
  );

  const allCategories = home?.categories ?? [
    { id: "pop", title: "Pop", color: "#dc148c" },
  ];

  const playCollection = useCallback(
    async (collection: MusicCollection) => {
      try {
        const playable =
          collection.tracks.length > 0 ? collection : await fetchCollection(collection);
        if (playable.tracks.length === 0) {
          toast("This collection has no playable tracks.");
          return;
        }
        playQueue(playable.tracks, 0, playable.title);
      } catch {
        toast("This collection could not be loaded right now.");
      }
    },
    [playQueue]
  );

  const openTrackAlbum = useCallback(
    (track: MusicTrack) => {
      navigate({
        kind: "collection",
        collection: {
          id: track.albumId ?? `single:${track.id}`,
          provider: track.provider,
          providerId: track.albumId
            ? track.albumId.replace(/^jamendo:album:/, "")
            : track.providerId,
          kind: "album",
          title: albumTitleForTrack(track),
          artworkUrl: track.artworkUrl,
          ownerName: track.artistName,
          ownerId: track.artistId,
          trackCount: track.albumId ? 0 : 1,
          tracks: track.albumId ? [] : [track],
          accent: colorFor(track.albumId ?? track.id),
        },
      });
    },
    [navigate]
  );

  const openArtist = useCallback(
    (artist: MusicArtist, tracks?: MusicTrack[]) => {
      navigate({ kind: "artist", artist, tracks });
    },
    [navigate]
  );

  const openArtistFromTrack = useCallback(
    (track: MusicTrack) => openArtist(artistFromTrack(track)),
    [openArtist]
  );

  const openCollection = useCallback(
    (collection: MusicCollection) => navigate({ kind: "collection", collection }),
    [navigate]
  );

  const openPlaylist = useCallback(
    (id: string) => {
      if (!getPlaylist(id)) {
        toast("That playlist could not be found.");
        return;
      }
      navigate({ kind: "playlist", id });
    },
    [getPlaylist, navigate]
  );

  const openCategory = useCallback(
    (id: string) => {
      const category =
        home?.categories.find((item) => item.id === id) ??
        ({ id, title: id.replace(/-/g, " "), color: colorFor(id) } satisfies MusicBrowseCategory);
      navigate({ kind: "category", category });
    },
    [home?.categories, navigate]
  );

  const handleSearch = useCallback(
    (query: string) => {
      setRoute({ kind: "search", query });
      setLyricsOpen(false);
      setMobileLibraryOpen(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    },
    []
  );

  const handleCreatePlaylist = useCallback(() => {
    setPendingTrack(null);
    setEditingPlaylistId(null);
    setCreateOpen(true);
  }, []);

  function submitPlaylist(values: { title: string; description: string }) {
    if (editingPlaylistId) {
      updatePlaylist(editingPlaylistId, values);
      setEditingPlaylistId(null);
      return;
    }
    const playlist = createPlaylist(values.title, values.description);
    if (pendingTrack) {
      void addTrackToPlaylist(playlist.id, pendingTrack);
      setPendingTrack(null);
    }
    setCreateOpen(false);
    navigate({ kind: "playlist", id: playlist.id });
  }

  function confirmDeletePlaylist() {
    if (!deletingPlaylistId) return;
    deletePlaylist(deletingPlaylistId);
    if (route.kind === "playlist" && route.id === deletingPlaylistId) {
      setRoute({ kind: "library" });
    }
    setDeletingPlaylistId(null);
  }

  function openPanel(tab: MusicPanelTab) {
    if (tab === "lyrics") {
      if (!currentTrack) return;
      setLyricsOpen(true);
      setPanelOpen(false);
      return;
    }
    if (panelOpen && panelTab === tab) {
      setPanelOpen(false);
      return;
    }
    setPanelTab(tab);
    setPanelOpen(true);
  }

  function closeLyrics() {
    setLyricsOpen(false);
    if (currentTrack) {
      setPanelTab("now-playing");
      setPanelOpen(true);
    }
  }

  function renderRoute() {
    switch (route.kind) {
      case "home":
        return (
          <HomeView
            home={homeView}
            loading={homeLoading}
            error={homeError}
            onRetry={loadHome}
            recentTracks={recentTracks}
            likedTracks={likedTracks}
            followedArtists={followedArtists}
            displayName={displayName}
            onPlayTrack={(track, queue, label) => {
              const index = Math.max(0, queue.findIndex((item) => item.id === track.id));
              playQueue(queue.length ? queue : [track], index, label);
            }}
            onOpenTrack={openTrackAlbum}
            onOpenArtist={openArtist}
            onOpenCollection={openCollection}
            onPlayCollection={(collection) => void playCollection(collection)}
            onOpenCategory={openCategory}
            onOpenSearch={(query) => handleSearch(query ?? "")}
            onCreatePlaylist={handleCreatePlaylist}
            onOpenLiked={() => navigate({ kind: "liked" })}
            onOpenPlaylist={openPlaylist}
          />
        );

      case "search":
        return (
          <SearchView
            initialQuery={route.query}
            categories={allCategories}
            onPlayTrack={(track, queue, label) => {
              const index = Math.max(0, queue.findIndex((item) => item.id === track.id));
              playQueue(queue.length ? queue : [track], index, label);
            }}
            onPlayCollection={(collection) => void playCollection(collection)}
            onOpenArtist={openArtist}
            onOpenCollection={openCollection}
            onOpenCategory={openCategory}
            onAddToPlaylist={setAddToPlaylistTrack}
          />
        );

      case "library":
        return (
          <LibraryView
            onOpenLiked={() => navigate({ kind: "liked" })}
            onOpenPlaylist={(playlist) => navigate({ kind: "playlist", id: playlist.id })}
            onOpenCollection={openCollection}
            onOpenArtist={openArtist}
            onPlayCollection={(collection) => void playCollection(collection)}
            onCreatePlaylist={handleCreatePlaylist}
            onOpenSearch={() => handleSearch("")}
            onOpenSpotify={() => navigate({ kind: "spotify" })}
          />
        );

      case "spotify":
        return (
          <SpotifyView
            onBack={() => navigate({ kind: "library" })}
            onSearch={(query) => handleSearch(query)}
            onImportPlaylist={() => setSpotifyImportOpen(true)}
            onOpenPlaylist={async (playlistId) => {
              await refreshLibrary();
              navigate({ kind: "playlist", id: playlistId });
            }}
            onOpenLiked={async () => {
              await refreshLibrary();
              navigate({ kind: "liked" });
            }}
          />
        );

      case "liked":
        return (
          <LikedView
            onOpenAlbum={openTrackAlbum}
            onOpenArtist={openArtistFromTrack}
            onAddToPlaylist={setAddToPlaylistTrack}
            onFindMusic={() => handleSearch("")}
          />
        );

      case "playlist": {
        const playlist = getPlaylist(route.id);
        if (!playlist) {
          return (
            <div className="music-fallback">
              <MusicNoteIcon size={32} />
              <h1>Playlist not found</h1>
              <p>It may have been deleted, or it belongs to a different account.</p>
              <button type="button" className="music-white-button" onClick={() => navigate({ kind: "library" })}>
                Back to Your Library
              </button>
            </div>
          );
        }
        return (
          <CollectionView
            collection={collectionForPlaylist(playlist, displayName)}
            playlist={playlist}
            onBackToSearch={() => handleSearch("")}
            onPlayCollection={(collection) => void playCollection(collection)}
            onOpenCollection={openCollection}
            onOpenArtist={openArtist}
            onOpenAlbumTrack={openTrackAlbum}
            onAddToPlaylist={setAddToPlaylistTrack}
            onAddTrackToPlaylist={(track) => {
              void addTrackToPlaylist(playlist.id, track);
            }}
            onRemoveTrack={(track) => removeTrackFromPlaylist(playlist.id, track.id)}
            onMoveTrack={(from, to) => moveTrackInPlaylist(playlist.id, from, to)}
            onEditPlaylist={() => setEditingPlaylistId(playlist.id)}
            onDeletePlaylist={() => setDeletingPlaylistId(playlist.id)}
            onImportSpotify={() => setSpotifyImportOpen(true)}
          />
        );
      }

      case "collection":
        return (
          <CollectionView
            collection={route.collection}
            onBackToSearch={() => handleSearch("")}
            onPlayCollection={(collection) => void playCollection(collection)}
            onOpenCollection={openCollection}
            onOpenArtist={openArtist}
            onOpenAlbumTrack={openTrackAlbum}
            onAddToPlaylist={setAddToPlaylistTrack}
          />
        );

      case "artist":
        return (
          <ArtistView
            artist={route.artist}
            initialTracks={route.tracks}
            onPlayTracks={(tracks, index, label) => playQueue(tracks, index, label)}
            onOpenCollection={openCollection}
            onOpenAlbumTrack={openTrackAlbum}
            onAddToPlaylist={setAddToPlaylistTrack}
          />
        );

      case "category":
        return (
          <CategoryView
            category={route.category}
            allTracks={allTracks}
            mixes={home?.mixes ?? []}
            categories={allCategories}
            onPlayTrack={(track, queue, label) => {
              const index = Math.max(0, queue.findIndex((item) => item.id === track.id));
              playQueue(queue.length ? queue : [track], index, label);
            }}
            onPlayCollection={(collection) => void playCollection(collection)}
            onOpenCollection={openCollection}
            onOpenCategory={openCategory}
            onAddToPlaylist={setAddToPlaylistTrack}
            onOpenArtist={openArtistFromTrack}
            onOpenAlbumTrack={openTrackAlbum}
          />
        );
    }
  }

  const editingPlaylist = editingPlaylistId ? getPlaylist(editingPlaylistId) : undefined;

  return (
    <div className="music-page">
      <div className="music-shell">
        <MusicTopbar
          route={route}
          onSearch={handleSearch}
          onHome={() => navigate({ kind: "home" })}
          onOpenSpotify={() => navigate({ kind: "spotify" })}
          onOpenLibrary={() => setMobileLibraryOpen(true)}
          onOpenArtist={openArtist}
          onOpenCollection={openCollection}
          searchTracks={allTracks}
          searchArtists={[...(home?.artists ?? []), ...followedArtists]}
          searchCategories={allCategories}
          likedTracks={likedTracks}
          onAddTrack={setAddToPlaylistTrack}
          onOpenTrack={openTrackAlbum}
        />

        <div
          className="music-app-body"
          data-sidebar={sidebarCollapsed ? "collapsed" : "open"}
          data-panel={(panelOpen && !lyricsOpen) || undefined}
          data-lyrics={lyricsOpen || undefined}
        >
          <aside className="music-sidebar">
            <MusicSidebar
              route={route}
              onNavigate={navigate}
              onCreatePlaylist={handleCreatePlaylist}
              onImportSpotify={() => setSpotifyImportOpen(true)}
              onToggle={() => setSidebarCollapsed((value) => !value)}
              collapsed={sidebarCollapsed}
            />
          </aside>

          {lyricsOpen && currentTrack ? (
            <LyricsView
              track={currentTrack}
              contextLabel={contextLabel}
              onClose={closeLyrics}
            />
          ) : (
            <main className="music-main">
              <div ref={scrollRef} className="music-main-scroll music-scroll">
                {renderRoute()}
              </div>
            </main>
          )}

          {!lyricsOpen && panelOpen && (
            <NowPlayingPanel
              open
              tab={panelTab}
              onTab={setPanelTab}
              onClose={() => setPanelOpen(false)}
              onOpenLyrics={() => {
                if (!currentTrack) return;
                setLyricsOpen(true);
                setPanelOpen(false);
              }}
              onGoToArtist={openArtistFromTrack}
              onGoToAlbum={(track) => openTrackAlbum(track)}
            />
          )}
        </div>

        <MusicPlayerBar
          panelOpen={panelOpen}
          panelTab={panelTab}
          lyricsOpen={lyricsOpen}
          onOpenPanel={openPanel}
          onAddToPlaylist={setAddToPlaylistTrack}
          onGoToArtist={currentTrack ? () => openArtistFromTrack(currentTrack) : undefined}
        />
      </div>

      {mobileLibraryOpen && (
        <>
          <button
            type="button"
            aria-label="Close library"
            className="music-drawer-backdrop"
            onClick={() => setMobileLibraryOpen(false)}
          />
          <div className="music-drawer" role="dialog" aria-modal="true" aria-label="Your Library">
            <MusicSidebar
              route={route}
              onNavigate={navigate}
              onCreatePlaylist={() => {
                setMobileLibraryOpen(false);
                handleCreatePlaylist();
              }}
              onImportSpotify={() => {
                setMobileLibraryOpen(false);
                setSpotifyImportOpen(true);
              }}
              onClose={() => setMobileLibraryOpen(false)}
            />
          </div>
        </>
      )}

      {(createOpen || editingPlaylistId) && (
        <PlaylistFormDialog
          mode={editingPlaylistId ? "edit" : "create"}
          initial={editingPlaylist}
          pendingTrack={pendingTrack}
          onClose={() => {
            setCreateOpen(false);
            setEditingPlaylistId(null);
            setPendingTrack(null);
          }}
          onSubmit={submitPlaylist}
        />
      )}

      {spotifyImportOpen && (
        <SpotifyImportDialog
          onClose={() => setSpotifyImportOpen(false)}
          onOpenPlaylist={(playlistId) => {
            setSpotifyImportOpen(false);
            void refreshLibrary().then(() => navigate({ kind: "playlist", id: playlistId }));
          }}
        />
      )}

      {addToPlaylistTrack && (
        <AddToPlaylistDialog
          track={addToPlaylistTrack}
          onClose={() => setAddToPlaylistTrack(null)}
          onNewPlaylist={(track) => {
            setAddToPlaylistTrack(null);
            setPendingTrack(track);
            setCreateOpen(true);
          }}
        />
      )}

      {deletingPlaylistId && (
        <ConfirmDialog
          title="Delete this playlist?"
          copy="This will permanently remove the playlist and its track list. The music itself stays in the catalog."
          confirmLabel="Delete playlist"
          onClose={() => setDeletingPlaylistId(null)}
          onConfirm={confirmDeletePlaylist}
        />
      )}

      {isPlaying && currentTrack && (
        <span className="sr-only" aria-live="polite">
          Playing {currentTrack.title} by {currentTrack.artistName}
        </span>
      )}
    </div>
  );
}
