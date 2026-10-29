import { describe, expect, it } from "vitest";
import {
  cricketLiveWindow,
  f1LiveWindow,
  featuredCricketMatch,
  windowIsLive,
} from "@/lib/live-windows";
import type { CricketDashboardData, CricketMatch, CricketTeam } from "@/lib/cricket/types";
import type { F1Meeting, F1Round, F1Schedule, F1Session } from "@/lib/f1";

// ---------------------------------------------------------------------------
// The navbar LIVE badge and the hero's live posters are only allowed to appear
// while the section's Watch Live button is unlocked: 15 minutes before the
// scheduled start through the session/match end. These tests pin that boundary
// against the same rules WatchLiveButton uses.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const START = Date.parse("2026-10-30T18:30:00Z");

function session(overrides: Partial<F1Session> = {}): F1Session {
  return {
    session_key: 1,
    session_name: "Practice 1",
    session_type: "Practice",
    meeting_key: 10,
    location: "Mexico City",
    country_name: "Mexico",
    country_code: "MEX",
    date_start: "2026-10-30T18:30:00+00:00",
    date_end: "2026-10-30T19:30:00+00:00",
    year: 2026,
    ...overrides,
  };
}

function round(sessions: F1Session[]): F1Round {
  const meeting: F1Meeting = {
    meeting_key: 10,
    meeting_name: "Mexico City Grand Prix",
    meeting_official_name: "FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026",
    location: "Mexico City",
    country_code: "MEX",
    country_name: "Mexico",
    country_flag: null,
    circuit_short_name: "Mexico City",
    circuit_info_url: null,
    circuit_image: "https://media.example/track.png",
    gmt_offset: "-06:00:00",
    date_start: "2026-10-30T18:30:00+00:00",
    date_end: "2026-11-01T22:00:00+00:00",
    year: 2026,
    is_cancelled: false,
  };
  return { meeting, sessions, race: sessions[sessions.length - 1] };
}

function schedule(sessions: F1Session[]): F1Schedule {
  const rounds = [round(sessions)];
  return {
    year: 2026,
    nowUtc: new Date(START - 60 * MIN).toISOString(),
    rounds,
    nextRoundIndex: 0,
    nextSession: sessions[0] ?? null,
  };
}

function team(overrides: Partial<CricketTeam> = {}): CricketTeam {
  return {
    id: "ind",
    name: "India",
    shortName: "India",
    abbreviation: "IND",
    primary: "#1d509e",
    secondary: "#ffffff",
    score: null,
    scores: [],
    ...overrides,
  };
}

function match(overrides: Partial<CricketMatch> = {}): CricketMatch {
  return {
    id: "1",
    gid: "g1",
    gender: "men",
    format: "T20I",
    formatLabel: "T20I",
    date: "2026-10-30T18:30:00Z",
    endDate: "2026-10-30",
    series: "India in New Zealand",
    title: "4th T20I",
    matchNumber: "4th T20I",
    venue: "Eden Park, Auckland",
    city: "Auckland",
    status: "upcoming",
    statusLabel: "Upcoming",
    result: "Teams will be announced at the toss",
    teams: [
      team({ id: "nz", name: "New Zealand", shortName: "New Zealand", abbreviation: "NZL" }),
      team(),
    ],
    live: false,
    ...overrides,
  };
}

function dashboard(matches: { fixtures?: CricketMatch[]; results?: CricketMatch[] }): CricketDashboardData {
  return {
    gender: "men",
    generatedAt: new Date(START).toISOString(),
    season: 2026,
    fixtures: matches.fixtures ?? [],
    results: matches.results ?? [],
    players: [],
  };
}

describe("f1LiveWindow", () => {
  const next = session();
  const sched = schedule([next]);
  const window = f1LiveWindow(sched, START - 60 * MIN)!;

  it("describes the next session and its watch window", () => {
    expect(window.kind).toBe("f1");
    expect(window.href).toBe("/watch/f1");
    expect(window.title).toBe("Mexico City Grand Prix");
    expect(window.subtitle).toBe("Practice 1 · Round 1 of 1");
    expect(window.details).toEqual(["Mexico City", "Mexico"]);
    expect(window.liveFrom).toBe(new Date(START - 15 * MIN).toISOString());
    expect(window.endsAt).toBe(new Date(START + 60 * MIN).toISOString());
  });

  it("stays locked until 15 minutes before the session", () => {
    expect(windowIsLive(window, START - 60 * MIN)).toBe(false);
    expect(windowIsLive(window, START - 16 * MIN)).toBe(false);
    expect(windowIsLive(window, START - 15 * MIN)).toBe(true);
    expect(windowIsLive(window, START + 30 * MIN)).toBe(true);
    expect(windowIsLive(window, START + 60 * MIN)).toBe(true);
    expect(windowIsLive(window, START + 61 * MIN)).toBe(false);
  });

  it("rolls onto the next session and eventually reports none", () => {
    const later = session({
      session_key: 2,
      session_name: "Race",
      date_start: "2026-11-01T20:00:00+00:00",
      date_end: "2026-11-01T22:00:00+00:00",
    });
    const picked = f1LiveWindow(schedule([next, later]), START + 61 * MIN);
    expect(picked?.subtitle).toContain("Race");
    expect(f1LiveWindow(schedule([next]), START + 61 * MIN)).toBeNull();
  });
});

describe("cricketLiveWindow", () => {
  it("picks a live match even when the clock is outside its window", () => {
    const live = match({ status: "live", live: true, result: "India need 45 runs to win" });
    const window = cricketLiveWindow(dashboard({ fixtures: [live] }), START - 3 * 60 * MIN)!;
    expect(window.kind).toBe("cricket");
    expect(window.title).toBe("New Zealand vs India");
    expect(window.subtitle).toBe("India in New Zealand · 4th T20I");
    expect(window.isLive).toBe(true);
    expect(windowIsLive(window, START - 3 * 60 * MIN)).toBe(true);
  });

  it("unlocks an upcoming fixture 15 minutes early and closes three hours in", () => {
    const window = cricketLiveWindow(dashboard({ fixtures: [match()] }), START - 60 * MIN)!;
    expect(window.liveFrom).toBe(new Date(START - 15 * MIN).toISOString());
    expect(window.endsAt).toBe(new Date(START + 3 * 60 * MIN).toISOString());
    expect(window.details[0]).toBe("T20I · Eden Park, Auckland");
    expect(window.isLive).toBe(false);
    expect(windowIsLive(window, START - 60 * MIN)).toBe(false);
    expect(windowIsLive(window, START - 15 * MIN)).toBe(true);
    expect(windowIsLive(window, START + 3 * 60 * MIN)).toBe(true);
    expect(windowIsLive(window, START + 3 * 60 * MIN + 1)).toBe(false);
  });

  it("keeps a finished match through its 30-minute watch grace", () => {
    const endedAt = new Date(START + 3 * 60 * MIN).toISOString();
    const done = match({ status: "completed", result: "India win by 6 wickets", endedAt });
    const window = cricketLiveWindow(dashboard({ results: [done] }), START + 3 * 60 * MIN)!;
    expect(window.isLive).toBe(false);
    expect(window.endsAt).toBe(new Date(Date.parse(endedAt) + 30 * MIN).toISOString());
    expect(windowIsLive(window, Date.parse(endedAt) + 29 * MIN)).toBe(true);
    expect(windowIsLive(window, Date.parse(endedAt) + 30 * MIN)).toBe(true);
    expect(windowIsLive(window, Date.parse(endedAt) + 31 * MIN)).toBe(false);
  });

  it("prefers a live match over the next fixture", () => {
    const live = match({ gid: "live", status: "live", live: true });
    const upcoming = match({ gid: "next", date: "2026-11-02T18:30:00Z" });
    const picked = featuredCricketMatch(
      dashboard({ fixtures: [upcoming, live] }),
      START
    );
    expect(picked?.gid).toBe("live");
  });

  it("returns nothing when the dashboard is empty", () => {
    expect(cricketLiveWindow(dashboard({}), START)).toBeNull();
  });
});
