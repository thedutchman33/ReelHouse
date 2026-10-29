import type { CricketDashboardData, CricketMatch } from "@/lib/cricket/types";
import { MATCH_WATCH_GRACE_MS } from "@/lib/cricket/watch-window";
import { WATCH_LEAD_MS, watchLivePhase } from "@/components/f1/watch-live-phase";
import type { F1Round, F1Schedule, F1Session } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Live watch windows, shared by the server composer and the browser.
//
// One window is exactly the period in which the section's Watch Live button is
// unlocked, so the navbar LIVE badge and the home hero poster can never drift
// from the button itself: 15 minutes before the scheduled start through the
// session/match end. The rules mirror WatchLiveButton / MatchHero.
//
// The type-only imports above are erased at build time; this module is safe to
// import from a client component even though the F1 and cricket data layers are
// server-only.
// ---------------------------------------------------------------------------

export interface LiveWindow {
  kind: "f1" | "cricket";
  /** The section's watch page. */
  href: string;
  /** Watch Live unlocks here (scheduled start minus the early-access lead). */
  liveFrom: string;
  /** Watch Live locks again: session end, or the post-match grace end. */
  endsAt: string;
  /** The source is reporting an event in progress (overrides the clock). */
  isLive: boolean;
  title: string;
  subtitle: string;
  details: string[];
  /** Circuit art for F1; cricket has no match photo. */
  imageUrl: string | null;
}

export interface LiveFeed {
  f1: LiveWindow | null;
  cricket: LiveWindow | null;
}

const CRICKET_DEFAULT_MS = 3 * 3600_000;

function sessionEnd(session: F1Session): number {
  const end = session.date_end ? Date.parse(session.date_end) : NaN;
  return Number.isFinite(end) ? end : Date.parse(session.date_start) + CRICKET_DEFAULT_MS;
}

/** The session the F1 page's Watch Live button is attached to. */
export function nextF1Session(
  schedule: F1Schedule,
  now: number
): { session: F1Session; round: F1Round } | null {
  const entries = schedule.rounds
    .flatMap((round) => round.sessions.map((session) => ({ session, round })))
    .sort((a, b) => Date.parse(a.session.date_start) - Date.parse(b.session.date_start));
  return entries.find(({ session }) => sessionEnd(session) >= now) ?? null;
}

/** Reproduce the F1 hero's Watch Live window for the current clock. */
export function f1LiveWindow(schedule: F1Schedule, now: number): LiveWindow | null {
  const picked = nextF1Session(schedule, now);
  if (!picked) return null;
  const { session, round } = picked;
  const start = Date.parse(session.date_start);
  if (!Number.isFinite(start)) return null;

  const roundIndex = schedule.rounds.findIndex(
    (entry) => entry.meeting.meeting_key === session.meeting_key
  );
  const details = [
    round.meeting.circuit_short_name ?? round.meeting.location,
    round.meeting.country_name,
  ].filter(Boolean);

  return {
    kind: "f1",
    href: "/watch/f1",
    liveFrom: new Date(start - WATCH_LEAD_MS).toISOString(),
    endsAt: new Date(sessionEnd(session)).toISOString(),
    isLive: false,
    title: round.meeting.meeting_name,
    subtitle: `${session.session_name} · Round ${roundIndex + 1} of ${schedule.rounds.length}`,
    details,
    imageUrl: round.meeting.circuit_image ?? null,
  };
}

/**
 * The match the cricket hero is showing, with the same precedence as the page:
 * live, then a result still inside its 30-minute watch window, then the next
 * fixture, then the latest result.
 */
export function featuredCricketMatch(data: CricketDashboardData, now: number): CricketMatch | null {
  const live = data.fixtures
    .filter((match) => match.status === "live")
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
  if (live) return live;

  const recent = data.results
    .filter((match) => {
      const at = match.endedAt ? Date.parse(match.endedAt) : NaN;
      return Number.isFinite(at) && now >= at && now - at < MATCH_WATCH_GRACE_MS;
    })
    .sort((a, b) => Date.parse(b.endedAt ?? "") - Date.parse(a.endedAt ?? ""))[0];
  if (recent) return recent;

  const next = data.fixtures
    .filter((match) => match.status === "upcoming" && Date.parse(match.date) >= now)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
  if (next) return next;

  return (
    [...data.results].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null
  );
}

/** Reproduce the cricket hero's Watch Live window for the current clock. */
export function cricketLiveWindow(
  data: CricketDashboardData,
  now: number
): LiveWindow | null {
  const match = featuredCricketMatch(data, now);
  if (!match) return null;

  const start = Date.parse(match.date);
  if (!Number.isFinite(start)) return null;
  const endedAt = match.endedAt ? Date.parse(match.endedAt) : NaN;

  const india = match.teams.find((team) => team.abbreviation === "IND") ?? match.teams[1];
  const opponent = match.teams.find((team) => team.id !== india?.id) ?? match.teams[0];
  if (!india || !opponent) return null;

  return {
    kind: "cricket",
    href: "/watch/cricket",
    liveFrom: new Date(start - WATCH_LEAD_MS).toISOString(),
    endsAt: new Date(
      Number.isFinite(endedAt) ? endedAt + MATCH_WATCH_GRACE_MS : start + CRICKET_DEFAULT_MS
    ).toISOString(),
    isLive: match.status === "live",
    title: `${opponent.shortName} vs ${india.shortName}`,
    subtitle: `${match.series} · ${match.title}`,
    details: [
      `${match.format} · ${match.venue}`,
      match.status === "upcoming" ? "" : (match.result ?? ""),
    ].filter(Boolean),
    imageUrl: null,
  };
}

/** True while the section's Watch Live button is unlocked. */
export function windowIsLive(window: LiveWindow, now: number): boolean {
  if (window.isLive) return true;
  const from = Date.parse(window.liveFrom);
  const end = Date.parse(window.endsAt);
  if (!Number.isFinite(from) || !Number.isFinite(end)) return false;
  return watchLivePhase(now, from, end) === "live";
}
