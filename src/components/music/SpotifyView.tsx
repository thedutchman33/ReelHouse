"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MusicTrack } from "@/lib/music/types";
import type {
  ImportedSearch,
  PersonalizedHome,
  SpotifyConnection,
  SpotifyImportPreview,
  SpotifyImportResult,
  SpotifyLibrary,
  SpotifyMatchStats,
  SpotifyPlaylistDetail,
  SpotifyPlaylistSummary,
  SpotifySavedPage,
  SpotifyTrack,
} from "@/lib/music/spotify-types";
import { formatTrackCount } from "@/lib/music/utils";
import { musicApiFetch } from "@/lib/music/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/lib/toast";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import MusicArtwork from "./MusicArtwork";
import {
  CheckIcon,
  DownloadIcon,
  HeartIcon,
  MusicNoteIcon,
  PlayIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "./icons";

const IMPORT_CATEGORIES = [
  { id: "playlists", label: "Playlists", hint: "Names, descriptions, artwork and track order" },
  { id: "liked", label: "Liked Songs", hint: "Saved songs and their Spotify ids" },
  { id: "library", label: "Albums & Artists", hint: "Saved albums and followed artists" },
  { id: "history", label: "Listening History", hint: "Timestamps, durations, skips and devices" },
  { id: "searches", label: "Search History", hint: "Queries and search timestamps" },
  { id: "taste", label: "Taste Profile", hint: "Top artists, tracks and genres when exported" },
] as const;

type CategoryId = (typeof IMPORT_CATEGORIES)[number]["id"];
type Tab = "playlists" | "liked" | "imports" | "history";

function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function matchLabel(status: SpotifyTrack["matchStatus"]): string {
  if (status === "matched") return "Matched";
  if (status === "partial") return "Partial match";
  if (status === "unavailable") return "Unavailable";
  if (status === "pending") return "Matching";
  return "No match";
}

function emptyPreview(): SpotifyImportPreview {
  return {
    files: [],
    playlists: 0,
    playlistTracks: 0,
    likedSongs: 0,
    albums: 0,
    artists: 0,
    listeningEvents: 0,
    searches: 0,
    parsedFiles: 0,
    failedFiles: 0,
    hasExtendedHistory: false,
    hasAccountData: false,
    notes: [],
  };
}

function addPreview(left: SpotifyImportPreview, right: SpotifyImportPreview): SpotifyImportPreview {
  return {
    files: [...left.files, ...right.files],
    playlists: left.playlists + right.playlists,
    playlistTracks: left.playlistTracks + right.playlistTracks,
    likedSongs: left.likedSongs + right.likedSongs,
    albums: left.albums + right.albums,
    artists: left.artists + right.artists,
    listeningEvents: left.listeningEvents + right.listeningEvents,
    historyStart:
      left.historyStart && right.historyStart
        ? left.historyStart < right.historyStart
          ? left.historyStart
          : right.historyStart
        : left.historyStart ?? right.historyStart,
    historyEnd:
      left.historyEnd && right.historyEnd
        ? left.historyEnd > right.historyEnd
          ? left.historyEnd
          : right.historyEnd
        : left.historyEnd ?? right.historyEnd,
    searches: left.searches + right.searches,
    parsedFiles: left.parsedFiles + right.parsedFiles,
    failedFiles: left.failedFiles + right.failedFiles,
    hasExtendedHistory: left.hasExtendedHistory || right.hasExtendedHistory,
    hasAccountData: left.hasAccountData || right.hasAccountData,
    notes: Array.from(new Set([...left.notes, ...right.notes])),
  };
}

export default function SpotifyView({
  onBack,
  onOpenPlaylist,
  onOpenLiked,
  onSearch,
  onImportPlaylist,
}: {
  onBack: () => void;
  onOpenPlaylist: (libraryPlaylistId: string) => Promise<void>;
  onOpenLiked: () => Promise<void>;
  onSearch: (query: string) => void;
  onImportPlaylist: () => void;
}) {
  const { user, openAuth, ready } = useAuth();
  const { refreshLibrary } = useMusicLibrary();
  const { playQueue } = useMusicPlayer();
  const [tab, setTab] = useState<Tab>("playlists");
  const [status, setStatus] = useState<SpotifyConnection | null>(null);
  const [library, setLibrary] = useState<SpotifyLibrary | null>(null);
  const [profile, setProfile] = useState<PersonalizedHome | null>(null);
  const [liked, setLiked] = useState<SpotifySavedPage | null>(null);
  const [searches, setSearches] = useState<ImportedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playlistDetail, setPlaylistDetail] = useState<SpotifyPlaylistDetail | null>(null);
  const [fixing, setFixing] = useState<SpotifyTrack | null>(null);
  const [alternatives, setAlternatives] = useState<MusicTrack[]>([]);
  const [fixLoading, setFixLoading] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<CategoryId[]>(
    IMPORT_CATEGORIES.map((item) => item.id)
  );
  const [preview, setPreview] = useState<SpotifyImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState<SpotifyImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAccount = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [statusResponse, playlistsResponse, profileResponse] = await Promise.all([
        musicApiFetch("/api/spotify/status"),
        musicApiFetch("/api/spotify/playlists"),
        musicApiFetch("/api/music/profile"),
      ]);
      if (statusResponse.ok) setStatus((await statusResponse.json()) as SpotifyConnection);
      if (playlistsResponse.ok) setLibrary((await playlistsResponse.json()) as SpotifyLibrary);
      if (profileResponse.ok) setProfile((await profileResponse.json()) as PersonalizedHome);
    } catch {
      setError("The Spotify service is unreachable right now.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const loadLiked = useCallback(
    async (offset = 0, append = false) => {
      if (!user) return;
      setBusyId("liked");
      try {
        const response = await musicApiFetch(`/api/spotify/liked?offset=${offset}&limit=50`);
        if (!response.ok) throw new Error("Liked songs are unavailable");
        const page = (await response.json()) as SpotifySavedPage;
        setLiked((current) =>
          append && current
            ? {
                ...page,
                tracks: [...current.tracks, ...page.tracks],
                offset: 0,
                nextOffset: page.nextOffset,
              }
            : page
        );
      } catch (cause) {
        toast(cause instanceof Error ? cause.message : "Liked songs are unavailable");
      } finally {
        setBusyId(null);
      }
    },
    [user]
  );

  useEffect(() => {
    if (tab === "liked" && !liked) void loadLiked();
  }, [tab, liked, loadLiked]);

  const loadSearches = useCallback(async () => {
    if (!user) return;
    try {
      const response = await musicApiFetch("/api/spotify/search-history");
      if (!response.ok) return;
      const data = (await response.json()) as { searches?: ImportedSearch[] };
      setSearches(data.searches ?? []);
    } catch {
      setSearches([]);
    }
  }, [user]);

  useEffect(() => {
    if (tab === "history" && searches.length === 0) void loadSearches();
  }, [tab, searches.length, loadSearches]);

  async function connect() {
    setBusyId("connect");
    try {
      const response = await musicApiFetch("/api/spotify/connect", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Spotify connection could not start");
      }
      window.location.assign(data.url);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Spotify connection could not start");
      setBusyId(null);
    }
  }

  async function disconnect() {
    setBusyId("disconnect");
    try {
      await musicApiFetch("/api/spotify/connection", { method: "DELETE" });
      setStatus({ connected: false, scopes: [] });
      toast("Spotify disconnected", { tone: "success" });
    } finally {
      setBusyId(null);
    }
  }

  async function refreshSpotify() {
    setBusyId("refresh");
    try {
      const response = await musicApiFetch("/api/spotify/refresh", { method: "POST" });
      if (!response.ok) throw new Error("Spotify refresh failed");
      await loadAccount();
      setLiked(null);
      toast("Spotify library refreshed", { tone: "success" });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Spotify refresh failed");
    } finally {
      setBusyId(null);
    }
  }

  async function openPlaylist(playlist: SpotifyPlaylistSummary) {
    setBusyId(playlist.spotifyPlaylistId);
    try {
      const response = await musicApiFetch(
        `/api/spotify/playlists/${encodeURIComponent(playlist.spotifyPlaylistId)}`
      );
      if (!response.ok) throw new Error("This Spotify playlist could not be loaded");
      const detail = (await response.json()) as SpotifyPlaylistDetail;
      setPlaylistDetail(detail);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "This Spotify playlist could not be loaded");
    } finally {
      setBusyId(null);
    }
  }

  async function openDetailInLibrary() {
    const libraryId = playlistDetail?.playlist.libraryPlaylistId;
    if (!libraryId) {
      toast("Reelhouse could not mirror this playlist yet.");
      return;
    }
    setPlaylistDetail(null);
    await onOpenPlaylist(libraryId);
  }

  async function openFix(track: SpotifyTrack) {
    setFixing(track);
    setAlternatives([]);
    setFixLoading(true);
    try {
      const query = `${track.name} ${track.artistName}`.trim();
      const response = await fetch(`/api/music/search?q=${encodeURIComponent(query)}&limit=8`);
      if (response.ok) {
        const data = (await response.json()) as { tracks?: MusicTrack[] };
        setAlternatives(data.tracks ?? []);
      }
    } finally {
      setFixLoading(false);
    }
  }

  async function chooseMatch(track: SpotifyTrack, choice: MusicTrack) {
    setFixLoading(true);
    try {
      const response = await musicApiFetch(
        `/api/spotify/matches/${encodeURIComponent(track.spotifyTrackId)}/manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: choice }),
        }
      );
      if (!response.ok) throw new Error("The match could not be saved");
      toast("Match saved", { tone: "success" });
      setFixing(null);
      setLiked(null);
      await refreshLibrary();
      await loadLiked();
      setProfile(null);
      void loadAccount();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "The match could not be saved");
    } finally {
      setFixLoading(false);
    }
  }

  async function matchMoreLiked() {
    setBusyId("match");
    try {
      const response = await musicApiFetch("/api/spotify/liked/matches?limit=50", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Matching failed");
      await loadLiked();
      await refreshLibrary();
      toast("More liked songs matched", { tone: "success" });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Matching failed");
    } finally {
      setBusyId(null);
    }
  }

  function toggleCategory(id: CategoryId) {
    setCategories((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function previewFiles() {
    if (files.length === 0) {
      toast("Choose one or more Spotify ZIP files first.");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    setImportResult(null);
    try {
      let aggregate = emptyPreview();
      for (const file of files) {
        setImportProgress(`Checking ${file.name}…`);
        const response = await musicApiFetch("/api/spotify/import/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/zip",
            "X-Import-Archive-Name": encodeURIComponent(file.name),
          },
          body: file,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? `${file.name} could not be read`);
        }
        aggregate = addPreview(aggregate, (await response.json()) as SpotifyImportPreview);
      }
      setPreview(aggregate);
      toast("Spotify export preview ready", { tone: "success" });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "The Spotify export could not be previewed");
    } finally {
      setPreviewing(false);
      setImportProgress("");
    }
  }

  async function startImport() {
    if (files.length === 0 || categories.length === 0) {
      toast("Choose ZIP files and at least one category.");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      let jobId: string | undefined;
      let finalResult: SpotifyImportResult | null = null;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setImportProgress(`Importing ${index + 1} of ${files.length}: ${file.name}`);
        const headers: Record<string, string> = {
          "Content-Type": "application/zip",
          "X-Import-Archive-Name": encodeURIComponent(file.name),
          "X-Import-Categories": categories.join(","),
        };
        if (jobId) headers["X-Import-Job-Id"] = jobId;
        if (index === files.length - 1) headers["X-Import-Final"] = "true";
        const response = await musicApiFetch("/api/spotify/import", {
          method: "POST",
          headers,
          body: file,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? `${file.name} could not be imported`);
        }
        const result = (await response.json()) as SpotifyImportResult;
        jobId = result.jobId;
        finalResult = result;
      }
      setImportResult(finalResult);
      await refreshLibrary();
      await loadAccount();
      setLiked(null);
      toast("Spotify data imported", { tone: "success" });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "The Spotify export could not be imported");
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  async function clearSearches(id?: string) {
    setBusyId(id ?? "all-searches");
    try {
      await musicApiFetch(
        id ? `/api/spotify/search-history/${encodeURIComponent(id)}` : "/api/spotify/search-history",
        { method: "DELETE" }
      );
      setSearches((current) => (id ? current.filter((item) => item.id !== id) : []));
    } finally {
      setBusyId(null);
    }
  }

  const playlists = library?.playlists ?? [];
  const matchedLiked = useMemo(
    () =>
      (liked?.tracks ?? [])
        .map((item) => item.youtubeTrack)
        .filter((item): item is MusicTrack => Boolean(item)),
    [liked]
  );
  const stats = profile?.stats;
  const statsHours = stats ? Math.round(stats.totalMsPlayed / 3_600_000) : 0;

  if (!ready) return null;

  if (!user) {
    return (
      <div className="px-4 pb-12 pt-4 sm:px-6 md:px-8">
        <button type="button" onClick={onBack} className="mb-6 text-xs font-semibold text-white/50 hover:text-white">
          ← Back to Your Library
        </button>
        <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <MusicNoteIcon size={34} className="mx-auto text-[#1ed760]" />
          <h1 className="mt-4 text-2xl font-bold text-white">Bring your Spotify library to Reelhouse</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Sign in to connect Spotify or upload your Spotify data export. Your imported listening profile is private to your account.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => openAuth("login", "/music")}
              className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onImportPlaylist}
              className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-bold text-white"
            >
              Import a playlist link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-14 pt-4 sm:px-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} className="text-xs font-semibold text-white/45 hover:text-white">
            ← Your Library
          </button>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#1ed760]">Spotify</p>
          <h1 className="mt-1 text-[32px] font-bold tracking-[-0.035em] text-white">Your music, moved in</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">
            Connect Spotify for playlists and Liked Songs, or upload a Spotify data ZIP for playlists, history, searches and personal recommendations. Spotify playback stays in Spotify; Reelhouse plays the best YouTube Music match.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onImportPlaylist}
            className="rounded-full border border-[#1ed760]/50 px-4 py-2 text-xs font-bold text-[#1ed760] transition hover:bg-[#1ed760]/10"
          >
            Import a playlist link
          </button>
          {status?.connected ? (
            <>
              <button
                type="button"
                onClick={() => void refreshSpotify()}
                disabled={busyId !== null}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Refresh Spotify
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busyId !== null}
                className="rounded-full px-4 py-2 text-xs font-bold text-white/50 hover:text-white disabled:opacity-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busyId !== null}
              className="rounded-full bg-[#1ed760] px-5 py-2.5 text-xs font-bold text-black transition hover:scale-105 disabled:opacity-50"
            >
              {busyId === "connect" ? "Opening Spotify…" : "Connect Spotify"}
            </button>
          )}
        </div>
      </div>

      {stats && stats.totalEvents > 0 && (
        <div className="mb-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Listening events" value={stats.totalEvents.toLocaleString()} />
          <Stat label="Hours imported" value={statsHours.toLocaleString()} />
          <Stat label="Unique tracks" value={stats.uniqueTracks.toLocaleString()} />
          <Stat label="Unique artists" value={stats.uniqueArtists.toLocaleString()} />
        </div>
      )}

      {error && <p className="mb-5 rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        {([
          ["playlists", "Playlists"],
          ["liked", "Liked Songs"],
          ["imports", "Import data"],
          ["history", "Search history"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            data-active={tab === id || undefined}
            className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
              tab === id ? "bg-white text-black" : "bg-white/[0.08] text-white/75 hover:bg-white/[0.13]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "playlists" && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Spotify playlists</h2>
              <p className="mt-1 text-xs text-white/45">
                {status?.connected
                  ? `Connected as ${status.displayName ?? status.spotifyUserId}.`
                  : "Imported playlists remain available without Spotify connected."}
              </p>
            </div>
            {status?.connected && (
              <button
                type="button"
                onClick={() => void refreshSpotify()}
                disabled={busyId !== null}
                className="text-xs font-semibold text-white/50 hover:text-white"
              >
                Sync playlists
              </button>
            )}
          </div>
          {loading && playlists.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="music-skeleton aspect-[4/5] rounded-lg" />
              ))}
            </div>
          ) : playlists.length === 0 ? (
            <Empty
              title="No Spotify playlists yet"
              copy={
                status?.connected
                  ? "Press “Sync playlists” to pull in your Spotify library."
                  : "Connect Spotify or import a data ZIP to bring your playlists here."
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => void openPlaylist(playlist)}
                  disabled={busyId === playlist.spotifyPlaylistId}
                  className="music-card group min-w-0 text-left disabled:opacity-60"
                >
                  <MusicArtwork
                    src={playlist.artworkUrl}
                    alt={playlist.name}
                    seed={playlist.spotifyPlaylistId}
                    className="mb-3 aspect-square w-full"
                    iconSize={28}
                  />
                  <p className="truncate text-[14px] font-semibold text-white">{playlist.name}</p>
                  <p className="mt-1 line-clamp-2 min-h-[32px] text-[12px] leading-4 text-white/45">
                    {playlist.description || playlist.ownerName || "Spotify playlist"}
                  </p>
                  <p className="mt-1 text-[11px] text-white/35">
                    {busyId === playlist.spotifyPlaylistId
                      ? "Opening and matching…"
                      : `${formatTrackCount(playlist.trackCount)}${playlist.ownerName ? ` · ${playlist.ownerName}` : ""}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "liked" && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Spotify Liked Songs</h2>
              <p className="mt-1 text-xs text-white/45">
                {liked ? `${liked.total.toLocaleString()} saved songs · ${liked.matchStats.matched + liked.matchStats.partial} playable matches` : "Loading your saved songs…"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => matchedLiked.length && playQueue(matchedLiked, 0, "Spotify Liked Songs")}
                disabled={matchedLiked.length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-[#1ed760] px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
              >
                <PlayIcon size={14} /> Play matches
              </button>
              <button
                type="button"
                onClick={() => void loadLiked(0, false)}
                disabled={busyId !== null}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void matchMoreLiked()}
                disabled={busyId !== null}
                className="rounded-full px-4 py-2 text-xs font-bold text-white/55 hover:text-white disabled:opacity-40"
              >
                Match more
              </button>
            </div>
          </div>
          {!liked ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="music-skeleton h-14 rounded-md" />
              ))}
            </div>
          ) : liked.tracks.length === 0 ? (
            <Empty
              title="No saved Spotify songs"
              copy="Connect Spotify and refresh, or import your Spotify data ZIP. Unmatched songs remain listed and can be matched manually."
            />
          ) : (
            <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07]">
              {liked.tracks.map((track, index) => (
                <div key={`${track.spotifyTrackId}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-5 text-right text-xs tabular-nums text-white/30">{index + 1}</span>
                  <MusicArtwork
                    src={track.youtubeTrack?.artworkUrl ?? track.artworkUrl}
                    alt={track.name}
                    seed={track.spotifyTrackId}
                    className="h-10 w-10 shrink-0"
                    iconSize={16}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{track.name}</p>
                    <p className="truncate text-xs text-white/45">{track.artistName}</p>
                  </div>
                  <span className="hidden w-24 text-right text-[11px] text-white/40 sm:block">
                    {duration(track.durationMs / 1000)}
                  </span>
                  <span
                    className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:block ${
                      track.matchStatus === "matched"
                        ? "bg-[#1ed760]/15 text-[#5be98b]"
                        : track.matchStatus === "partial"
                          ? "bg-amber-400/15 text-amber-300"
                          : "bg-white/[0.07] text-white/45"
                    }`}
                  >
                    {matchLabel(track.matchStatus)}
                  </span>
                  {track.youtubeTrack ? (
                    <button
                      type="button"
                      onClick={() => playQueue([track.youtubeTrack as MusicTrack], 0, "Spotify Liked Songs")}
                      aria-label={`Play ${track.name}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <PlayIcon size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openFix(track)}
                      className="rounded-full px-2 py-1 text-[11px] font-semibold text-[#1ed760] hover:bg-white/10"
                    >
                      Find match
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void openFix(track)}
                    aria-label={`Change match for ${track.name}`}
                    className="px-1 text-[11px] text-white/35 hover:text-white"
                  >
                    ⋯
                  </button>
                </div>
              ))}
            </div>
          )}
          {liked?.nextOffset != null && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => void loadLiked(liked.nextOffset as number, true)}
                disabled={busyId !== null}
                className="music-white-button"
              >
                Load more liked songs
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "imports" && (
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1ed760]/15 text-[#1ed760]">
                <DownloadIcon size={20} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-white">Import your Spotify data</h2>
                <p className="mt-1 text-sm leading-relaxed text-white/50">
                  Request your Account Data and Extended Streaming History from Spotify. ZIP upload does not require Spotify login.
                </p>
              </div>
            </div>
            <ol className="mt-5 space-y-2 text-[13px] leading-relaxed text-white/55">
              <li>1. Open Spotify Account Privacy and request Account Data.</li>
              <li>2. Request Extended Streaming History for the fullest listening history.</li>
              <li>3. Download the ZIP files Spotify emails you.</li>
              <li>4. Upload them here, preview the detected data, choose categories and confirm.</li>
            </ol>
            <a
              href="https://www.spotify.com/in-en/account/privacy/"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-[#1ed760] hover:underline"
            >
              Open Spotify Account Privacy →
            </a>

            <div className="mt-6">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                Spotify ZIP files
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                multiple
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []));
                  setPreview(null);
                  setImportResult(null);
                }}
                className="block w-full cursor-pointer rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-bold file:text-black"
              />
              {files.length > 0 && (
                <p className="mt-2 text-xs text-white/40">
                  {files.length} archive{files.length === 1 ? "" : "s"}: {files.map((file) => file.name).join(", ")}
                </p>
              )}
            </div>

            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Import categories</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {IMPORT_CATEGORIES.map((category) => {
                  const selected = categories.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        selected
                          ? "border-[#1ed760]/50 bg-[#1ed760]/10"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-white">
                        <span className={`grid h-4 w-4 place-items-center rounded-full border ${selected ? "border-[#1ed760] bg-[#1ed760] text-black" : "border-white/25"}`}>
                          {selected && <CheckIcon size={10} />}
                        </span>
                        {category.label}
                      </span>
                      <span className="mt-1 block pl-6 text-[11px] leading-4 text-white/40">{category.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void previewFiles()}
                disabled={previewing || importing || files.length === 0}
                className="rounded-full border border-white/20 px-5 py-2.5 text-xs font-bold text-white transition hover:border-white/45 disabled:opacity-40"
              >
                {previewing ? "Reading archives…" : "Preview data"}
              </button>
              <button
                type="button"
                onClick={() => void startImport()}
                disabled={importing || previewing || !preview || categories.length === 0}
                className="rounded-full bg-[#1ed760] px-5 py-2.5 text-xs font-bold text-black transition hover:scale-105 disabled:opacity-40"
              >
                {importing ? "Importing…" : "Import selected data"}
              </button>
            </div>
            {importProgress && <p className="mt-3 text-xs text-[#5be98b]">{importProgress}</p>}
            <p className="mt-5 text-[11px] leading-relaxed text-white/30">
              Reelhouse never stores the raw ZIP. Only music-library and listening data is imported. Payment, billing, address, phone, precise location and private messages are ignored.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5">
            <h3 className="text-sm font-bold text-white">Preview & report</h3>
            {!preview && !importResult && (
              <p className="mt-3 text-xs leading-relaxed text-white/40">
                Choose ZIP files and press Preview. You will see playlists, tracks, liked songs, history events and search counts before anything is saved.
              </p>
            )}
            {preview && (
              <div className="mt-4 space-y-3">
                <PreviewRows preview={preview} />
                {preview.files.length > 0 && (
                  <details className="text-xs text-white/50">
                    <summary className="cursor-pointer text-white/70">Detected files ({preview.files.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {preview.files.map((file) => (
                        <li key={file.name} className="flex items-start justify-between gap-2">
                          <span className="truncate">{file.name}</span>
                          <span className={file.parsed ? "text-[#5be98b]" : "text-amber-300"}>
                            {file.parsed ? file.kind.replaceAll("_", " ") : "not read"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {preview.notes.length > 0 && (
                  <ul className="space-y-1 text-[11px] leading-relaxed text-white/35">
                    {preview.notes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                )}
              </div>
            )}
            {importResult && (
              <div className="mt-4 rounded-lg border border-[#1ed760]/20 bg-[#1ed760]/[0.06] p-4">
                <p className="text-sm font-semibold text-white">Import complete</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Result label="Playlists" value={importResult.importedPlaylists} />
                  <Result label="Playlist tracks" value={importResult.importedPlaylistTracks} />
                  <Result label="Liked songs" value={importResult.importedLikedSongs} />
                  <Result label="Albums" value={importResult.importedAlbums} />
                  <Result label="Artists" value={importResult.importedArtists} />
                  <Result label="History events" value={importResult.importedListeningEvents} />
                  <Result label="Searches" value={importResult.importedSearches} />
                  <Result label="Duplicates skipped" value={importResult.duplicatesSkipped} />
                </dl>
                {importResult.errors.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[11px] text-amber-300">
                    {importResult.errors.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => void onOpenLiked()}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#1ed760] hover:underline"
                >
                  <HeartIcon size={14} /> Open Liked Songs
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "history" && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Imported Spotify searches</h2>
              <p className="mt-1 text-xs text-white/45">Private to your account. Old exports may not contain search history.</p>
            </div>
            {searches.length > 0 && (
              <button
                type="button"
                onClick={() => void clearSearches()}
                disabled={busyId !== null}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/55 hover:text-white"
              >
                <TrashIcon size={14} /> Clear all
              </button>
            )}
          </div>
          {searches.length === 0 ? (
            <Empty
              title="No imported searches"
              copy="Search history is only present in some Spotify account-data exports. Reelhouse never invents historical searches."
            />
          ) : (
            <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07]">
              {searches.map((item, index) => (
                <div key={item.id ?? `${item.query}-${index}`} className="flex items-center gap-3 px-4 py-3">
                  <SearchIcon size={16} className="shrink-0 text-white/30" />
                  <button
                    type="button"
                    onClick={() => onSearch(item.query)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-white hover:text-[#1ed760]"
                  >
                    {item.query}
                  </button>
                  <span className="hidden text-[11px] text-white/30 sm:block">
                    {item.searched_at || item.searchedAt
                      ? new Date(item.searched_at ?? item.searchedAt ?? "").toLocaleDateString()
                      : item.platform ?? ""}
                  </span>
                  {item.id && (
                    <button
                      type="button"
                      aria-label={`Delete ${item.query}`}
                      onClick={() => void clearSearches(item.id)}
                      disabled={busyId !== null}
                      className="grid h-7 w-7 place-items-center rounded-full text-white/35 hover:bg-white/10 hover:text-white"
                    >
                      <XIcon size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {profile?.hasListeningData && (
            <div className="mt-8 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
              <h3 className="text-sm font-bold text-white">Personalised for you</h3>
              <p className="mt-1 text-xs text-white/45">
                Recommendations built from your real imported listening. Open Home to see them in rotation.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(stats?.topGenres ?? []).slice(0, 6).map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => onSearch(genre)}
                    className="rounded-full bg-white/[0.07] px-3 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/[0.12] hover:text-white"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {playlistDetail && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121212]">
            <div className="flex items-start gap-4 border-b border-white/[0.07] p-5">
              <MusicArtwork
                src={playlistDetail.playlist.artworkUrl}
                alt={playlistDetail.playlist.name}
                seed={playlistDetail.playlist.spotifyPlaylistId}
                className="h-20 w-20 shrink-0"
                iconSize={24}
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold text-white">{playlistDetail.playlist.name}</h2>
                <p className="mt-1 line-clamp-2 text-xs text-white/45">
                  {playlistDetail.playlist.description || playlistDetail.playlist.ownerName || "Spotify playlist"}
                </p>
                <p className="mt-2 text-[11px] text-white/40">
                  {playlistDetail.tracks.length} tracks · {playlistDetail.matchStats.matched} matched ·{" "}
                  {playlistDetail.matchStats.partial} partial · {playlistDetail.matchStats.unmatched} unmatched ·{" "}
                  {playlistDetail.pendingMatches} pending
                </p>
              </div>
              <button type="button" onClick={() => setPlaylistDetail(null)} aria-label="Close" className="text-white/40 hover:text-white">
                <XIcon size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {playlistDetail.tracks.slice(0, 20).map((track, index) => (
                <div key={`${track.spotifyTrackId}-${index}`} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <span className="w-5 text-right text-xs text-white/25">{index + 1}</span>
                  <MusicArtwork
                    src={track.youtubeTrack?.artworkUrl ?? track.artworkUrl}
                    alt={track.name}
                    seed={track.spotifyTrackId}
                    className="h-9 w-9 shrink-0"
                    iconSize={14}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{track.name}</p>
                    <p className="truncate text-[11px] text-white/40">{track.artistName}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    track.matchStatus === "matched" ? "bg-[#1ed760]/15 text-[#5be98b]" : "bg-white/[0.07] text-white/40"
                  }`}>
                    {matchLabel(track.matchStatus)}
                  </span>
                </div>
              ))}
              {playlistDetail.tracks.length > 20 && (
                <p className="px-2 py-2 text-[11px] text-white/35">Showing the first 20 tracks. The full list is preserved in Reelhouse.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/[0.07] p-4">
              <button
                type="button"
                onClick={() => setPlaylistDetail(null)}
                className="rounded-full px-4 py-2 text-xs font-bold text-white/55 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void openDetailInLibrary()}
                className="rounded-full bg-white px-5 py-2.5 text-xs font-bold text-black"
              >
                Open in Reelhouse
              </button>
            </div>
          </div>
        </div>
      )}

      {fixing && (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#121212] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Choose the right match</h2>
                <p className="mt-1 text-xs text-white/45">
                  “{fixing.name}” · {fixing.artistName}. Reelhouse never picks a result silently when confidence is low.
                </p>
              </div>
              <button type="button" onClick={() => setFixing(null)} aria-label="Close" className="text-white/40 hover:text-white">
                <XIcon size={18} />
              </button>
            </div>
            <div className="mt-4 max-h-[55vh] overflow-y-auto">
              {fixLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => <div key={index} className="music-skeleton h-12 rounded-md" />)}
                </div>
              ) : alternatives.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">No YouTube Music results found.</p>
              ) : (
                alternatives.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => void chooseMatch(fixing, candidate)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-white/[0.06]"
                  >
                    <MusicArtwork
                      src={candidate.artworkUrl}
                      alt={candidate.title}
                      seed={candidate.id}
                      className="h-10 w-10 shrink-0"
                      iconSize={16}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{candidate.title}</span>
                      <span className="block truncate text-xs text-white/45">
                        {candidate.artistName}{candidate.albumTitle ? ` · ${candidate.albumTitle}` : ""}
                      </span>
                    </span>
                    <span className="text-[11px] text-white/35">{duration(candidate.duration)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <MusicNoteIcon size={30} className="mx-auto text-white/25" />
      <h2 className="mt-3 text-lg font-bold text-white">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-white/40">{copy}</p>
    </div>
  );
}

function Result({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-white/35">{label}</dt>
      <dd className="mt-0.5 font-semibold text-white">{value.toLocaleString()}</dd>
    </div>
  );
}

function PreviewRows({ preview }: { preview: SpotifyImportPreview }) {
  const rows = [
    ["Playlists", preview.playlists],
    ["Playlist tracks", preview.playlistTracks],
    ["Liked songs", preview.likedSongs],
    ["Albums", preview.albums],
    ["Artists", preview.artists],
    ["Listening events", preview.listeningEvents],
    ["Searches", preview.searches],
    ["Files parsed", preview.parsedFiles],
  ] as const;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>
      {(preview.historyStart || preview.historyEnd) && (
        <p className="mt-2 text-[11px] text-white/40">
          History range: {preview.historyStart ? new Date(preview.historyStart).toLocaleDateString() : "unknown"} –{" "}
          {preview.historyEnd ? new Date(preview.historyEnd).toLocaleDateString() : "unknown"}
        </p>
      )}
      {preview.failedFiles > 0 && (
        <p className="mt-2 text-[11px] text-amber-300">{preview.failedFiles} file(s) could not be read and will be skipped.</p>
      )}
    </div>
  );
}
