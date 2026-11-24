// Shared tracking model and pure helpers.
//
// Tracking (a.k.a. Following) is the set of series whose new episodes should
// appear in the calendar and in the notification surfaces. This module stays
// client-safe: the TMDB fetcher lives in release-calendar.ts, so grouping and
// notification rules can be unit-tested without a network or a browser.

import { todayKey } from "@/lib/calendar";
import type { MediaSummary } from "@/types";

/** The calendar/tracking endpoints budget one request per followed show. */
export const MAX_TRACKED_CALENDAR_IDS = 100;

/** Per-show alert preference. */
export type TrackingNotify = "all" | "premieres" | "off";

export interface TrackedEpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string;
  stillUrl?: string;
}

/** One followed show's schedule metadata, as returned by the tracking API. */
export interface TrackedShowStatus {
  tmdbId: number;
  name: string;
  /** TMDB status, e.g. "Returning Series", "Ended", "Canceled". */
  status: string;
  nextEpisode: TrackedEpisodeInfo | null;
  lastEpisode: TrackedEpisodeInfo | null;
  /** Episodes airing in the month the caller asked for. */
  monthEpisodes: TrackedEpisodeInfo[];
}

export interface NextUpEpisode {
  tmdbId: number;
  title: string;
  airDate: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
}

export interface TrackedUpcomingResponse {
  month: string;
  shows: TrackedShowStatus[];
  items: unknown[];
  nextUp: NextUpEpisode | null;
  /** True when the caller supplied more ids than the server will fetch. */
  truncated?: boolean;
}

export interface TrackingNotification {
  key: string;
  kind: "next" | "new" | "live";
  title: string;
  body: string;
  href: string;
  date: string;
  /** Absent on live channel alerts, which have no catalog media. */
  tmdbId?: number;
  mediaId?: string;
  media?: MediaSummary;
  /** Present on live F1 / cricket alerts. */
  sport?: "f1" | "cricket";
  /** Present on live alerts; epoch ms when the watch window closes. */
  expiresAt?: number;
}

export interface TrackingWatchProgress {
  mediaId: string;
  updatedAt: number;
  episode?: { seasonNumber: number; episodeNumber: number } | null;
}

export function isTrackableType(type: MediaSummary["type"]): boolean {
  return type === "tv" || type === "anime";
}

/**
 * The TMDB id a followed show is matched by in the release calendar. Anime
 * tracks by its AniList id but the calendar is TMDB-backed, so use the resolved
 * TMDB twin when one exists.
 */
export function trackedTmdbId(media: MediaSummary): number | null {
  if (!isTrackableType(media.type)) return null;
  // An anime's `tmdbId` is an AniList id. Only a resolved TMDB twin can be
  // matched against the TMDB-backed calendar — falling back to the AniList id
  // would silently match an unrelated show.
  if (media.type === "anime") {
    const resolved = media.resolvedTmdbId;
    return resolved && Number.isInteger(resolved) && resolved > 0 ? resolved : null;
  }
  return Number.isInteger(media.tmdbId) && media.tmdbId > 0 ? media.tmdbId : null;
}

/** Deduped, capped list of calendar ids for a set of followed entries. */
export function trackedTmdbIds(
  entries: { media: MediaSummary }[],
  cap = MAX_TRACKED_CALENDAR_IDS
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const entry of entries) {
    const id = trackedTmdbId(entry.media);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= cap) break;
  }
  return ids;
}

export function trackedMediaId(media: MediaSummary): number | null {
  return trackedTmdbId(media);
}

export function episodeCode(episode: {
  seasonNumber: number;
  episodeNumber: number;
}): string {
  return `S${episode.seasonNumber} · E${episode.episodeNumber}`;
}

export function episodeCoordinate(episode: {
  seasonNumber: number;
  episodeNumber: number;
}): string {
  return `S${episode.seasonNumber} E${episode.episodeNumber}`;
}

/** Whole days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD). */
export function daysUntil(date: string, today = todayKey()): number {
  const [year, month, day] = date.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  if (![year, month, day, todayYear, todayMonth, todayDay].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }
  const target = Date.UTC(year, month - 1, day);
  const start = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((target - start) / 86_400_000);
}

/** "Today", "Tomorrow", "Friday", or "Dec 2" — a compact air-date label. */
export function episodeWhen(date: string, today = todayKey()): string {
  const diff = daysUntil(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const [year, month, day] = date.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return date;
  const target = new Date(year, month - 1, day);
  if (diff > 1 && diff < 7) {
    return target.toLocaleDateString("en-US", { weekday: "long" });
  }
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The group a followed show belongs to in the Following timeline.
 * `date` is the episode we are showing for the selected month, if any.
 */
export type FollowingGroupKey =
  | "today"
  | "tomorrow"
  | "week"
  | "month"
  | "later"
  | "inactive";

export function followingGroupFor({
  date,
  month,
  today = todayKey(),
}: {
  date: string | null;
  month: string;
  today?: string;
}): FollowingGroupKey {
  if (!date) return "inactive";
  const diff = daysUntil(date, today);
  if (diff < 0) return "inactive";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  if (date.startsWith(month)) return "month";
  return "later";
}

export const FOLLOWING_GROUP_LABEL: Record<FollowingGroupKey, string> = {
  today: "Airs today",
  tomorrow: "Tomorrow",
  week: "This week",
  month: "Later this month",
  later: "Later",
  inactive: "On hiatus / Ended",
};

export const FOLLOWING_GROUP_ORDER: FollowingGroupKey[] = [
  "today",
  "tomorrow",
  "week",
  "month",
  "later",
  "inactive",
];

function watchHref(
  media: MediaSummary,
  episode: { seasonNumber: number; episodeNumber: number }
): string {
  return `/watch/${media.type}/${media.tmdbId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`;
}

function coordinateValue(episode: {
  seasonNumber: number;
  episodeNumber: number;
}): number {
  return episode.seasonNumber * 1000 + episode.episodeNumber;
}

/**
 * Release-day notifications for followed shows. TMDB only marks an episode as
 * aired after release (`lastEpisode`), so future `nextEpisode` rows are never
 * announced; older releases drop out of the feed. If multiple episodes aired
 * today, each is listed separately. Episodes with a matching watch-history
 * entry are omitted. Pure: the caller supplies "today" so the rules are
 * deterministic in tests.
 */
export function buildTrackingNotifications({
  entries,
  shows,
  progress,
  today = todayKey(),
}: {
  entries: { media: MediaSummary; notify?: TrackingNotify }[];
  shows: TrackedShowStatus[];
  progress: TrackingWatchProgress[];
  today?: string;
}): TrackingNotification[] {
  const byTmdb = new Map(shows.map((show) => [show.tmdbId, show]));
  const watchedByMedia = new Map<string, Set<string>>();
  for (const item of progress) {
    if (!item.episode) continue;
    const watched = watchedByMedia.get(item.mediaId) ?? new Set<string>();
    watched.add(episodeCoordinate(item.episode));
    watchedByMedia.set(item.mediaId, watched);
  }
  const notifications: TrackingNotification[] = [];

  for (const entry of entries) {
    const notify = entry.notify ?? "all";
    if (notify === "off") continue;

    const tmdbId = trackedTmdbId(entry.media);
    if (!tmdbId) continue;
    const show = byTmdb.get(tmdbId);
    if (!show) continue;

    // `lastEpisode` is TMDB's most recent aired episode. Requiring its air date
    // to be today is the release signal: `nextEpisode` is still in the future,
    // and older `lastEpisode` rows are no longer "new".
    const last = show.lastEpisode;
    if (!last || last.airDate !== today) continue;

    // Same-day batches can include an earlier episode as well; include only
    // episodes up to the one TMDB says has aired. A later same-day episode is
    // still in `nextEpisode` and must not be announced early.
    const released = new Map<string, TrackedEpisodeInfo>();
    released.set(episodeCoordinate(last), last);
    const lastCoordinate = coordinateValue(last);
    for (const episode of show.monthEpisodes) {
      if (episode.airDate !== today) continue;
      if (coordinateValue(episode) > lastCoordinate) continue;
      released.set(episodeCoordinate(episode), episode);
    }

    const watched = watchedByMedia.get(entry.media.id);
    const episodes = [...released.values()].sort(
      (a, b) => coordinateValue(a) - coordinateValue(b)
    );
    for (const episode of episodes) {
      if (watched?.has(episodeCoordinate(episode))) continue;
      if (notify === "premieres" && episode.episodeNumber !== 1) continue;

      notifications.push({
        key: `${entry.media.id}:released:s${episode.seasonNumber}e${episode.episodeNumber}:${today}`,
        kind: "new",
        title: `New episode of ${entry.media.title} is out now`,
        body: `${episodeCode(episode)}${episode.name ? ` · ${episode.name}` : ""}`,
        href: watchHref(entry.media, episode),
        date: episode.airDate,
        tmdbId,
        mediaId: entry.media.id,
        media: entry.media,
      });
    }
  }

  const seen = new Set<string>();
  return notifications
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
