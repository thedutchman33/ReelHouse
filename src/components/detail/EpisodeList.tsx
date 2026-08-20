"use client";

import { useState } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import { PlayIcon } from "@/components/player/icons";
import { useProgressEntry } from "@/lib/library";
import { formatRuntime } from "@/lib/utils";
import type { Episode, MediaSummary, Season } from "@/types";

function EpisodeRow({ media, episode }: { media: MediaSummary; episode: Episode }) {
  const entry = useProgressEntry(media.id, {
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
  });
  const pct =
    entry && entry.duration ? Math.min(100, Math.round((entry.position / entry.duration) * 100)) : 0;
  const runtime = formatRuntime(episode.runtime);
  const href = `/watch/${media.type}/${media.tmdbId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`;

  return (
    <Link
      href={href}
      className="group flex gap-4 rounded-xl border border-transparent p-2 transition hover:border-border hover:bg-surface/60"
    >
      <div className="still-frame w-36 shrink-0 rounded-lg border border-border sm:w-44">
        <PosterImage
          src={episode.stillUrl || media.backdropUrl}
          title={episode.title}
          type="tv"
          variant="backdrop"
          className="frame-img"
        />
        <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-ink">
            <PlayIcon size={18} />
          </span>
        </div>
        {pct > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate font-sans text-sm font-semibold tracking-normal text-text">
            {episode.episodeNumber}. {episode.title}
          </h3>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
            {entry?.completed && <span className="text-accent">Watched</span>}
            {runtime && <span>{runtime}</span>}
          </div>
        </div>
        {episode.overview && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{episode.overview}</p>
        )}
      </div>
    </Link>
  );
}

export default function EpisodeList({
  media,
  seasons,
}: {
  media: MediaSummary;
  seasons: Season[];
}) {
  const [selected, setSelected] = useState(seasons[0]?.seasonNumber ?? 1);
  const season = seasons.find((s) => s.seasonNumber === selected) ?? seasons[0];
  if (!season) return null;

  return (
    <section className="container-rh py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Episodes</h2>
        {seasons.length > 1 && (
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            aria-label="Select season"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text focus:border-accent focus:outline-none"
          >
            {seasons.map((s) => (
              <option key={s.seasonNumber} value={s.seasonNumber}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {season.episodes.map((ep) => (
          <EpisodeRow key={ep.id} media={media} episode={ep} />
        ))}
      </div>
    </section>
  );
}
