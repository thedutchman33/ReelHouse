"use client";

import { useEffect, useRef, useState } from "react";
import { colorFor } from "@/lib/music/utils";
import { MusicNoteIcon } from "./icons";

// Audius content is addressable by hash from several creator nodes. A single
// node occasionally answers 502, so retry the same image on a known mirror
// instead of losing the artwork.
const IMAGE_MIRRORS = [
  "audius-creator-7.theblueprint.xyz",
  "audius-creator-17.theblueprint.xyz",
  "val016.open-audio-validator.com",
  "audius-content-4.figment.io",
];

function imageCandidates(src?: string): string[] {
  if (!src) return [];
  try {
    const url = new URL(src);
    if (!url.pathname.startsWith("/content/")) return [src];
    const hosts = [url.host, ...IMAGE_MIRRORS.filter((host) => host !== url.host)];
    return hosts.map((host) => `${url.protocol}//${host}${url.pathname}`);
  } catch {
    return [src];
  }
}

export default function MusicArtwork({
  src,
  alt,
  seed,
  className = "",
  rounded = "rounded",
  iconSize = 28,
  priority = false,
  fallbackArtist,
  fallbackAlbum,
}: {
  src?: string;
  alt: string;
  seed?: string;
  className?: string;
  rounded?: string;
  iconSize?: number;
  priority?: boolean;
  /** Used only when the provider supplied no usable artwork. */
  fallbackArtist?: string;
  fallbackAlbum?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [coverFallback, setCoverFallback] = useState<string | null>(null);
  const [preferFallback, setPreferFallback] = useState(false);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const lookupKeyRef = useRef("");

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    setCoverFallback(null);
    setPreferFallback(false);
    setLookupAttempted(false);
    lookupKeyRef.current = "";
  }, [src, fallbackArtist, fallbackAlbum]);

  useEffect(() => {
    if (src && !failed) return;
    if (!fallbackArtist || !fallbackAlbum || lookupAttempted) return;

    const lookupKey = `${fallbackArtist}\u0000${fallbackAlbum}`;
    lookupKeyRef.current = lookupKey;
    setLookupAttempted(true);
    const params = new URLSearchParams({
      artist: fallbackArtist.slice(0, 160),
      album: fallbackAlbum.slice(0, 160),
    });

    // Do not abort in the effect cleanup. React Strict Mode replays effects in
    // development; letting the one lookup finish keeps the first replay from
    // consuming the attempt without producing artwork. The key guard ignores a
    // late response after the track or album changes.
    fetch(`/api/music/artwork?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { url?: unknown };
      })
      .then((data) => {
        if (lookupKeyRef.current !== lookupKey) return;
        if (typeof data?.url !== "string") return;
        if (!/^https:\/\/coverartarchive\.org\//.test(data.url)) return;
        setCoverFallback(data.url);
        setPreferFallback(true);
        setFailed(false);
        setAttempt(0);
      })
      .catch(() => {
        // Artwork is an enhancement. The deterministic placeholder remains.
      });
  }, [src, failed, fallbackArtist, fallbackAlbum, lookupAttempted]);

  const source = src && !preferFallback ? src : coverFallback ?? undefined;
  const candidates = imageCandidates(source);
  const activeSrc = candidates[attempt];
  const accent = colorFor(seed || alt);

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{
        background: `linear-gradient(145deg, ${accent} 0%, #121212 72%, #333 100%)`,
      }}
    >
      {activeSrc && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => {
            if (attempt + 1 < candidates.length) setAttempt(attempt + 1);
            else setFailed(true);
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-white/75">
          <MusicNoteIcon size={iconSize} />
        </span>
      )}
    </div>
  );
}
