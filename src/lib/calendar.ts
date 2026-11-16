// Release Calendar model and date math. Pure and client-safe: the server
// fetcher lives in release-calendar.ts, so the month grid can be unit-tested
// and rendered without pulling TMDB (or its key) into a client bundle.

export type CalendarKind = "movie" | "series" | "episode";

/** UI filter. "tracking" is resolved client-side from the viewer's follows. */
export type CalendarFilter =
  | "all"
  | "movies"
  | "series"
  | "episodes"
  | "tracking";

/** The URL's `type` parameter, mirroring the reference's values. */
export type CalendarTypeParam = "movie" | "tv" | "episode" | "tracking";

export interface CalendarEpisode {
  seasonNumber: number;
  episodeNumber: number;
  lastEpisodeNumber: number;
  /** Episodes of this show released on this day (grouped into one entry). */
  count: number;
  /** Single episode title, or "N episodes" for a same-day batch. */
  title: string;
}

export interface CalendarRelease {
  /** Stable per calendar entry (an episode day includes show + coordinates). */
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  kind: CalendarKind;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  stillUrl?: string;
  rating?: number;
  /** TMDB popularity — keeps same-day cards in the reference's order. */
  popularity?: number;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Episode groups only: the day's season/episode range. */
  episode?: CalendarEpisode;
  /** An episode of a series the viewer follows. */
  tracked?: boolean;
}

export interface CalendarCounts {
  all: number;
  movies: number;
  series: number;
  episodes: number;
}

export interface CalendarMonthData {
  /** YYYY-MM */
  month: string;
  items: CalendarRelease[];
  counts: CalendarCounts;
}

export interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  items: CalendarRelease[];
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(value: string | undefined | null): value is string {
  return Boolean(value && MONTH_RE.test(value));
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const match = MONTH_RE.exec(key);
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function shiftMonthKey(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const date = new Date(year, month - 1 + delta, 1);
  return monthKey(date);
}

export function monthLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * `m` is an offset from the current month (0 = this month), exactly like the
 * reference. Past months are clamped away; future months are open-ended.
 */
export function parseMonthOffset(value: string | number | undefined | null): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.floor(parsed), 240);
}

export function monthForOffset(offset: number): string {
  return shiftMonthKey(monthKey(), offset);
}

/**
 * Selected day rules:
 * - a valid `d` inside the shown month wins;
 * - the current month defaults to today;
 * - any other month defaults to its first day.
 */
export function resolveSelectedDate(
  month: string,
  value?: string | null
): string {
  if (value && DATE_RE.test(value) && value.startsWith(month)) return value;
  return month === monthKey() ? todayKey() : `${month}-01`;
}

export function isDateKey(value: string | undefined | null): value is string {
  return Boolean(value && DATE_RE.test(value));
}

export function filterFromType(
  value: string | null | undefined
): CalendarFilter {
  if (value === "movie") return "movies";
  if (value === "tv") return "series";
  if (value === "episode") return "episodes";
  if (value === "tracking") return "tracking";
  return "all";
}

export function typeParamForFilter(
  filter: CalendarFilter
): CalendarTypeParam | null {
  if (filter === "movies") return "movie";
  if (filter === "series") return "tv";
  if (filter === "episodes") return "episode";
  if (filter === "tracking") return "tracking";
  return null;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** Always a Monday-first, six-row month grid, like the reference calendar. */
export function buildCalendarDays(
  key: string,
  items: CalendarRelease[]
): CalendarDay[] {
  const { year, month } = parseMonthKey(key);
  const first = new Date(year, month - 1, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - mondayOffset);

  const byDate = new Map<string, CalendarRelease[]>();
  for (const item of items) {
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + index
    );
    const iso = dateKey(date);
    return {
      date: iso,
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1,
      items: byDate.get(iso) ?? [],
    };
  });
}

const KIND_ORDER: Record<CalendarKind, number> = {
  movie: 0,
  series: 1,
  episode: 2,
};

/** Date first, cards before episode groups, then popularity (the reference). */
export function sortCalendarItems(items: CalendarRelease[]): CalendarRelease[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (b.popularity ?? 0) - (a.popularity ?? 0) ||
      a.title.localeCompare(b.title)
  );
}

export function formatDayHeading(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function kindForFilter(
  filter: CalendarFilter,
  item: CalendarRelease
): boolean {
  if (filter === "all") return true;
  if (filter === "movies") return item.kind === "movie";
  if (filter === "series") return item.kind === "series";
  if (filter === "tracking") return item.kind === "episode" && item.tracked === true;
  return item.kind === "episode";
}

/** "S1 · E7" or "S1 · E1–4" — the reference's episode badge. */
export function episodeBadge(episode: CalendarEpisode): string {
  const range =
    episode.count > 1
      ? `E${episode.episodeNumber}–${episode.lastEpisodeNumber}`
      : `E${episode.episodeNumber}`;
  return `S${episode.seasonNumber} · ${range}`;
}

/** Episode title, or "N episodes" for a same-day batch. */
export function episodeSubtitle(episode: CalendarEpisode): string {
  return episode.count > 1 ? `${episode.count} episodes` : episode.title;
}

/** "Today", "Tomorrow", or a short date — the day-detail badge. */
export function relativeDayBadge(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
