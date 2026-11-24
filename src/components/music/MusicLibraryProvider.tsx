"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { toast } from "@/lib/toast";
import type {
  LibrarySyncMode,
  MusicArtist,
  MusicCollection,
  MusicLibrarySnapshot,
  MusicTrack,
  UserPlaylist,
} from "@/lib/music/types";
import { colorFor } from "@/lib/music/utils";

// ---------------------------------------------------------------------------
// Reelhouse Music library.
//
// Signed in -> Supabase tables, every row guarded by RLS (0003_music.sql).
// Signed out, or while the migration has not been applied -> the same shapes
// are mirrored to localStorage, so the page is still fully usable. Mutations
// are optimistic: the UI updates immediately and remote sync happens behind it.
//
// Playlists are addressed by a client-generated UUID so a new list can be
// opened and edited before the insert round-trip finishes.
// ---------------------------------------------------------------------------

const STORAGE_BASE = "reelhouse:music:library:v1";
const GUEST_KEY = `${STORAGE_BASE}:guest`;
const USER_KEY_PREFIX = `${STORAGE_BASE}:user:`;

interface MusicLibraryContextValue extends MusicLibrarySnapshot {
  ready: boolean;
  syncMode: LibrarySyncMode;
  syncError: string | null;
  createPlaylist: (title: string, description?: string) => UserPlaylist;
  updatePlaylist: (id: string, patch: { title?: string; description?: string }) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (
    playlistId: string,
    track: MusicTrack
  ) => Promise<"added" | "exists" | "missing">;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  getPlaylist: (id: string) => UserPlaylist | undefined;
  isTrackLiked: (trackId: string) => boolean;
  toggleLike: (track: MusicTrack) => void;
  isAlbumSaved: (albumId: string) => boolean;
  toggleSavedAlbum: (album: MusicCollection) => void;
  isArtistFollowed: (artistId: string) => boolean;
  toggleFollowArtist: (artist: MusicArtist) => void;
  isCollectionSaved: (collectionId: string) => boolean;
  toggleSavedCollection: (collection: MusicCollection) => void;
  recordPlay: (track: MusicTrack) => void;
  setFavoriteGenres: (genres: string[]) => void;
  refreshLibrary: () => Promise<void>;
}

const MusicLibraryContext = createContext<MusicLibraryContextValue | null>(null);

export function useMusicLibrary(): MusicLibraryContextValue {
  const value = useContext(MusicLibraryContext);
  if (!value) throw new Error("useMusicLibrary must be used inside MusicLibraryProvider");
  return value;
}

function emptySnapshot(): MusicLibrarySnapshot {
  return {
    playlists: [],
    likedTracks: [],
    savedAlbums: [],
    followedArtists: [],
    recentTracks: [],
    savedCollections: [],
    favoriteGenres: [],
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isTrack(value: unknown): value is MusicTrack {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MusicTrack).id === "string" &&
    typeof (value as MusicTrack).title === "string" &&
    typeof (value as MusicTrack).artistName === "string"
  );
}

function isCollection(value: unknown): value is MusicCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MusicCollection).id === "string" &&
    typeof (value as MusicCollection).title === "string"
  );
}

function isArtist(value: unknown): value is MusicArtist {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MusicArtist).id === "string" &&
    typeof (value as MusicArtist).name === "string"
  );
}

function readLocal(key: string): MusicLibrarySnapshot {
  if (typeof window === "undefined") return emptySnapshot();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const playlists = asArray(parsed.playlists)
      .map((value) => {
        if (typeof value !== "object" || value === null) return null;
        const item = value as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.title !== "string") return null;
        const tracks = asArray(item.tracks).filter(isTrack);
        return {
          id: item.id,
          title: item.title,
          description: typeof item.description === "string" ? item.description : "",
          tracks,
          createdAt:
            typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
          updatedAt:
            typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
          accent: typeof item.accent === "string" ? item.accent : colorFor(item.id),
        } satisfies UserPlaylist;
      })
      .filter((value): value is UserPlaylist => Boolean(value));

    return {
      playlists,
      likedTracks: asArray(parsed.likedTracks).filter(isTrack),
      savedAlbums: asArray(parsed.savedAlbums).filter(isCollection),
      followedArtists: asArray(parsed.followedArtists).filter(isArtist),
      recentTracks: asArray(parsed.recentTracks).filter(isTrack).slice(0, 24),
      savedCollections: asArray(parsed.savedCollections).filter(isCollection),
      favoriteGenres: asArray(parsed.favoriteGenres)
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 8),
    };
  } catch {
    return emptySnapshot();
  }
}

function writeLocal(key: string, snapshot: MusicLibrarySnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Storage can be full or disabled in private mode. The in-memory library
    // keeps working for this session.
  }
}

function hasContent(snapshot: MusicLibrarySnapshot): boolean {
  return Boolean(
    snapshot.playlists.length ||
      snapshot.likedTracks.length ||
      snapshot.savedAlbums.length ||
      snapshot.followedArtists.length ||
      snapshot.recentTracks.length ||
      snapshot.savedCollections.length
  );
}

function snapshotFromRows(
  rows: {
    playlists: Record<string, unknown>[];
    playlistTracks: Record<string, unknown>[];
    liked: Record<string, unknown>[];
    albums: Record<string, unknown>[];
    artists: Record<string, unknown>[];
    recent: Record<string, unknown>[];
    collections: Record<string, unknown>[];
  },
  favoriteGenres: string[] = []
): MusicLibrarySnapshot {
  const tracksByPlaylist = new Map<string, MusicTrack[]>();
  for (const row of rows.playlistTracks) {
    const playlistId = String(row.playlist_id ?? "");
    const snapshot = row.track_snapshot;
    if (!playlistId || !isTrack(snapshot)) continue;
    const list = tracksByPlaylist.get(playlistId) ?? [];
    list.push(snapshot);
    tracksByPlaylist.set(playlistId, list);
  }

  const playlists: UserPlaylist[] = rows.playlists
    .map((row) => {
      const id = String(row.id ?? "");
      if (!id || typeof row.title !== "string") return null;
      return {
        id,
        title: row.title,
        description: typeof row.description === "string" ? row.description : "",
        tracks: tracksByPlaylist.get(id) ?? [],
        createdAt:
          typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        updatedAt:
          typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
        accent: typeof row.accent === "string" ? row.accent : colorFor(id),
      } satisfies UserPlaylist;
    })
    .filter((value): value is UserPlaylist => Boolean(value));

  return {
    playlists,
    likedTracks: rows.liked.map((row) => row.track_snapshot).filter(isTrack),
    savedAlbums: rows.albums.map((row) => row.album_snapshot).filter(isCollection),
    followedArtists: rows.artists.map((row) => row.artist_snapshot).filter(isArtist),
    recentTracks: rows.recent
      .map((row) => row.track_snapshot)
      .filter(isTrack)
      .slice(0, 24),
    savedCollections: rows.collections
      .map((row) => row.collection_snapshot)
      .filter(isCollection),
    favoriteGenres,
  };
}

async function loadRemote(
  supabase: SupabaseClient,
  userId: string
): Promise<MusicLibrarySnapshot> {
  const [playlists, playlistTracks, liked, albums, artists, recent, collections] =
    await Promise.all([
      supabase
        .from("music_playlists")
        .select("id,title,description,accent,created_at,updated_at")
        .order("created_at", { ascending: true }),
      supabase
        .from("music_playlist_tracks")
        .select("playlist_id,track_snapshot,position,added_at")
        .eq("user_id", userId)
        .order("position", { ascending: true })
        .order("added_at", { ascending: true }),
      supabase
        .from("music_liked_tracks")
        .select("track_snapshot,liked_at")
        .eq("user_id", userId)
        .order("liked_at", { ascending: false }),
      supabase
        .from("music_saved_albums")
        .select("album_snapshot,saved_at")
        .eq("user_id", userId)
        .order("saved_at", { ascending: false }),
      supabase
        .from("music_followed_artists")
        .select("artist_snapshot,followed_at")
        .eq("user_id", userId)
        .order("followed_at", { ascending: false }),
      supabase
        .from("music_recently_played")
        .select("track_snapshot,played_at")
        .eq("user_id", userId)
        .order("played_at", { ascending: false })
        .limit(24),
      supabase
        .from("music_saved_collections")
        .select("collection_snapshot,saved_at")
        .eq("user_id", userId)
        .order("saved_at", { ascending: false }),
    ]);

  const firstError =
    playlists.error ??
    playlistTracks.error ??
    liked.error ??
    albums.error ??
    artists.error ??
    recent.error ??
    collections.error;
  if (firstError) throw new Error(firstError.message);

  // Preferences live in a separate table because they are additive optional
  // data. A missing 0004 migration must never put the whole library into
  // device-only mode.
  let favoriteGenres: string[] = [];
  try {
    const preferences = await supabase
      .from("user_music_preferences")
      .select("favorite_genres")
      .eq("user_id", userId)
      .maybeSingle();
    if (
      !preferences.error &&
      Array.isArray(preferences.data?.favorite_genres)
    ) {
      favoriteGenres = preferences.data.favorite_genres
        .filter((value: unknown): value is string => typeof value === "string")
        .map((value: string) => value.trim())
        .filter(Boolean)
        .slice(0, 8);
    }
  } catch {
    // 0004 has not been applied yet: keep the local preference fallback.
  }

  return snapshotFromRows(
    {
      playlists: (playlists.data ?? []) as Record<string, unknown>[],
      playlistTracks: (playlistTracks.data ?? []) as Record<string, unknown>[],
      liked: (liked.data ?? []) as Record<string, unknown>[],
      albums: (albums.data ?? []) as Record<string, unknown>[],
      artists: (artists.data ?? []) as Record<string, unknown>[],
      recent: (recent.data ?? []) as Record<string, unknown>[],
      collections: (collections.data ?? []) as Record<string, unknown>[],
    },
    favoriteGenres
  );
}

function buildPlaylistRows(userId: string, snapshot: MusicLibrarySnapshot) {
  const playlistRows = snapshot.playlists.map((playlist) => ({
    id: playlist.id,
    user_id: userId,
    title: playlist.title,
    description: playlist.description,
    accent: playlist.accent,
    created_at: playlist.createdAt,
    updated_at: playlist.updatedAt,
  }));
  const trackRows = snapshot.playlists.flatMap((playlist) =>
    playlist.tracks.map((track, position) => ({
      playlist_id: playlist.id,
      user_id: userId,
      track_id: track.id,
      track_snapshot: track,
      position,
    }))
  );
  return { playlistRows, trackRows };
}

async function pushSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshot: MusicLibrarySnapshot
): Promise<void> {
  const { playlistRows, trackRows } = buildPlaylistRows(userId, snapshot);
  const tasks: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (playlistRows.length) {
    tasks.push(
      Promise.resolve(
        supabase
          .from("music_playlists")
          .upsert(playlistRows, { onConflict: "id" })
      )
    );
  }
  if (snapshot.likedTracks.length) {
    tasks.push(
      Promise.resolve(
        supabase.from("music_liked_tracks").upsert(
          snapshot.likedTracks.map((track) => ({
            user_id: userId,
            track_id: track.id,
            track_snapshot: track,
          })),
          { onConflict: "user_id,track_id" }
        )
      )
    );
  }
  if (snapshot.savedAlbums.length) {
    tasks.push(
      Promise.resolve(
        supabase.from("music_saved_albums").upsert(
          snapshot.savedAlbums.map((album) => ({
            user_id: userId,
            album_id: album.id,
            album_snapshot: album,
          })),
          { onConflict: "user_id,album_id" }
        )
      )
    );
  }
  if (snapshot.followedArtists.length) {
    tasks.push(
      Promise.resolve(
        supabase.from("music_followed_artists").upsert(
          snapshot.followedArtists.map((artist) => ({
            user_id: userId,
            artist_id: artist.id,
            artist_snapshot: artist,
          })),
          { onConflict: "user_id,artist_id" }
        )
      )
    );
  }
  if (snapshot.savedCollections.length) {
    tasks.push(
      Promise.resolve(
        supabase.from("music_saved_collections").upsert(
          snapshot.savedCollections.map((collection) => ({
            user_id: userId,
            collection_id: collection.id,
            collection_snapshot: collection,
          })),
          { onConflict: "user_id,collection_id" }
        )
      )
    );
  }
  if (snapshot.recentTracks.length) {
    tasks.push(
      Promise.resolve(
        supabase.from("music_recently_played").upsert(
          snapshot.recentTracks.map((track) => ({
            user_id: userId,
            track_id: track.id,
            track_snapshot: track,
          })),
          { onConflict: "user_id,track_id" }
        )
      )
    );
  }
  const results = await Promise.all(tasks);
  const error = results.find((result) => result.error);
  if (error?.error) throw new Error(error.error.message);

  if (trackRows.length) {
    const { error: trackError } = await supabase
      .from("music_playlist_tracks")
      .upsert(trackRows, { onConflict: "playlist_id,track_id" });
    if (trackError) throw new Error(trackError.message);
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function MusicLibraryProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const configured = isSupabaseConfigured();
  const [snapshot, setSnapshot] = useState<MusicLibrarySnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [syncMode, setSyncMode] = useState<LibrarySyncMode>("checking");
  const [syncError, setSyncError] = useState<string | null>(null);

  const snapshotRef = useRef(snapshot);
  const storageKeyRef = useRef(GUEST_KEY);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const remoteAvailableRef = useRef(false);
  const warnedRef = useRef(false);
  const preferenceWarningRef = useRef(false);

  const setCurrent = useCallback((next: MusicLibrarySnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    writeLocal(storageKeyRef.current, next);
  }, []);

  const warnDeviceOnly = useCallback(() => {
    if (warnedRef.current) return;
    warnedRef.current = true;
    toast(
      "Saved on this device. Apply the music migration in Supabase to sync across devices.",
      { durationMs: 5200 }
    );
  }, []);

  // Hydrate local state immediately, then reconcile with the cloud library.
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const userId = user?.id;
    storageKeyRef.current = userId ? `${USER_KEY_PREFIX}${userId}` : GUEST_KEY;
    const local = readLocal(storageKeyRef.current);
    setCurrent(local);
    setReady(true);
    setSyncError(null);
    warnedRef.current = false;

    if (!userId || !configured) {
      supabaseRef.current = null;
      remoteAvailableRef.current = false;
      setSyncMode("device");
      return;
    }

    const supabase = getBrowserSupabase();
    supabaseRef.current = supabase;
    if (!supabase) {
      remoteAvailableRef.current = false;
      setSyncMode("device");
      return;
    }

    setSyncMode("checking");
    void loadRemote(supabase, userId)
      .then(async (remote) => {
        if (cancelled) return;
        remoteAvailableRef.current = true;
        setSyncError(null);
        setSyncMode("cloud");

        if (hasContent(remote)) {
          const merged = {
            ...remote,
            favoriteGenres: remote.favoriteGenres.length
              ? remote.favoriteGenres
              : local.favoriteGenres,
          };
          setCurrent(merged);
          return;
        }

        const guest = readLocal(GUEST_KEY);
        const seed = hasContent(guest) ? guest : local;
        if (hasContent(seed)) {
          setCurrent(seed);
          try {
            await pushSnapshot(supabase, userId, seed);
            if (seed.favoriteGenres.length) {
              await supabase
                .from("user_music_preferences")
                .upsert(
                  {
                    user_id: userId,
                    favorite_genres: seed.favoriteGenres,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "user_id" }
                );
            }
          } catch (error) {
            if (cancelled) return;
            remoteAvailableRef.current = false;
            setSyncMode("device");
            setSyncError(error instanceof Error ? error.message : "Cloud sync unavailable");
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        remoteAvailableRef.current = false;
        setSyncMode("device");
        setSyncError(error instanceof Error ? error.message : "Cloud sync unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id, configured, setCurrent]);

  const runRemote = useCallback(
    async (
      task: (
        supabase: SupabaseClient,
        userId: string
      ) => PromiseLike<{ error: { message: string } | null }>
    ) => {
      const supabase = supabaseRef.current;
      const userId = user?.id;
      if (!supabase || !userId || !remoteAvailableRef.current) return;
      try {
        const { error } = await task(supabase, userId);
        if (error) throw new Error(error.message);
      } catch (error) {
        remoteAvailableRef.current = false;
        setSyncMode("device");
        setSyncError(error instanceof Error ? error.message : "Cloud sync unavailable");
        warnDeviceOnly();
      }
    },
    [user?.id, warnDeviceOnly]
  );

  const createPlaylist = useCallback(
    (title: string, description = ""): UserPlaylist => {
      const cleanTitle = title.trim().slice(0, 120) || "My Playlist";
      const now = new Date().toISOString();
      const playlist: UserPlaylist = {
        id: newId(),
        title: cleanTitle,
        description: description.trim().slice(0, 500),
        tracks: [],
        createdAt: now,
        updatedAt: now,
        accent: colorFor(cleanTitle),
      };
      const next = { ...snapshotRef.current, playlists: [playlist, ...snapshotRef.current.playlists] };
      setCurrent(next);
      void runRemote((supabase, userId) =>
        supabase.from("music_playlists").upsert(
          {
            id: playlist.id,
            user_id: userId,
            title: playlist.title,
            description: playlist.description,
            accent: playlist.accent,
            created_at: playlist.createdAt,
            updated_at: playlist.updatedAt,
          },
          { onConflict: "id" }
        )
      );
      return playlist;
    },
    [runRemote, setCurrent]
  );

  const updatePlaylist = useCallback(
    (id: string, patch: { title?: string; description?: string }) => {
      const now = new Date().toISOString();
      const title = patch.title?.trim().slice(0, 120);
      const description = patch.description?.trim().slice(0, 500);
      const next = {
        ...snapshotRef.current,
        playlists: snapshotRef.current.playlists.map((playlist) =>
          playlist.id === id
            ? {
                ...playlist,
                title: title || playlist.title,
                description: description ?? playlist.description,
                updatedAt: now,
              }
            : playlist
        ),
      };
      setCurrent(next);
      const updated = next.playlists.find((playlist) => playlist.id === id);
      if (!updated) return;
      void runRemote((supabase, userId) =>
        supabase
          .from("music_playlists")
          .update({
            title: updated.title,
            description: updated.description,
            updated_at: now,
          })
          .eq("id", id)
          .eq("user_id", userId)
      );
    },
    [runRemote, setCurrent]
  );

  const deletePlaylist = useCallback(
    (id: string) => {
      const next = {
        ...snapshotRef.current,
        playlists: snapshotRef.current.playlists.filter((playlist) => playlist.id !== id),
      };
      setCurrent(next);
      void runRemote((supabase, userId) =>
        supabase.from("music_playlists").delete().eq("id", id).eq("user_id", userId)
      );
    },
    [runRemote, setCurrent]
  );

  const addTrackToPlaylist = useCallback(
    async (playlistId: string, track: MusicTrack): Promise<"added" | "exists" | "missing"> => {
      const playlist = snapshotRef.current.playlists.find((item) => item.id === playlistId);
      if (!playlist) return "missing";
      if (playlist.tracks.some((item) => item.id === track.id)) return "exists";
      const nextPlaylists = snapshotRef.current.playlists.map((item) =>
        item.id === playlistId
          ? { ...item, tracks: [...item.tracks, track], updatedAt: new Date().toISOString() }
          : item
      );
      setCurrent({ ...snapshotRef.current, playlists: nextPlaylists });
      const position = playlist.tracks.length;
      const now = new Date().toISOString();
      // Upsert the parent before the child row: a playlist created moments ago
      // may still be in flight, and the child insert has a real foreign key.
      void runRemote(async (supabase, userId) => {
        const parent = await supabase.from("music_playlists").upsert(
          {
            id: playlist.id,
            user_id: userId,
            title: playlist.title,
            description: playlist.description,
            accent: playlist.accent,
            created_at: playlist.createdAt,
            updated_at: now,
          },
          { onConflict: "id" }
        );
        if (parent.error) return { error: parent.error };
        return supabase.from("music_playlist_tracks").insert({
          playlist_id: playlistId,
          user_id: userId,
          track_id: track.id,
          track_snapshot: track,
          position,
        });
      });
      return "added";
    },
    [runRemote, setCurrent]
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      const nextPlaylists = snapshotRef.current.playlists.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              tracks: playlist.tracks.filter((track) => track.id !== trackId),
              updatedAt: new Date().toISOString(),
            }
          : playlist
      );
      setCurrent({ ...snapshotRef.current, playlists: nextPlaylists });
      void runRemote((supabase, userId) =>
        supabase
          .from("music_playlist_tracks")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("track_id", trackId)
          .eq("user_id", userId)
      );
    },
    [runRemote, setCurrent]
  );

  const getPlaylist = useCallback(
    (id: string) => snapshot.playlists.find((playlist) => playlist.id === id),
    [snapshot.playlists]
  );

  const isTrackLiked = useCallback(
    (trackId: string) => snapshot.likedTracks.some((track) => track.id === trackId),
    [snapshot.likedTracks]
  );

  const toggleLike = useCallback(
    (track: MusicTrack) => {
      const liked = snapshotRef.current.likedTracks.some((item) => item.id === track.id);
      const next = {
        ...snapshotRef.current,
        likedTracks: liked
          ? snapshotRef.current.likedTracks.filter((item) => item.id !== track.id)
          : [track, ...snapshotRef.current.likedTracks],
      };
      setCurrent(next);
      void runRemote((supabase, userId) =>
        liked
          ? supabase
              .from("music_liked_tracks")
              .delete()
              .eq("user_id", userId)
              .eq("track_id", track.id)
          : supabase.from("music_liked_tracks").upsert(
              {
                user_id: userId,
                track_id: track.id,
                track_snapshot: track,
                liked_at: new Date().toISOString(),
              },
              { onConflict: "user_id,track_id" }
            )
      );
    },
    [runRemote, setCurrent]
  );

  const isAlbumSaved = useCallback(
    (albumId: string) => snapshot.savedAlbums.some((album) => album.id === albumId),
    [snapshot.savedAlbums]
  );

  const toggleSavedAlbum = useCallback(
    (album: MusicCollection) => {
      const saved = snapshotRef.current.savedAlbums.some((item) => item.id === album.id);
      const next = {
        ...snapshotRef.current,
        savedAlbums: saved
          ? snapshotRef.current.savedAlbums.filter((item) => item.id !== album.id)
          : [album, ...snapshotRef.current.savedAlbums],
      };
      setCurrent(next);
      void runRemote((supabase, userId) =>
        saved
          ? supabase
              .from("music_saved_albums")
              .delete()
              .eq("user_id", userId)
              .eq("album_id", album.id)
          : supabase.from("music_saved_albums").upsert(
              {
                user_id: userId,
                album_id: album.id,
                album_snapshot: album,
                saved_at: new Date().toISOString(),
              },
              { onConflict: "user_id,album_id" }
            )
      );
    },
    [runRemote, setCurrent]
  );

  const isArtistFollowed = useCallback(
    (artistId: string) => snapshot.followedArtists.some((artist) => artist.id === artistId),
    [snapshot.followedArtists]
  );

  const toggleFollowArtist = useCallback(
    (artist: MusicArtist) => {
      const followed = snapshotRef.current.followedArtists.some(
        (item) => item.id === artist.id
      );
      const next = {
        ...snapshotRef.current,
        followedArtists: followed
          ? snapshotRef.current.followedArtists.filter((item) => item.id !== artist.id)
          : [artist, ...snapshotRef.current.followedArtists],
      };
      setCurrent(next);
      void runRemote((supabase, userId) =>
        followed
          ? supabase
              .from("music_followed_artists")
              .delete()
              .eq("user_id", userId)
              .eq("artist_id", artist.id)
          : supabase.from("music_followed_artists").upsert(
              {
                user_id: userId,
                artist_id: artist.id,
                artist_snapshot: artist,
                followed_at: new Date().toISOString(),
              },
              { onConflict: "user_id,artist_id" }
            )
      );
    },
    [runRemote, setCurrent]
  );

  const isCollectionSaved = useCallback(
    (collectionId: string) =>
      snapshot.savedCollections.some((collection) => collection.id === collectionId),
    [snapshot.savedCollections]
  );

  const toggleSavedCollection = useCallback(
    (collection: MusicCollection) => {
      const saved = snapshotRef.current.savedCollections.some(
        (item) => item.id === collection.id
      );
      const next = {
        ...snapshotRef.current,
        savedCollections: saved
          ? snapshotRef.current.savedCollections.filter((item) => item.id !== collection.id)
          : [collection, ...snapshotRef.current.savedCollections],
      };
      setCurrent(next);
      void runRemote((supabase, userId) =>
        saved
          ? supabase
              .from("music_saved_collections")
              .delete()
              .eq("user_id", userId)
              .eq("collection_id", collection.id)
          : supabase.from("music_saved_collections").upsert(
              {
                user_id: userId,
                collection_id: collection.id,
                collection_snapshot: collection,
                saved_at: new Date().toISOString(),
              },
              { onConflict: "user_id,collection_id" }
            )
      );
    },
    [runRemote, setCurrent]
  );

  const recentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecentRef = useRef<MusicTrack[] | null>(null);
  useEffect(() => {
    return () => {
      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
    };
  }, []);

  const setFavoriteGenres = useCallback(
    (genres: string[]) => {
      const clean = Array.from(
        new Set(
          genres
            .map((genre) => genre.trim().slice(0, 60))
            .filter(Boolean)
        )
      ).slice(0, 8);
      setCurrent({ ...snapshotRef.current, favoriteGenres: clean });

      const supabase = supabaseRef.current;
      const userId = user?.id;
      if (!supabase || !userId || !remoteAvailableRef.current) return;

      void supabase
        .from("user_music_preferences")
        .upsert(
          {
            user_id: userId,
            favorite_genres: clean,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .then(({ error }) => {
          if (!error || preferenceWarningRef.current) return;
          const missing =
            error.code === "PGRST205" || error.code === "42P01";
          if (missing) {
            preferenceWarningRef.current = true;
            toast("Genre preferences are saved on this device for now.", {
              durationMs: 5200,
            });
          }
        });
    },
    [setCurrent, user?.id]
  );

  const recordPlay = useCallback(
    (track: MusicTrack) => {
      const recent = [
        track,
        ...snapshotRef.current.recentTracks.filter((item) => item.id !== track.id),
      ].slice(0, 24);
      setCurrent({ ...snapshotRef.current, recentTracks: recent });
      pendingRecentRef.current = recent;
      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
      recentTimerRef.current = setTimeout(() => {
        const pending = pendingRecentRef.current;
        if (!pending) return;
        void runRemote((supabase, userId) =>
          supabase.from("music_recently_played").upsert(
            {
              user_id: userId,
              track_id: track.id,
              track_snapshot: track,
              played_at: new Date().toISOString(),
            },
            { onConflict: "user_id,track_id" }
          )
        );
      }, 4_000);
    },
    [runRemote, setCurrent]
  );

  const refreshLibrary = useCallback(async () => {
    const supabase = supabaseRef.current;
    const userId = user?.id;
    if (!supabase || !userId) return;
    try {
      const remote = await loadRemote(supabase, userId);
      remoteAvailableRef.current = true;
      setSyncError(null);
      setSyncMode("cloud");
      setCurrent({
        ...remote,
        favoriteGenres: remote.favoriteGenres.length
          ? remote.favoriteGenres
          : snapshotRef.current.favoriteGenres,
      });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Cloud sync unavailable");
    }
  }, [setCurrent, user?.id]);

  const value = useMemo<MusicLibraryContextValue>(
    () => ({
      ...snapshot,
      ready,
      syncMode,
      syncError,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      getPlaylist,
      isTrackLiked,
      toggleLike,
      isAlbumSaved,
      toggleSavedAlbum,
      isArtistFollowed,
      toggleFollowArtist,
      isCollectionSaved,
      toggleSavedCollection,
      recordPlay,
      setFavoriteGenres,
      refreshLibrary,
    }),
    [
      snapshot,
      ready,
      syncMode,
      syncError,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      getPlaylist,
      isTrackLiked,
      toggleLike,
      isAlbumSaved,
      toggleSavedAlbum,
      isArtistFollowed,
      toggleFollowArtist,
      isCollectionSaved,
      toggleSavedCollection,
      recordPlay,
      setFavoriteGenres,
      refreshLibrary,
    ]
  );

  return (
    <MusicLibraryContext.Provider value={value}>{children}</MusicLibraryContext.Provider>
  );
}
