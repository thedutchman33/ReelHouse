"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { openF1SessionView } from "@/components/f1/SessionTabs";
import { useSessionTime } from "@/components/f1/timezone";
import { lapFmtF } from "@/components/f1/format";
import { downloadNodeAsImage } from "@/components/f1/snapshot";
import {
  CHIPS,
  ClassificationView,
  FastestLapsView,
  LapTimeEvolutionView,
  LapTimeMatrixView,
  PotentialDriversView,
  PotentialTeamsView,
  SpeedVsLapTimeView,
  TopSpeedView,
  VIEWS,
  WeatherTrendView,
  type ViewId,
} from "@/components/f1/analytics";
import {
  BestSectorsView,
  DriverTimesView,
  PaceDriversView,
  PaceTeamsView,
  TyreDegradationView,
} from "@/components/f1/pace-views";
import {
  RACE_VIEWS,
  RacePositionsView,
  TyreStrategiesView,
  PitStopTimesView,
  GapRaceView,
  AveragePositionsView,
  TrafficCleanAirView,
  TopLapsView,
  type RaceViewId,
} from "@/components/f1/race-views";
import type { F1ResultsPayload, F1Round, F1Schedule, F1Session } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Session records → the analytics deck. One weekend's session at a time:
//   • session tabs (Practice 1 → Race, plus the sprint sessions when the
//     weekend has them) and a Year + Grand Prix dropdown pair on the right,
//   • the weekend title and the analysis chips (classification, potential,
//     pace, tyres, speed, matrix, weather),
//   • one card holding the chosen analysis, exportable as an image.
// Everything is OpenF1's (laps, sectors, stints, speed traps, weather).
// ---------------------------------------------------------------------------

/** OpenF1's coverage — the years the schedule endpoint can actually serve. */
const FIRST_YEAR = 2023;

/**
 * The race deck, in the reference site's order. Race weekends add the timing
 * views that only exist for a race (positions, strategies, pit stops, gaps,
 * average positions, traffic) and the top-20 lap table; the practice-only
 * analyses drop away.
 */
const RACE_CHIPS: { id: ViewId | RaceViewId | null; label: string }[] = [
  { id: "classification", label: "Classification" },
  { id: "race-positions", label: "Race Positions" },
  { id: "tyre-strategies", label: "Tyre Strategies" },
  { id: "pit-stop-times", label: "Pit Stop Times" },
  { id: "gap-race", label: "Gap Race" },
  { id: "lap-time-evolution", label: "Lap Time Evolution" },
  { id: "pace-drivers", label: "Pace: Drivers" },
  { id: "pace-teams", label: "Pace: Teams" },
  { id: "tyre-degradation", label: "Tyre Degradation" },
  { id: "average-positions", label: "Average Positions" },
  { id: "traffic-clean-air", label: "Traffic & Clean Air" },
  { id: "fastest-laps", label: "Fastest Laps" },
  { id: "top-speed", label: "Top Speed" },
  { id: "driver-times", label: "Driver Times" },
  { id: "lap-time-matrix", label: "Lap Time Matrix" },
  { id: "best-sectors", label: "Best Sectors" },
  { id: "weather-trend", label: "Weather Trend" },
];

/** The card title for a chip (a few read differently from the chip). */
const VIEW_TITLES: Record<string, string> = {
  ...Object.fromEntries(VIEWS.map((v) => [v.id, v.title])),
  ...Object.fromEntries(RACE_VIEWS.map((v) => [v.id, v.title])),
  "fastest-laps-race": "Top 20 Fastest Laps",
};

/** The session a weekend opens on: the latest one that has started, else the
 *  first of the weekend. */
function defaultSessionKey(sessions: F1Session[], nowMs: number): number | null {
  const started = sessions.filter((s) => new Date(s.date_start).getTime() <= nowMs);
  return (started.length ? started[started.length - 1] : sessions[0])?.session_key ?? null;
}

/** The weekend the deck opens on: the last one that has actually started, so
 *  a finished race stays selected until the next session begins (the
 *  reference does the same), falling back to the first round. */
function latestStartedMeeting(schedule: F1Schedule, nowMs: number): number | null {
  const started = schedule.rounds.filter((r) =>
    r.sessions.some((s) => new Date(s.date_start).getTime() <= nowMs)
  );
  return (started[started.length - 1] ?? schedule.rounds[0])?.meeting.meeting_key ?? null;
}

/** One entry of the Grand Prix picker: a race weekend or a pre-season test. */
interface PickerWeekend {
  key: number;
  label: string;
  meeting: F1Round["meeting"];
  sessions: F1Session[];
  race: F1Session | null;
}

// ------------------------------ pill dropdown ------------------------------

interface Option {
  value: string;
  label: string;
}

function PillSelect({
  label,
  value,
  options,
  onChange,
  widthClass,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  widthClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const currentIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const current = options[currentIndex] ?? options[0];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    if (open) setActive(currentIndex);
  }, [open, currentIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option inside the scroll box.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (i: number) => {
    const next = options[i];
    if (!next) return;
    onChange(next.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => Math.max(0, Math.min(options.length - 1, a + step)));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      if (!open) return;
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      if (!open) return;
      e.preventDefault();
      choose(active);
    }
  };

  return (
    <div className={`min-w-0 ${widthClass}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">
          {label}
        </span>
        <div ref={rootRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? `${id}-list` : undefined}
            aria-label={label}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={onKeyDown}
            className={`flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 text-left text-[13px] text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#e10600]/40 focus-visible:outline-none ${
              open
                ? "border-[#e10600]/70 bg-[#181820]"
                : "border-white/15 bg-[#101017] hover:border-white/30 hover:bg-[#181820]"
            }`}
          >
            <span className="block truncate font-semibold">{current?.label ?? value}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              className={`h-4 w-4 shrink-0 text-white/60 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <ul
              ref={listRef}
              id={`${id}-list`}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              className="f1-scroll absolute right-0 z-40 mt-1 max-h-80 w-full min-w-[15rem] overflow-y-auto overscroll-contain rounded-lg border border-white/[0.12] bg-[#121219] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.65)]"
            >
              {options.map((o, i) => {
                const selected = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-idx={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(i)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap transition-colors ${
                        i === active ? "bg-white/10 text-white" : "text-white/65"
                      } ${selected ? "font-semibold text-[#ff4438]" : ""}`}
                    >
                      <span className="truncate">{o.label}</span>
                      {selected && (
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="h-3.5 w-3.5 shrink-0 text-[#ff5a4f]"
                        >
                          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------- section ---------------------------------

export default function SessionRecords({
  schedule,
  round,
  now,
  onOpenSession,
}: {
  /** The year's full calendar (powers the Grand Prix dropdown). */
  schedule: F1Schedule;
  /** The weekend the hero is on — the default selection. */
  round: F1Round;
  /** Dashboard clock (ticks every second with the rest of the page). */
  now: number;
  onOpenSession: (key: number) => void;
}) {
  const { dateTime } = useSessionTime();
  const [year, setYear] = useState(schedule.year);
  const [yearSchedule, setYearSchedule] = useState<F1Schedule | null>(schedule);
  const [meetingKey, setMeetingKey] = useState(
    () => latestStartedMeeting(schedule, Date.now()) ?? round.meeting.meeting_key
  );
  /** null = follow the weekend's latest started session. */
  const [chosenSession, setChosenSession] = useState<number | null>(null);
  const [view, setView] = useState<ViewId | RaceViewId>("classification");
  const [data, setData] = useState<F1ResultsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const top = Math.max(schedule.year, new Date().getFullYear());
    return Array.from({ length: top - FIRST_YEAR + 1 }, (_, i) => top - i);
  }, [schedule.year]);

  // Year dropdown → that season's calendar.
  useEffect(() => {
    if (year === schedule.year) {
      setYearSchedule(schedule);
      return;
    }
    let alive = true;
    fetch(`/api/f1/schedule?year=${year}`)
      .then((r) => (r.ok ? (r.json() as Promise<F1Schedule>) : null))
      .then((d) => {
        if (!alive) return;
        if (d?.rounds?.length) setYearSchedule(d);
        // Nothing to show for that season — keep the label honest.
        else setYear((y) => (y === year ? (yearSchedule?.year ?? schedule.year) : y));
      })
      .catch(() => {
        if (alive) setYear((y) => (y === year ? (yearSchedule?.year ?? schedule.year) : y));
      });
    return () => {
      alive = false;
    };
  }, [year, schedule]);

  // A season change picks the weekend to open on, the way the reference's
  // picker does: the current year opens at its latest running round, a past
  // season on its final round.
  useEffect(() => {
    if (!yearSchedule?.rounds?.length) return;
    const present = [...yearSchedule.rounds.map((r) => r.meeting.meeting_key), ...(yearSchedule.tests ?? []).map((t) => t.meeting.meeting_key)];
    if (present.includes(meetingKey)) return;
    const key =
      yearSchedule.year === schedule.year
        ? latestStartedMeeting(schedule, now)
        : (yearSchedule.rounds[yearSchedule.rounds.length - 1]?.meeting.meeting_key ?? null);
    if (key != null) setMeetingKey(key);
    setChosenSession(null);
  }, [yearSchedule, meetingKey, schedule, now]);

  const rounds = yearSchedule?.rounds?.length ? yearSchedule.rounds : schedule.rounds;
  const tests = yearSchedule?.tests ?? schedule.tests ?? [];

  // The Grand Prix picker lists the whole season — race weekends numbered by
  // round, then the pre-season tests with a trailing ordinal — newest first,
  // matching the reference's order rather than the calendar's.
  const picker = useMemo<PickerWeekend[]>(() => {
    const raceOptions: PickerWeekend[] = rounds.map((r, i) => ({
      key: r.meeting.meeting_key,
      label: `${i + 1} - ${r.meeting.meeting_name}`,
      meeting: r.meeting,
      sessions: r.sessions,
      race: r.race,
    }));
    const testOptions: PickerWeekend[] = tests.map((t) => {
      const same = tests.filter((x) => x.meeting.meeting_name === t.meeting.meeting_name);
      // Chronological ordinals (the earliest test is #1); the list is reversed
      // below, so the newest test lands first.
      const ordinal = same.length > 1 ? ` ${same.indexOf(t) + 1}` : "";
      return {
        key: t.meeting.meeting_key,
        label: `${t.meeting.meeting_name}${ordinal}`,
        meeting: t.meeting,
        sessions: t.sessions,
        race: null,
      };
    });
    // Newest round first, with the pre-season tests trailing the calendar the
    // way the reference lists them.
    return [...raceOptions.reverse(), ...testOptions.reverse()];
  }, [rounds, tests]);

  const activeWeekend: PickerWeekend =
    picker.find((w) => w.key === meetingKey) ??
    picker[picker.length - 1] ??
    picker[0] ?? {
      key: round.meeting.meeting_key,
      label: round.meeting.meeting_name,
      meeting: round.meeting,
      sessions: round.sessions,
      race: round.race,
    };

  const autoSession = defaultSessionKey(activeWeekend.sessions, now);
  const session: F1Session | null =
    (chosenSession != null
      ? activeWeekend.sessions.find((s) => s.session_key === chosenSession)
      : null) ??
    activeWeekend.sessions.find((s) => s.session_key === autoSession) ??
    activeWeekend.sessions[0] ??
    null;

  useEffect(() => {
    if (session == null) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/f1/results?session=${session.session_key}`)
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json() as Promise<F1ResultsPayload>;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.session_key, reload]);

  const rows = data?.results ?? [];
  const hasTiming = rows.some((r) => r.lapCount > 0);
  const sessionBest = data?.sessionBest ?? null;
  const maxLap = data?.maxLap ?? 0;
  const weather = data?.weather ?? [];
  const race = data?.race;
  const finalGap = data?.finalGap;
  const isRace = session?.session_type === "Race";

  // The chip set follows the session type: a race gets the race deck.
  const chips = isRace ? RACE_CHIPS : CHIPS;
  const current: ViewId | RaceViewId = chips.find((c) => c.id === view)
    ? (view as ViewId | RaceViewId)
    : "classification";
  const title =
    isRace && current === "fastest-laps"
      ? "Top 20 Fastest Laps"
      : (VIEW_TITLES[current] ?? "Classification");

  const pickMeeting = (value: string) => {
    setMeetingKey(Number(value));
    setChosenSession(null);
  };

  const exportImage = () => {
    const node = cardRef.current;
    if (!node || exporting) return;
    setExporting(true);
    try {
      const slug = `${year}-${activeWeekend.meeting.meeting_name}-${session?.session_name ?? "session"}`
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      downloadNodeAsImage(node, `${slug}-${current}.svg`);
    } finally {
      setExporting(false);
    }
  };

  // --------------------------------- render --------------------------------

  return (
    <section
      id="f1-analytics"
      aria-label="Session records"
      className="f1-card scroll-mt-32 overflow-hidden rounded-2xl font-f1"
    >
      {/* session tabs + year / Grand Prix dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-black/25 px-4 py-2.5">
        <nav aria-label="Sessions of the Grand Prix" className="flex max-w-full gap-1 overflow-x-auto">
          {activeWeekend.sessions.map((s) => {
            const active = s.session_key === session?.session_key;
            return (
              <button
                key={s.session_key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setChosenSession(s.session_key)}
                className={`rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[#e10600] focus-visible:outline-none ${
                  active
                    ? "bg-[#e10600] font-bold text-white shadow-[0_2px_12px_rgba(225,6,0,0.35)]"
                    : "font-medium text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {s.session_name}
              </button>
            );
          })}
        </nav>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <PillSelect
            label="Year"
            value={String(year)}
            onChange={(v) => {
              setYear(Number(v));
              setChosenSession(null);
            }}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            widthClass="w-36"
          />
          <PillSelect
            label="Grand Prix"
            value={String(activeWeekend.meeting.meeting_key)}
            onChange={pickMeeting}
            options={picker.map((w) => ({
              value: String(w.key),
              label: w.label,
            }))}
            widthClass="w-full sm:w-96"
          />
        </div>
      </div>

      {/* weekend title + analysis chips */}
      <div className="border-b border-white/[0.08] bg-black/15 px-3 py-2 sm:px-4">
        <h1 className="mb-2 truncate text-[13px] font-bold tracking-wide text-white uppercase sm:text-sm">
          {year} - {activeWeekend.meeting.meeting_name} - {session?.session_name ?? "Session"}
        </h1>
        <nav
          aria-label="Analysis charts"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible md:pb-0"
        >
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-current={chip.id === current ? "true" : undefined}
              onClick={() => setView(chip.id as ViewId)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[#e10600] focus-visible:outline-none sm:text-[13px] ${
                chip.id === current
                  ? "border-[#e10600] bg-[#e10600] font-bold text-white shadow-[0_2px_12px_rgba(225,6,0,0.3)]"
                  : "border-white/12 bg-transparent font-medium text-white/65 hover:border-white/30 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </nav>
      </div>

      {/* the analysis card */}
      <div className="flex flex-col p-4">
        <div
          ref={cardRef}
          data-analysis-card="true"
          className="flex w-full flex-1 flex-col rounded-xl border border-white/[0.07] bg-black/30 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] sm:p-5"
        >
          <div className="mb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-black tracking-wide text-white uppercase lg:text-lg">
                  {title}
                </h2>
                {session && (
                  <p className="truncate text-[10px] tracking-[0.08em] text-white/45 uppercase">
                    {activeWeekend.meeting.circuit_short_name ?? activeWeekend.meeting.location} ·{" "}
                    {dateTime(session.date_start)}
                    {sessionBest != null && (
                      <>
                        {" · "}
                        <span className="text-fuchsia-400">FL {lapFmtF(sessionBest)}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!session) return;
                    onOpenSession(session.session_key);
                    openF1SessionView();
                    document
                      .getElementById("f1-tabs-anchor")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  disabled={!session}
                  className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-medium text-white/90 transition-colors hover:border-[#e10600] hover:text-white focus-visible:ring-2 focus-visible:ring-[#e10600] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="hidden sm:inline">Open in Session view</span>
                  <span className="sm:hidden">Session view</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Download as image"
                  title="Download as image"
                  onClick={exportImage}
                  disabled={exporting || !hasTiming}
                  className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#26262f] px-3 text-sm font-medium text-white/90 transition-colors hover:bg-[#33333f] hover:text-white focus-visible:ring-2 focus-visible:ring-[#e10600] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v11m0 0l-4-4m4 4l4-4"
                    />
                  </svg>
                  <span className="sm:hidden">Download as image</span>
                </button>
              </div>
            </div>
          </div>

          {loading && !data ? (
            <div className="space-y-1 py-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-white/[0.07]" />
              ))}
            </div>
          ) : failed ? (
            <div role="status" className="py-10 text-center text-sm text-[#ff6b61]">
              Couldn&apos;t load this session&apos;s timing data.
              <button
                type="button"
                onClick={() => setReload((n) => n + 1)}
                className="ml-2 underline decoration-red-400/40 underline-offset-2 hover:text-white"
              >
                Try again
              </button>
            </div>
          ) : !hasTiming ? (
            <p className="py-10 text-center text-sm text-white/55">
              No timing data for this session yet.
            </p>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {current === "classification" && (
                <ClassificationView
                  rows={rows}
                  sessionBest={sessionBest}
                  race={race}
                  finalGap={finalGap}
                />
              )}
              {current === "potential-drivers" && <PotentialDriversView rows={rows} />}
              {current === "potential-teams" && <PotentialTeamsView rows={rows} />}
              {current === "fastest-laps" &&
                (isRace ? (
                  <TopLapsView rows={rows} />
                ) : (
                  <FastestLapsView rows={rows} sessionBest={sessionBest} />
                ))}
              {current === "best-sectors" && <BestSectorsView rows={rows} />}
              {current === "lap-time-evolution" && <LapTimeEvolutionView rows={rows} />}
              {current === "pace-drivers" && <PaceDriversView rows={rows} />}
              {current === "pace-teams" && <PaceTeamsView rows={rows} />}
              {current === "tyre-degradation" && <TyreDegradationView rows={rows} />}
              {current === "top-speed" && <TopSpeedView rows={rows} />}
              {current === "speed-vs-lap-time" && <SpeedVsLapTimeView rows={rows} />}
              {current === "driver-times" && <DriverTimesView rows={rows} />}
              {current === "lap-time-matrix" && (
                <LapTimeMatrixView rows={rows} maxLap={maxLap} sessionBest={sessionBest} />
              )}
              {current === "weather-trend" && <WeatherTrendView weather={weather} />}

              {/* race-only timing views */}
              {race && current === "race-positions" && (
                <RacePositionsView rows={rows} race={race} maxLap={maxLap} />
              )}
              {race && current === "tyre-strategies" && (
                <TyreStrategiesView rows={rows} maxLap={maxLap} />
              )}
              {race && current === "pit-stop-times" && (
                <PitStopTimesView rows={rows} race={race} />
              )}
              {race && current === "gap-race" && (
                <GapRaceView rows={rows} race={race} maxLap={maxLap} />
              )}
              {race && current === "average-positions" && (
                <AveragePositionsView rows={rows} race={race} maxLap={maxLap} />
              )}
              {race && current === "traffic-clean-air" && (
                <TrafficCleanAirView rows={rows} race={race} />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
