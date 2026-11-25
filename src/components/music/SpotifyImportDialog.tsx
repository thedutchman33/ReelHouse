"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MusicTrack } from "@/lib/music/types";
import type { SpotifyImportPreview, SpotifyImportResult } from "@/lib/music/spotify-types";
import {
  parseSpotifyPlaylistLink,
  type SpotifyPlaylistLink,
} from "@/lib/music/spotify-url";
import {
  parseManualTracklist,
  parseTracklistFile,
  TRACKLIST_FILE_ACCEPT,
  type ParsedTracklist,
  type ParsedTracklistEntry,
} from "@/lib/music/spotify-tracklist";
import { musicApiFetch } from "@/lib/music/client";
import { formatTrackCount } from "@/lib/music/utils";
import { toast } from "@/lib/toast";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { DialogShell } from "./MusicDialogs";
import {
  CheckCircleIcon,
  CheckIcon,
  DownloadIcon,
  ExternalIcon,
  PlayIcon,
  SearchIcon,
  SpotifyIcon,
  XIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";

type SourceTab = "manual" | "file" | "zip";
type MatchStatus = "matched" | "partial" | "unmatched";

interface MatchedRow {
  entry: ParsedTracklistEntry;
  status: MatchStatus;
  confidence: number;
  track?: MusicTrack;
}

interface ImportOutcome {
  mode: "embed" | "tracklist";
  playlistId: string;
  total: number;
  matched: number;
  unavailable: number;
}

const MATCH_CHUNK = 10;

function statusLabel(status: MatchStatus): string {
  if (status === "matched") return "Matched";
  if (status === "partial") return "Partial match";
  return "Unavailable";
}

function normalizeStatus(value: string | undefined): MatchStatus {
  return value === "matched" || value === "partial" ? value : "unmatched";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function SpotifyImportDialog({
  onClose,
  onOpenPlaylist,
}: {
  onClose: () => void;
  onOpenPlaylist: (playlistId: string) => void;
}) {
  const {
    createImportedPlaylist,
    replacePlaylistTracks,
    findPlaylistByExternalId,
    linkSpotifyPlaylist,
    refreshLibrary,
  } = useMusicLibrary();

  const [input, setInput] = useState("");
  const [link, setLink] = useState<SpotifyPlaylistLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [title, setTitle] = useState("Spotify playlist");
  const [description, setDescription] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>("manual");
  const [manual, setManual] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedTracklist | null>(null);
  const [rows, setRows] = useState<MatchedRow[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fixing, setFixing] = useState<number | null>(null);
  const [fixQuery, setFixQuery] = useState("");
  const [fixResults, setFixResults] = useState<MusicTrack[]>([]);
  const [fixLoading, setFixLoading] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState("");
  const [zipPreview, setZipPreview] = useState<SpotifyImportPreview | null>(null);

  const matchAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const existing = link ? findPlaylistByExternalId(link.uri) : undefined;
  const matchedCount = rows?.filter((row) => row.status !== "unmatched").length ?? 0;
  const unmatchedCount = (rows?.length ?? 0) - matchedCount;

  useEffect(() => {
    return () => matchAbortRef.current?.abort();
  }, []);

  const submitLink = useCallback(
    (raw?: string) => {
      const result = parseSpotifyPlaylistLink(raw ?? input);
      if (!result.ok) {
        setLink(null);
        setLinkError(result.error);
        return;
      }
      setLinkError(null);
      setLink(result.link);
      setNotice(null);
      setOutcome(null);
      const match = findPlaylistByExternalId(result.link.uri);
      if (match) {
        setTitle(match.title);
        setDescription(match.description);
      }
    },
    [findPlaylistByExternalId, input]
  );

  function changeInput(value: string) {
    setInput(value);
    setLink(null);
    setLinkError(null);
    setParsed(null);
    setRows(null);
    setOutcome(null);
    setZipPreview(null);
  }

  async function runMatching(entries: ParsedTracklistEntry[]) {
    matchAbortRef.current?.abort();
    const controller = new AbortController();
    matchAbortRef.current = controller;
    setRows(
      entries.map((entry) => ({
        entry,
        status: "unmatched" as const,
        confidence: 0,
      }))
    );
    setMatching(true);
    setMatchProgress(`Matching ${entries.length} tracks with YouTube Music…`);

    for (let start = 0; start < entries.length; start += MATCH_CHUNK) {
      if (controller.signal.aborted) break;
      const chunk = entries.slice(start, start + MATCH_CHUNK);
      setMatchProgress(
        `Matching ${start + 1}–${Math.min(start + chunk.length, entries.length)} of ${entries.length}…`
      );
      try {
        const response = await fetch("/api/music/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            tracks: chunk.map((entry) => ({
              title: entry.name,
              artist: entry.artists.join(", "),
              album: entry.album,
              durationMs: entry.durationMs ?? 0,
            })),
          }),
        });
        if (!response.ok) throw new Error("matching unavailable");
        const data = (await response.json()) as {
          matches?: Array<{
            index: number;
            status: string;
            confidence: number;
            track?: MusicTrack;
          }>;
        };
        setRows((current) => {
          if (!current) return current;
          const next = [...current];
          for (const match of data.matches ?? []) {
            const position = start + match.index;
            if (!next[position]) continue;
            next[position] = {
              entry: next[position].entry,
              status: normalizeStatus(match.status),
              confidence: Number.isFinite(match.confidence) ? match.confidence : 0,
              track: match.track,
            };
          }
          return next;
        });
      } catch (error) {
        if (controller.signal.aborted) break;
        if (error instanceof DOMException && error.name === "AbortError") break;
        toast("Automatic matching stopped. You can still import unmatched entries.", {
          durationMs: 5200,
        });
        break;
      }
    }

    setMatching(false);
    setMatchProgress("");
    matchAbortRef.current = null;
  }

  function cancelMatching() {
    matchAbortRef.current?.abort();
    matchAbortRef.current = null;
    setMatching(false);
    setMatchProgress("");
    toast("Matching stopped. Entries matched so far are kept.");
  }

  function acceptTracklist(next: ParsedTracklist, origin: "manual" | "file" | "zip") {
    setParsed(next);
    setOutcome(null);
    setNotice(null);
    if (next.playlistName) setTitle(next.playlistName);
    if (next.playlistDescription) setDescription(next.playlistDescription);
    setSourceTab(origin === "zip" ? sourceTab : origin);
    if (next.entries.length === 0) {
      setRows(null);
      setNotice(
        next.warnings[0] ?? "No tracks were found. Use one entry per line: Song Title - Artist Name."
      );
      return;
    }
    void runMatching(next.entries);
  }

  function readManual() {
    acceptTracklist(parseManualTracklist(manual), "manual");
  }

  async function readFile(file: File) {
    setFileName(file.name);
    try {
      const content = await file.text();
      acceptTracklist(parseTracklistFile(file.name, content), "file");
    } catch {
      setNotice("That file could not be read. Try a JSON, CSV or TXT tracklist.");
    }
  }

  async function importZip() {
    if (!link || !zipFile) return;
    setZipBusy(true);
    setZipPreview(null);
    setZipProgress("Reading the Spotify account-data ZIP…");
    try {
      const previewResponse = await musicApiFetch("/api/spotify/import/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/zip",
          "X-Import-Archive-Name": encodeURIComponent(zipFile.name),
        },
        body: zipFile,
      });
      if (!previewResponse.ok) {
        const body = (await previewResponse
          .json()
          .catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Spotify could not read that ZIP.");
      }
      const preview = (await previewResponse.json()) as SpotifyImportPreview;
      setZipPreview(preview);
      if (preview.playlists === 0) {
        throw new Error(
          "No playlists were found in that ZIP. Request Account Data from Spotify and include Playlist1.json."
        );
      }

      setZipProgress(`Importing ${preview.playlists} playlists from Spotify…`);
      const importResponse = await musicApiFetch("/api/spotify/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/zip",
          "X-Import-Archive-Name": encodeURIComponent(zipFile.name),
          "X-Import-Categories": "playlists",
          "X-Import-Final": "true",
        },
        body: zipFile,
      });
      if (!importResponse.ok) {
        const body = (await importResponse
          .json()
          .catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Spotify could not import that ZIP.");
      }
      const result = (await importResponse.json()) as SpotifyImportResult;
      const spotifyId = link.id;

      setZipProgress(
        `Imported ${result.importedPlaylists} playlists. Linking the playlist to your Spotify URL…`
      );
      const libraryId = await linkSpotifyPlaylist(link.uri, {
        externalUrl: link.url,
        importMode: "tracklist",
      });
      if (!libraryId) {
        setNotice(
          "Spotify data imported, but this URL's playlist was not inside that ZIP. Use Paste tracklist or Upload file for this link."
        );
        setZipProgress("");
        setZipBusy(false);
        return;
      }

      setZipProgress("Matching tracks with YouTube Music…");
      let matched = 0;
      let unavailable = 0;
      let pending = 1;
      for (let batch = 0; batch < 6 && pending > 0; batch += 1) {
        const response = await musicApiFetch(
          `/api/spotify/playlists/${encodeURIComponent(spotifyId)}/matches?limit=50`,
          { method: "POST" }
        );
        if (!response.ok) break;
        const stats = (await response.json()) as {
          attempted: number;
          matched: number;
          partial: number;
          unmatched: number;
          unavailable: number;
          pending: number;
        };
        matched = stats.matched + stats.partial;
        unavailable = stats.unmatched + stats.unavailable;
        pending = stats.pending;
        if (stats.attempted === 0) break;
        setZipProgress(
          `Matching with YouTube Music… ${matched} available, ${stats.pending} remaining`
        );
      }

      await refreshLibrary();
      setOutcome({
        mode: "tracklist",
        playlistId: libraryId,
        total: matched + unavailable,
        matched,
        unavailable,
      });
      setZipProgress("");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The Spotify ZIP could not be imported.", {
        durationMs: 6000,
      });
      setZipProgress("");
    } finally {
      setZipBusy(false);
    }
  }

  function linkOnly() {
    if (!link) return;
    if (existing) {
      onOpenPlaylist(existing.id);
      onClose();
      return;
    }
    const playlist = createImportedPlaylist({
      title: title.trim() || "Spotify playlist",
      description,
      tracks: [],
      externalId: link.uri,
      externalUrl: link.url,
      importMode: "embed",
    });
    setOutcome({
      mode: "embed",
      playlistId: playlist.id,
      total: 0,
      matched: 0,
      unavailable: 0,
    });
  }

  function buildTracks(): MusicTrack[] {
    if (!rows || !link) return [];
    return rows.map((row, index) => {
      if (row.track) {
        return {
          ...row.track,
          source: "spotify",
          matchStatus: row.status,
          matchConfidence: row.confidence,
          isStreamable: true,
        };
      }
      const artistName = row.entry.artists.join(", ") || "Unknown artist";
      return {
        id: `spotify:import:${row.entry.spotifyTrackId ?? link.id}:${index}`,
        title: row.entry.name,
        artistId: `spotify:artist:${slug(artistName) || "unknown"}`,
        artistName,
        albumTitle: row.entry.album,
        artworkUrl: existing?.imageUrl ?? undefined,
        duration: row.entry.durationMs ? Math.round(row.entry.durationMs / 1000) : 0,
        isStreamable: false,
        source: "spotify",
        matchStatus: "unmatched",
        matchConfidence: 0,
      } satisfies MusicTrack;
    });
  }

  function saveNative() {
    if (!link || !rows) return;
    setSaving(true);
    const tracks = buildTracks();
    const target = existing;
    if (target) {
      replacePlaylistTracks(target.id, tracks);
      void linkSpotifyPlaylist(link.uri, {
        externalUrl: link.url,
        importMode: "tracklist",
      });
      setOutcome({
        mode: "tracklist",
        playlistId: target.id,
        total: tracks.length,
        matched: matchedCount,
        unavailable: unmatchedCount,
      });
    } else {
      const playlist = createImportedPlaylist({
        title: title.trim() || "Spotify playlist",
        description,
        tracks,
        externalId: link.uri,
        externalUrl: link.url,
        importMode: "tracklist",
      });
      setOutcome({
        mode: "tracklist",
        playlistId: playlist.id,
        total: tracks.length,
        matched: matchedCount,
        unavailable: unmatchedCount,
      });
    }
    setSaving(false);
  }

  function chooseFix(track: MusicTrack) {
    if (fixing === null) return;
    setRows((current) => {
      if (!current) return current;
      return current.map((row, index) =>
        index === fixing
          ? { ...row, status: "matched" as const, confidence: 1, track }
          : row
      );
    });
    setFixing(null);
    setFixQuery("");
    setFixResults([]);
  }

  useEffect(() => {
    if (fixing === null) return;
    const clean = fixQuery.trim();
    if (clean.length < 2) {
      setFixResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFixLoading(true);
      fetch(`/api/music/search?q=${encodeURIComponent(clean)}&limit=8`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search unavailable");
          return (await response.json()) as { tracks?: MusicTrack[] };
        })
        .then((data) => setFixResults((data.tracks ?? []).slice(0, 8)))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setFixResults([]);
        })
        .finally(() => setFixLoading(false));
    }, 260);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fixing, fixQuery]);

  const warningText = useMemo(() => {
    if (!parsed) return "";
    return [...(parsed.warnings ?? []), ...(notice ? [notice] : [])].join(" ");
  }, [notice, parsed]);

  return (
    <DialogShell
      title="Import from Spotify"
      subtitle="Paste a Spotify playlist link. No Premium, Spotify login or developer API is required."
      onClose={() => {
        matchAbortRef.current?.abort();
        onClose();
      }}
      width="760px"
    >
      <div className="music-import-body">
        {!outcome && (
          <form
            className="music-import-link"
            onSubmit={(event) => {
              event.preventDefault();
              submitLink();
            }}
          >
            <label htmlFor="spotify-playlist-url" className="music-import-label">
              Spotify playlist link
            </label>
            <div className="music-import-link-row">
              <div className="music-import-link-field">
                <span className="music-import-link-icon" aria-hidden="true">
                  <SpotifyIcon size={19} />
                </span>
                <input
                  id="spotify-playlist-url"
                  value={input}
                  onChange={(event) => changeInput(event.target.value.slice(0, 500))}
                  placeholder="Paste your Spotify playlist link here"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={linkError ? true : undefined}
                  aria-describedby={linkError ? "spotify-link-error" : undefined}
                />
              </div>
              <button type="submit" className="music-import-primary">
                Check link
              </button>
            </div>
            {linkError && (
              <p id="spotify-link-error" className="music-import-error" role="alert">
                {linkError}
              </p>
            )}
            {link && (
              <p className="music-import-valid">
                <CheckCircleIcon size={16} /> Playlist link validated · {link.uri}
              </p>
            )}
          </form>
        )}

        {link && !outcome && (
          <>
            <div className="music-import-embed">
              <div className="music-import-embed-head">
                <span>
                  <SpotifyIcon size={17} /> Official Spotify embed
                </span>
                <a href={link.url} target="_blank" rel="noreferrer">
                  Open on Spotify <ExternalIcon size={13} />
                </a>
              </div>
              <iframe
                src={link.embedUrl}
                title="Spotify playlist preview"
                width="100%"
                height={352}
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              />
              <p className="music-import-embed-note">
                The embed is provided by Spotify. Its tracklist is not readable by Reelhouse,
                so this preview does not create a native track list.
              </p>
            </div>

            {existing && (
              <div className="music-import-duplicate">
                <div>
                  <strong>Already in Your Library</strong>
                  <p>
                    “{existing.title}” was imported from this Spotify playlist. Open it, or
                    replace its tracklist with a new import.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="music-import-secondary"
                    onClick={() => {
                      onOpenPlaylist(existing.id);
                      onClose();
                    }}
                  >
                    Open playlist
                  </button>
                  <button
                    type="button"
                    className="music-import-secondary"
                    onClick={() => {
                      setSourceTab("manual");
                      setNotice("Provide the new tracklist below to replace the existing order.");
                      document
                        .getElementById("spotify-import-tracks")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Replace tracklist
                  </button>
                </div>
              </div>
            )}

            <section id="spotify-import-tracks" className="music-import-tracks">
              <div className="music-import-section-head">
                <div>
                  <h3>Create a native Reelhouse playlist</h3>
                  <p>
                    Optional. Provide the playlist's track list so Reelhouse can match each
                    song to YouTube Music and keep the original order.
                  </p>
                </div>
              </div>

              <div className="music-import-tabs" role="tablist" aria-label="Tracklist source">
                {(
                  [
                    ["manual", "Paste tracklist"],
                    ["file", "Upload file"],
                    ["zip", "Spotify ZIP"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={sourceTab === value}
                    data-active={sourceTab === value || undefined}
                    className="music-import-tab"
                    onClick={() => setSourceTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sourceTab === "manual" && (
                <div className="music-import-pane">
                  <label htmlFor="spotify-manual-tracks" className="music-import-label">
                    One track per line: Song Title - Artist Name
                  </label>
                  <textarea
                    id="spotify-manual-tracks"
                    value={manual}
                    onChange={(event) => setManual(event.target.value.slice(0, 60_000))}
                    rows={6}
                    spellCheck={false}
                    placeholder={"Kesariya - Arijit Singh\nTum Hi Ho - Arijit Singh\nBrown Munde - AP Dhillon"}
                    className="music-modal-input music-import-textarea"
                  />
                  <div className="music-import-actions">
                    <button
                      type="button"
                      className="music-import-primary"
                      disabled={!manual.trim() || matching}
                      onClick={readManual}
                    >
                      Read tracklist
                    </button>
                  </div>
                </div>
              )}

              {sourceTab === "file" && (
                <div className="music-import-pane">
                  <p className="music-import-help">
                    A JSON, CSV or TXT file with titles and artists. Reelhouse reads it in your
                    browser; the file is not uploaded to Spotify.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={TRACKLIST_FILE_ACCEPT}
                    className="music-import-file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void readFile(file);
                    }}
                  />
                  {fileName && <p className="music-import-help">Selected: {fileName}</p>}
                </div>
              )}

              {sourceTab === "zip" && (
                <div className="music-import-pane">
                  <p className="music-import-help">
                    Use your existing Spotify account-data ZIP. Playlists, names and track
                    order are imported, and this link is attached to the matching playlist.
                    No Spotify login is required.
                  </p>
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="music-import-file"
                    onChange={(event) => {
                      setZipFile(event.target.files?.[0] ?? null);
                      setZipPreview(null);
                    }}
                  />
                  {zipFile && (
                    <p className="music-import-help">Selected: {zipFile.name}</p>
                  )}
                  {zipPreview && (
                    <p className="music-import-help">
                      Detected {zipPreview.playlists} playlists and{" "}
                      {formatTrackCount(zipPreview.playlistTracks)} across this ZIP.
                    </p>
                  )}
                  <div className="music-import-actions">
                    <button
                      type="button"
                      className="music-import-primary"
                      disabled={!zipFile || zipBusy}
                      onClick={() => void importZip()}
                    >
                      {zipBusy ? "Importing…" : "Import playlists from ZIP"}
                    </button>
                  </div>
                  {zipProgress && (
                    <p className="music-import-progress" aria-live="polite">
                      {zipProgress}
                    </p>
                  )}
                </div>
              )}

              {warningText && <p className="music-import-warning">{warningText}</p>}
            </section>
          </>
        )}

        {parsed && rows && !outcome && (
          <section className="music-import-preview">
            <div className="music-import-preview-head">
              <div>
                <h3>Review before saving</h3>
                <p>
                  {formatTrackCount(rows.length)} supplied · {parsed.duplicates} duplicate
                  {parsed.duplicates === 1 ? "" : "s"} skipped
                </p>
              </div>
              <div className="music-import-stats">
                <span data-tone="ok">{matchedCount} matched</span>
                <span data-tone="warn">{unmatchedCount} unavailable</span>
              </div>
            </div>

            <div className="music-import-fields">
              <label>
                <span className="music-import-label">Playlist name</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                  maxLength={120}
                  className="music-modal-input"
                />
              </label>
              <label>
                <span className="music-import-label">
                  Description <span className="music-import-optional">(optional)</span>
                </span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 500))}
                  maxLength={500}
                  className="music-modal-input"
                />
              </label>
            </div>

            {(matching || matchProgress) && (
              <div className="music-import-matching" aria-live="polite">
                <span className="music-spin" aria-hidden="true" />
                <span>{matchProgress}</span>
                {matching && (
                  <button type="button" onClick={cancelMatching}>
                    Cancel
                  </button>
                )}
              </div>
            )}

            <div className="music-import-rows">
              {rows.map((row, index) => (
                <div
                  key={`${row.entry.name}-${index}`}
                  className="music-import-row"
                  data-status={row.status}
                >
                  <span className="music-import-row-index">{index + 1}</span>
                  <MusicArtwork
                    src={row.track?.artworkUrl}
                    alt=""
                    seed={row.entry.spotifyTrackId ?? `${row.entry.name}-${index}`}
                    className="music-import-row-art"
                    iconSize={14}
                  />
                  <span className="music-import-row-copy">
                    <strong>{row.entry.name}</strong>
                    <span>
                      {row.entry.artists.join(", ") || "Unknown artist"}
                      {row.entry.album ? ` · ${row.entry.album}` : ""}
                    </span>
                  </span>
                  <span className="music-import-row-status">{statusLabel(row.status)}</span>
                  {row.status !== "matched" ? (
                    <button
                      type="button"
                      className="music-import-fix"
                      title={
                        row.status === "partial"
                          ? "Partial match — choose a better result"
                          : "Choose a YouTube Music match"
                      }
                      onClick={() => {
                        setFixing(index);
                        setFixQuery(
                          `${row.entry.name} ${row.entry.artists[0] ?? ""}`.trim()
                        );
                        setFixResults([]);
                      }}
                    >
                      {row.status === "partial" ? "Fix match" : "Find match"}
                    </button>
                  ) : (
                    row.track && (
                      <a
                        href={`https://music.youtube.com/watch?v=${row.track.videoId ?? ""}`}
                        target="_blank"
                        rel="noreferrer"
                        className="music-import-fix"
                        title="Open the matched track on YouTube Music"
                      >
                        <PlayIcon size={12} /> Check
                      </a>
                    )
                  )}
                </div>
              ))}
            </div>

            <div className="music-import-footer">
              <button
                type="button"
                className="music-import-secondary"
                onClick={() => {
                  matchAbortRef.current?.abort();
                  setParsed(null);
                  setRows(null);
                  setNotice(null);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="music-import-primary"
                disabled={saving || matching || rows.length === 0}
                onClick={saveNative}
              >
                {saving
                  ? "Saving…"
                  : existing
                    ? "Replace playlist tracks"
                    : "Create playlist"}
              </button>
            </div>
          </section>
        )}

        {link && !outcome && (
          <div className="music-import-footer music-import-footer-link">
            <p>
              Only the link? Save it as an external Spotify playlist. The official embed stays
              available in Reelhouse.
            </p>
            <button
              type="button"
              className="music-import-secondary"
              onClick={linkOnly}
            >
              {existing ? "Open existing playlist" : "Save Spotify link"}
            </button>
          </div>
        )}

        {outcome && (
          <div className="music-import-outcome">
            <span className="music-import-outcome-icon" data-mode={outcome.mode}>
              {outcome.mode === "tracklist" ? (
                <CheckCircleIcon size={30} />
              ) : (
                <SpotifyIcon size={30} />
              )}
            </span>
            <h3>
              {outcome.mode === "tracklist"
                ? "Native Reelhouse playlist ready"
                : "Spotify playlist linked successfully"}
            </h3>
            {outcome.mode === "tracklist" ? (
              <p>
                {outcome.matched} of {outcome.total} tracks are available to play.{" "}
                {outcome.unavailable > 0
                  ? `${outcome.unavailable} unmatched ${outcome.unavailable === 1 ? "entry is" : "entries are"} preserved as unavailable.`
                  : "Every supplied entry was matched."}
              </p>
            ) : (
              <p>
                The official Spotify embed is available below the playlist header. To create a
                native Reelhouse playlist, provide its tracklist or import your Spotify
                account-data ZIP.
              </p>
            )}
            <div className="music-import-actions">
              <button
                type="button"
                className="music-import-secondary"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                className="music-import-primary"
                onClick={() => {
                  onOpenPlaylist(outcome.playlistId);
                  onClose();
                }}
              >
                Open playlist
              </button>
            </div>
          </div>
        )}
      </div>

      {fixing !== null && (
        <div className="music-import-fix-panel" role="dialog" aria-label="Choose a match">
          <div className="music-import-fix-head">
            <div>
              <strong>Choose the right YouTube Music match</strong>
              <p>
                “{rows?.[fixing]?.entry.name}” · {rows?.[fixing]?.entry.artists.join(", ")}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close match search"
              onClick={() => setFixing(null)}
            >
              <XIcon size={16} />
            </button>
          </div>
          <label className="music-import-fix-search">
            <SearchIcon size={16} />
            <input
              value={fixQuery}
              onChange={(event) => setFixQuery(event.target.value)}
              autoFocus
              placeholder="Search YouTube Music"
              aria-label="Search YouTube Music for a match"
            />
          </label>
          <div className="music-import-fix-results">
            {fixLoading ? (
              <p>Searching…</p>
            ) : fixResults.length === 0 ? (
              <p>No results yet. Try a shorter title or the artist name.</p>
            ) : (
              fixResults.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => chooseFix(candidate)}
                >
                  <MusicArtwork
                    src={candidate.artworkUrl}
                    alt=""
                    seed={candidate.id}
                    className="music-import-row-art"
                    iconSize={14}
                  />
                  <span>
                    <strong>{candidate.title}</strong>
                    <span>
                      {candidate.artistName}
                      {candidate.albumTitle ? ` · ${candidate.albumTitle}` : ""}
                    </span>
                  </span>
                  <CheckIcon size={16} />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {outcome?.mode === "embed" && link && (
        <div className="sr-only" aria-live="polite">
          Spotify playlist linked. The official embed is shown in the playlist view.
        </div>
      )}
      {!link && (
        <div className="music-import-hint">
          <DownloadIcon size={15} />
          <span>
            Spotify's embed is shown as provided. Reelhouse never downloads Spotify audio or
            fabricates a tracklist.
          </span>
        </div>
      )}
    </DialogShell>
  );
}
