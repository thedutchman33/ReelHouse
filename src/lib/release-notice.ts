import type { MoctaleEvent } from "@/lib/moctale";
import type { Media, UpcomingEpisode } from "@/types";

// ---------------------------------------------------------------------------
// Detail-hero release notice.
//
// One upcoming event per title, in this priority order:
//   movie  → theatrical release (Moctale's event date/count when available)
//   series → next episode → series premiere → next announced season
//
// Dates are inclusive: on the release/air date the notice is gone. The page is
// ISR-cached for an hour, so the boundary can lag a cached render by at most
// that revalidation window.
// ---------------------------------------------------------------------------

export type ReleaseNoticeKind = "theaters" | "premiere" | "season" | "episode";

export interface ReleaseNotice {
  kind: ReleaseNoticeKind;
  label: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Moctale interest count, when its event list has one for this date. */
  interested?: number;
  seasonNumber?: number;
  seasonName?: string;
  episode?: {
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    overview?: string;
  };
}

export type ReleaseNoticeMedia = Pick<Media, "type" | "releaseDate"> & {
  nextEpisodeToAir?: UpcomingEpisode | null;
  seasons?: { seasonNumber: number; name: string; airDate?: string }[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function theatricalEvents(events: readonly MoctaleEvent[]): MoctaleEvent[] {
  return events
    .filter(
      (event) =>
        !event.toBeConfirmed &&
        DATE_RE.test(event.date) &&
        /theat/i.test(`${event.type ?? ""} ${event.releaseType ?? ""}`)
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function interestedOn(
  events: readonly MoctaleEvent[],
  date: string
): number | undefined {
  const count = events
    .filter((event) => event.date === date && event.interested > 0)
    .reduce((best, event) => Math.max(best, event.interested), 0);
  return count > 0 ? count : undefined;
}

function episodeNotice(
  media: ReleaseNoticeMedia,
  next: UpcomingEpisode,
  today: string,
  events: readonly MoctaleEvent[]
): ReleaseNotice | null {
  if (!DATE_RE.test(next.airDate) || next.airDate <= today) return null;

  const interested = interestedOn(events, next.airDate);
  const episode = {
    seasonNumber: next.seasonNumber,
    episodeNumber: next.episodeNumber,
    title: next.title,
    ...(next.overview ? { overview: next.overview } : {}),
  };
  const firstEpisode = next.seasonNumber === 1 && next.episodeNumber === 1;
  const premiere =
    firstEpisode && (!media.releaseDate || media.releaseDate >= today);

  return {
    kind: premiere ? "premiere" : next.episodeNumber === 1 ? "season" : "episode",
    label: premiere
      ? "Series Premiere"
      : next.episodeNumber === 1
        ? "Next Season"
        : "Next Episode",
    date: next.airDate,
    ...(interested ? { interested } : {}),
    seasonNumber: next.seasonNumber,
    ...(premiere ? {} : { seasonName: `Season ${next.seasonNumber}` }),
    episode,
  };
}

/** Resolve the single card the detail hero should show, or null when there is none. */
export function buildReleaseNotice(
  media: ReleaseNoticeMedia,
  events: readonly MoctaleEvent[] = [],
  today = todayIso()
): ReleaseNotice | null {
  if (media.type === "movie") {
    const theatricals = theatricalEvents(events);
    const theatrical = theatricals.find((event) => event.date > today);

    // A Moctale theatrical date is authoritative: once it is today or past,
    // the film has opened, even if TMDB's date is a day later.
    if (theatricals.length > 0 && !theatrical) return null;

    const date = theatrical?.date ?? media.releaseDate;
    if (!date || !DATE_RE.test(date) || date <= today) return null;
    return {
      kind: "theaters",
      label: "Coming to Theaters",
      date,
      ...(theatrical?.interested
        ? { interested: theatrical.interested }
        : {}),
    };
  }

  if (media.type !== "tv") return null;

  if (media.nextEpisodeToAir) {
    return episodeNotice(media, media.nextEpisodeToAir, today, events);
  }

  // A show with no scheduled episode yet: its first air date is still a
  // premiere if it is in the future.
  if (
    media.releaseDate &&
    DATE_RE.test(media.releaseDate) &&
    media.releaseDate > today
  ) {
    const interested = interestedOn(events, media.releaseDate);
    return {
      kind: "premiere",
      label: "Series Premiere",
      date: media.releaseDate,
      ...(interested ? { interested } : {}),
    };
  }

  const nextSeason = (media.seasons ?? [])
    .filter(
      (season) =>
        season.airDate &&
        DATE_RE.test(season.airDate) &&
        season.airDate > today
    )
    .sort((a, b) => (a.airDate ?? "").localeCompare(b.airDate ?? ""))[0];

  if (nextSeason?.airDate) {
    const interested = interestedOn(events, nextSeason.airDate);
    return {
      kind: "season",
      label: "Next Season",
      date: nextSeason.airDate,
      seasonNumber: nextSeason.seasonNumber,
      seasonName: nextSeason.name,
      ...(interested ? { interested } : {}),
    };
  }

  return null;
}

/** Format an ISO date without letting the server's timezone shift the day. */
export function formatReleaseDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

/** 63103 → "63.1k", matching Moctale's compact interest label. */
export function formatInterestedCount(count: number): string {
  const value = Math.max(0, Math.round(count));
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}
