import type { MusicTrack } from "./types";

/** Kept only for the inactive legacy Audius adapter so old files still compile. */
export function audiusStreamUrl(trackId: string, appName = "ReelhouseMusic"): string {
  return `https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=${encodeURIComponent(appName)}`;
}

/**
 * All playable audio is resolved through the same-origin range proxy. The
 * backend resolves a fresh YouTube Music audio stream and proxies byte ranges,
 * so signed googlevideo URLs are never exposed to the browser or stored in
 * library snapshots. Spotify-sourced items without a confirmed YouTube match
 * remain visible but unplayable.
 */
export function streamUrlForTrack(track: MusicTrack): string | null {
  if (track.provider === "spotify" || track.isStreamable === false) return null;
  const videoId =
    track.videoId ??
    track.providerId?.replace(/^youtube:/, "") ??
    track.id.replace(/^youtube:/, "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return `/api/music/stream?provider=youtube&id=${encodeURIComponent(videoId)}`;
}
