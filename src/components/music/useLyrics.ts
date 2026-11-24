"use client";

import { useEffect, useState } from "react";
import type { MusicTrack } from "@/lib/music/types";
import type { LyricLine } from "@/lib/music/lrc";

export interface LyricsPayload {
  lines: LyricLine[];
  plain: string | null;
  instrumental: boolean;
}

const cache = new Map<string, LyricsPayload>();

export function useLyrics(track: MusicTrack | null): {
  lyrics: LyricsPayload | null;
  loading: boolean;
  error: boolean;
} {
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      setLoading(false);
      setError(false);
      return;
    }

    const cached = cache.get(track.id);
    if (cached) {
      setLyrics(cached);
      setLoading(false);
      setError(false);
      return;
    }

    const controller = new AbortController();
    setLyrics(null);
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({
      artist: track.artistName,
      track: track.title,
    });
    if (track.albumTitle) params.set("album", track.albumTitle);
    if (track.duration) params.set("duration", String(track.duration));

    fetch(`/api/music/lyrics?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Lyrics unavailable");
        return (await response.json()) as LyricsPayload;
      })
      .then((payload) => {
        const clean: LyricsPayload = {
          lines: Array.isArray(payload.lines) ? payload.lines : [],
          plain: payload.plain ?? null,
          instrumental: Boolean(payload.instrumental),
        };
        cache.set(track.id, clean);
        setLyrics(clean);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [
    track,
    track?.id,
    track?.artistName,
    track?.title,
    track?.albumTitle,
    track?.duration,
  ]);

  return { lyrics, loading, error };
}
