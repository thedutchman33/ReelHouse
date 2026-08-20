"use client";

import Link from "next/link";
import { useLatestProgressFor } from "@/lib/library";
import type { MediaSummary } from "@/types";

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

/** Primary play action that becomes "Resume" when there's saved progress. */
export default function PlayButton({ media }: { media: MediaSummary }) {
  const latest = useLatestProgressFor(media.id);
  const base = `/watch/${media.type}/${media.tmdbId}`;

  let href = base;
  let label = "Play";
  if (latest && !latest.completed && latest.position > 5) {
    label = "Resume";
    const params = new URLSearchParams();
    if (latest.episode) {
      params.set("s", String(latest.episode.seasonNumber));
      params.set("e", String(latest.episode.episodeNumber));
    }
    params.set("t", String(Math.floor(latest.position)));
    href = `${base}?${params.toString()}`;
  }

  return (
    <Link href={href} className="btn-primary">
      <PlayIcon /> {label}
    </Link>
  );
}
