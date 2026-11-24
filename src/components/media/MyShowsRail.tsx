"use client";

import Link from "next/link";
import { useMemo } from "react";
import PosterImage from "@/components/media/PosterImage";
import { BellIcon, ChevronRightIcon } from "@/components/library/icons";
import { useTrackingUpcoming } from "@/components/notifications/use-tracking-upcoming";
import { monthKey } from "@/lib/calendar";
import { useTracked, type TrackedEntry } from "@/lib/library";
import {
  daysUntil,
  episodeCoordinate,
  episodeWhen,
  trackedTmdbId,
  trackedTmdbIds,
  type TrackedEpisodeInfo,
  type TrackedShowStatus,
} from "@/lib/tracking";

interface ShowCard {
  entry: TrackedEntry;
  show?: TrackedShowStatus;
  episode: TrackedEpisodeInfo | null;
  upcoming: boolean;
}

function sortDate(card: ShowCard): string {
  return card.episode?.airDate ?? "9999-12-31";
}

/** A home rail of followed shows with their next episode and a countdown. */
export default function MyShowsRail() {
  const tracked = useTracked();
  const ids = useMemo(() => trackedTmdbIds(tracked), [tracked]);
  const { shows } = useTrackingUpcoming(ids, monthKey());

  const cards = useMemo(() => {
    const byTmdb = new Map(shows.map((show) => [show.tmdbId, show]));
    return tracked
      .map((entry): ShowCard | null => {
        const id = trackedTmdbId(entry.media);
        const show = id ? byTmdb.get(id) : undefined;
        const episode =
          show?.nextEpisode ?? show?.lastEpisode ?? show?.monthEpisodes[0] ?? null;
        return {
          entry,
          show,
          episode,
          upcoming: Boolean(episode && daysUntil(episode.airDate) >= 0),
        };
      })
      .filter((card): card is ShowCard => card !== null)
      .sort((a, b) => sortDate(a).localeCompare(sortDate(b)))
      .slice(0, 14);
  }, [tracked, shows]);

  if (cards.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="my-shows-label">
      <div className="mb-3 flex items-end justify-between gap-4 px-6 md:px-16">
        <div>
          <p className="eyebrow mb-1">Following</p>
          <h2
            id="my-shows-label"
            className="font-display text-3xl uppercase tracking-wide text-text sm:text-4xl"
          >
            My Shows
          </h2>
        </div>
        <Link
          href="/calendar?view=tracking"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted transition hover:text-text"
        >
          See all
          <ChevronRightIcon size={14} />
        </Link>
      </div>

      <div className="row-scroll px-6 md:px-16">
        {cards.map(({ entry, show, episode, upcoming }) => {
          const soon =
            episode && daysUntil(episode.airDate) >= 0 && daysUntil(episode.airDate) <= 7;
          return (
            <div
              key={entry.media.id}
              className="rail-item w-[132px] shrink-0 sm:w-[150px]"
            >
              <Link
                href={`/${entry.media.type}/${entry.media.tmdbId}`}
                prefetch={false}
                className="group block"
              >
                <div className="poster-frame">
                  <PosterImage
                    src={entry.media.posterUrl}
                    title={entry.media.title}
                    type={entry.media.type}
                    className="poster-img"
                  />
                  {episode && (
                    <span
                      className={`absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold shadow-lg backdrop-blur ${
                        soon
                          ? "bg-accent text-accent-ink"
                          : "bg-black/65 text-white"
                      }`}
                    >
                      <BellIcon size={10} fill="currentColor" />
                      {upcoming ? episodeWhen(episode.airDate) : "Aired"}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 truncate text-[13px] font-semibold text-text">
                  {entry.media.title}
                </h3>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  {episode
                    ? `${episodeCoordinate(episode)}${show?.status ? ` · ${show.status}` : ""}`
                    : show?.status ?? "Schedule unavailable"}
                </p>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
