"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartRow, ChartSeries } from "@/components/f1/charts";
import { ChartKit, useZoomState } from "@/components/f1/charts";
import { useF1Tabs } from "@/components/f1/SessionTabs";
import { FALLBACK_LAP_COLORS, TyreBadge, dotForCompound } from "@/components/f1/tyre";
import { useSessionTime } from "@/components/f1/timezone";
import { axisSecF, lapFmtF } from "@/components/f1/format";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { F1LapPick, F1ResultsPayload, F1Schedule } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Session Centre (GP-Tempo's exact anatomy on ReelHouse chassis):
//   left rail (md:w-64): Year ▸ Grand Prix ▸ Session dropdowns, the driver
//   chip grid (their MI), and COMPARE FASTEST LAPS — then the right column
//   (their XV): the "compare selected drivers" session chart (YH — lap-number
//   axis on races, time axis elsewhere, flip button, compound dots, click a
//   dot to pull that lap into telemetry) over the lap matrix (KV — one column
//   per lap, tap a cell to load / unload that lap, teal personal-best tint,
//   struck-out deleted laps).
// Defaults to the latest GP's latest completed session (or the live one).
// Palette: red / white / black / grey / blue. Fits GP-Tempo there too —
//   their layout string: Card > min-h content > flex [w-64 … | flex-1 …].
// ---------------------------------------------------------------------------

export interface ResultsCentreProps {
  /** The current-year schedule from the dashboard (seeds the dropdowns). */
  schedule: F1Schedule;
  picks: F1LapPick[];
  onPicksChange: (picks: F1LapPick[]) => void;
  /** Ordered jump-in from the session-records strip: {key, nonce} — a new
   *  nonce loads that session's results into this centre. */
  presetSession?: { key: number; nonce: number } | null;
}

/** Race-first session order (GP-Tempo's), sprint sessions included when present. */
const SESSION_ORDER = ["Race", "Sprint", "Sprint Qualifying", "Qualifying", "Practice 3", "Practice 2", "Practice 1"];
const sessionRank = (name: string): number => {
  const i = SESSION_ORDER.indexOf(name);
  return i === -1 ? SESSION_ORDER.length : i;
};

/** Their `XH` — session names using the lap-number axis instead of time. */
const LAP_AXIS_SESSIONS = ["Race", "Sprint"];

/** OpenF1's timing coverage starts in 2023 — list only the seasons it can
 *  serve, newest first, so the picker never offers an empty year. */
const FIRST_SEASON = 2023;
const YEARS = Array.from(
  { length: Math.max(1, new Date().getFullYear() - FIRST_SEASON + 1) },
  (_, i) => new Date().getFullYear() - i
);

type XAxisKey = "LapNumber" | "LapStartTimestamp";

export default function ResultsCentre({ schedule, picks, onPicksChange, presetSession }: ResultsCentreProps) {
  const { viewMode, goToTelemetry, toastLapAdded } = useF1Tabs();
  const { clock } = useSessionTime();
  const isMobile = useIsMobile();
  const [year, setYear] = useState(schedule.year);
  const [yearSchedule, setYearSchedule] = useState<F1Schedule | null>(
    schedule.year === year ? schedule : null
  );
  const [yearLoading, setYearLoading] = useState(false);
  const [results, setResults] = useState<F1ResultsPayload | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  /** Selected driver chips (their `drivers` search param; acronyms here). */
  const [drivers, setDrivers] = useState<string[]>([]);
  /** Their `[v,g]` — show outlier laps on the session chart. */
  const [showOutliers, setShowOutliers] = useState(false);

  // Session keys: default = live session, else latest completed (per year).
  const [sessionKey, setSessionKey] = useState<number | null>(null);

  // Year change → fetch that year's schedule; keep the dropdown selection sane.
  useEffect(() => {
    if (year === schedule.year) {
      setYearSchedule(schedule);
      return;
    }
    let alive = true;
    setYearSchedule(null);
    setYearLoading(true);
    fetch(`/api/f1/schedule?year=${year}`)
      .then((r) => r.json())
      .then((d: F1Schedule) => {
        if (alive && d?.rounds) setYearSchedule(d);
      })
      .catch(() => {})
      .finally(() => alive && setYearLoading(false));
    return () => {
      alive = false;
    };
  }, [year, schedule]);

  const sessionOptions = useMemo(() => {
    if (!yearSchedule) return [];
    return yearSchedule.rounds
      .flatMap((r) => r.sessions.map((s) => ({ session: s, meeting: r.meeting })))
      .sort(
        (a, b) =>
          new Date(a.session.date_start).getTime() - new Date(b.session.date_start).getTime()
      );
  }, [yearSchedule]);

  // Default session: live → latest completed. Recomputed per year schedule.
  useEffect(() => {
    if (sessionKey != null || sessionOptions.length === 0) return;
    const nowMs = Date.now();
    const live = sessionOptions.find(
      (o) =>
        nowMs >= new Date(o.session.date_start).getTime() &&
        nowMs <= new Date(o.session.date_end ?? o.session.date_start).getTime()
    );
    if (live) {
      setSessionKey(live.session.session_key);
      return;
    }
    const done = [...sessionOptions]
      .reverse()
      .find((o) => nowMs > new Date(o.session.date_end ?? o.session.date_start).getTime());
    if (done) setSessionKey(done.session.session_key);
  }, [sessionOptions, sessionKey]);

  const loadResults = useCallback(async (key: number) => {
    const id = ++reqId.current;
    setResultsLoading(true);    try {
      const res = await fetch(`/api/f1/results?session=${key}`);
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as F1ResultsPayload;
      if (id !== reqId.current) return;
      setResults(data);
      setFailed(false);
    } catch {
      if (id !== reqId.current) return;
      setResults(null);
      setFailed(true);
    } finally {
      if (id === reqId.current) setResultsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionKey == null) return;
    void loadResults(sessionKey);
  }, [sessionKey, loadResults]);

  // Ordered jump-in from the session-records strip (F1TV weekend sheet):
  // pin the year back to the dashboard's and load that session.
  const presetNonce = presetSession?.nonce ?? 0;
  useEffect(() => {
    if (!presetNonce || presetSession?.key == null) return;
    setYear(schedule.year);
    setSessionKey(presetSession.key);
    setResults(null);
    setDrivers([]);
    onPicksChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetNonce]);

  // Adaptation: seed the chips with the top-3 classified drivers the first
  // time a session lands, so the view has life without anything selected.
  useEffect(() => {
    if (!results || failed || resultsLoading) return;
    setDrivers((prev) =>
      prev.length ? prev : results.results.filter((r) => !r.dns).slice(0, 3).map((r) => r.acronym)
    );
  }, [results, failed, resultsLoading]);

  const meetingOfSession = (key: number) =>
    sessionOptions.find((o) => o.session.session_key === key)?.meeting ?? null;

  const sessionsOfMeeting = (meetingKey: number) => {
    const seen = new Map<string, { name: string; key: number }>();
    for (const o of sessionOptions) {
      if (o.meeting.meeting_key !== meetingKey) continue;
      if (!seen.has(o.session.session_name)) {
        seen.set(o.session.session_name, { name: o.session.session_name, key: o.session.session_key });
      }
    }
    return [...seen.values()].sort((a, b) => sessionRank(a.name) - sessionRank(b.name));
  };

  const currentMeeting = results ? meetingOfSession(results.session.session_key) : null;

  // The session dropdown rides on the meeting the loaded results belong to;
  // while results are in flight (or failed) fall back to the meeting that owns
  // the pinned sessionKey, so the choices never blank out mid-hand-off.
  const sessionChoices = useMemo((): { name: string; key: number }[] => {
    if (currentMeeting) return sessionsOfMeeting(currentMeeting.meeting_key);
    const fallback = sessionKey != null ? meetingOfSession(sessionKey) : null;
    return fallback ? sessionsOfMeeting(fallback.meeting_key) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMeeting, sessionOptions, sessionKey]);

  // Rows of the session chart + matrix: the selected chips, session order.
  const picked = useMemo(() => {
    if (!results) return [];
    return results.results.filter((r) => drivers.includes(r.acronym));
  }, [results, drivers]);

  // ---- their `Zp.onLapSelect` — add a lap with the palette walk ------------
  const addPick = useCallback(
    (driverNumber: number, lap: number) => {
      if (sessionKey == null || !results) return;
      const row = results.results.find((r) => r.driverNumber === driverNumber);
      if (!row) return;
      // Guard: silently no-op when the lap already rides in the deck.
      if (picks.some((p) => p.driverNumber === driverNumber && p.lap === lap && p.sessionKey === sessionKey))
        return;
      let colour = `#${row.teamColour}`;
      let g = 0;
      while (picks.some((p) => p.colour === colour && g < FALLBACK_LAP_COLORS.length)) {
        colour = FALLBACK_LAP_COLORS[g++];
      }
      onPicksChange([...picks, { driverNumber, lap, sessionKey, colour }].slice(-4));
      toastLapAdded();
    },
    [sessionKey, results, picks, onPicksChange, toastLapAdded]
  );

  const removePick = useCallback(
    (driverNumber: number, lap: number) => {
      onPicksChange(picks.filter((p) => !(p.driverNumber === driverNumber && p.lap === lap)));
    },
    [picks, onPicksChange]
  );

  // ---- their `Zp.selectFastestLaps` — one fastest lap per selected chip ----
  const compareFastest = useCallback(() => {
    if (!results || sessionKey == null) return;
    const reserved = new Set(picks.map((p) => p.colour).filter((c): c is string => !!c));
    const additions: F1LapPick[] = [];
    for (const d of picked) {
      // Theirs targets the OpenF1 IsPersonalBest row; ours the lap matching
      // the driver's fastest timed lap (last of equals).
      const timed = d.laps.filter((l) => l.time != null && !l.deleted);
      if (!timed.length) continue;
      const bestT = Math.min(...timed.map((l) => l.time as number));
      const bestLap = timed.filter((l) => l.time === bestT).pop()!;
      if (
        picks.some(
          (p) => p.driverNumber === d.driverNumber && p.lap === bestLap.lap && p.sessionKey === sessionKey
        )
      )
        continue;
      let colour = `#${d.teamColour}`;
      let g = 0;
      while (reserved.has(colour) && g < FALLBACK_LAP_COLORS.length) colour = FALLBACK_LAP_COLORS[g++];
      reserved.add(colour);
      additions.push({ driverNumber: d.driverNumber, lap: bestLap.lap, sessionKey, colour });
    }
    if (additions.length) onPicksChange([...picks, ...additions].slice(-4));
    goToTelemetry();
  }, [results, sessionKey, picks, picked, onPicksChange, goToTelemetry]);

  // ---- session chart rows (their `kR`) -------------------------------------
  const sessionRows = useMemo((): ChartRow[] => {
    if (!results) return [];
    const rows: ChartRow[] = [];
    for (const d of picked) {
      const timed = d.laps.filter((l) => l.time != null && !l.deleted);
      const best = timed.length ? Math.min(...timed.map((l) => l.time as number)) : null;
      for (const lap of d.laps) {
        if (lap.time == null) continue;
        // Their IsHotLap gate has no OpenF1 analogue; the outlier heuristic: a
        // deleted lap or a lap slower than 1.15× the driver's best hides
        // until "Show outliers" is on.
        const isOutlier = lap.deleted || (best != null ? lap.time > best * 1.15 : false);
        if (isOutlier && !showOutliers) continue;
        rows.push({
          [d.acronym]: lap.time,
          Compound: lap.compound ?? "",
          LapNumber: lap.lap,
          LapStartTimestamp: new Date(lap.dateStart).getTime(),
          dataKey: d.acronym,
        });
      }
    }
    return rows.sort((a, b) => (a.LapNumber as number) - (b.LapNumber as number));
  }, [results, picked, showOutliers]);

  // ---- their colour map `E`: team colour per driver, first-use wins, ------
  // collisions fall to the theme stand-in (white on a dark sheet).
  const series = useMemo((): ChartSeries[] => {
    const seen = new Set<string>();
    return picked.map((d) => {
      const team = d.teamColour ? `#${d.teamColour}` : "#FFFFFF";
      let colour = team;
      if (seen.has(team)) colour = "#FFFFFF";
      else seen.add(team);
      return { key: d.acronym, colour, label: d.acronym };
    });
  }, [picked]);

  // ---- the x-axis mode: lap number on races/sprints, else wall-clock ------
  const mode: XAxisKey =
    results && LAP_AXIS_SESSIONS.includes(results.session.session_name)
      ? "LapNumber"
      : "LapStartTimestamp";
  const [xKey, setXKey] = useState<XAxisKey>(mode);
  useEffect(() => setXKey(mode), [mode]);

  // ---- their tick algorithm `P` ---------------------------------------------
  const xTicks = useMemo((): number[] => {
    if (sessionRows.length === 0) return [];
    if (xKey === "LapStartTimestamp") {
      const vals = sessionRows.map((r) => r.LapStartTimestamp as number);
      const V = Math.min(...vals);
      const Z = Math.max(...vals);
      if (V === Z) return [V];
      const S = isMobile ? 4 : 7;
      return Array.from({ length: S }, (_, i) => V + i * ((Z - V) / (S - 1)));
    }
    const laps = sessionRows.map((r) => r.LapNumber as number);
    const I = Math.min(...laps);
    const D = Math.max(...laps);
    if (I === D) return [I];
    const k = D - I;
    const N = Math.max(1, Math.ceil(k / (isMobile ? 6 : 12)));
    const H: number[] = [];
    for (let U = I; U <= D; U += N) H.push(U);
    if (H[H.length - 1] !== D) H.push(D);
    return H;
  }, [sessionRows, xKey, isMobile]);

  // ---- the activeDot drill: a clicked dot pulls that lap into the deck ----
  const addPickByName = useCallback(
    (acronym: string, lap: number) => {
      const row = results?.results.find((r) => r.acronym === acronym);
      if (!row) return;
      addPick(row.driverNumber, lap);
    },
    [results, addPick]
  );

  const zoom = useZoomState();
  const flipAxis = useCallback(() => {
    setXKey((k) => (k === "LapNumber" ? "LapStartTimestamp" : "LapNumber"));
    zoom.zoomOut();
  }, [zoom]);

  // ---- lap matrix data: one row per selected driver, one column per lap ----
  const maxLapNumber = useMemo(
    () => picked.reduce((m, d) => Math.max(m, ...d.laps.map((l) => l.lap)), 0),
    [picked]
  );

  const selectClass =
    "h-10 w-full cursor-pointer appearance-none rounded-lg border border-white/[0.09] bg-[#191a20] px-3 pr-9 text-[13px] font-medium text-white/90 outline-none transition focus:border-[#e10600] focus:ring-1 focus:ring-[#e10600]/40 hover:border-white/20 [&>option]:bg-[#191a20] [&>option]:text-white";

  const chevron = (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-white/40"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7l-7-7" />
    </svg>
  );

  // =========================================================================
  // Left rail — their `d9` column: selects (AI) + chips (MI) + compare button
  // =========================================================================
  const leftRail = (
    <div className="w-full md:w-64">
      <div className="flex flex-col gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
            Season
          </span>
          <span className="relative block">
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setSessionKey(null);
                setResults(null);
                setDrivers([]);
                onPicksChange([]);
              }}
              aria-label="Season"
              className={selectClass}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y} Season
                </option>
              ))}
            </select>
            {chevron}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
            Grand Prix
          </span>
          <span className="relative block">
            <select
              value={currentMeeting?.meeting_key ?? ""}
              onChange={(e) => {
                const mk = Number(e.target.value);
                const first = sessionsOfMeeting(mk)[0];
                if (first) setSessionKey(first.key);
                onPicksChange([]);
              }}
              aria-label="Grand Prix"
              disabled={!yearSchedule}
              className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {yearLoading || !yearSchedule ? (
                <option>Loading…</option>
              ) : (
                // Newest round first, with the calendar's own numbering — the
                // same ordering the analytics picker uses.
                yearSchedule.rounds
                  .map((r, i) => ({ r, n: i + 1 }))
                  .reverse()
                  .map(({ r, n }) => (
                    <option key={r.meeting.meeting_key} value={r.meeting.meeting_key}>
                      {`${n} - ${r.meeting.meeting_name}`}
                    </option>
                  ))
              )}
            </select>
            {chevron}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
            Session
          </span>
          <span className="relative block">
            <select
              value={results?.session.session_key ?? sessionKey ?? ""}
              onChange={(e) => {
                setSessionKey(Number(e.target.value));
                onPicksChange([]);
              }}
              aria-label="Session"
              disabled={sessionKey == null}
              className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {sessionChoices.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            {chevron}
          </span>
        </label>
        {failed && (
          <div role="status" className="text-xs text-[#ff6b61]">
            <p>Couldn't load results for this session.</p>
            <button
              type="button"
              onClick={() => sessionKey != null && void loadResults(sessionKey)}
              disabled={resultsLoading || sessionKey == null}
              className="mt-2 inline-flex h-8 items-center rounded-md border border-[#ff6b61]/50 px-2.5 text-[10px] font-black uppercase tracking-[0.12em] transition hover:bg-[#ff6b61]/15 disabled:opacity-50"
            >
              {resultsLoading ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}
      </div>

      {/* Their MI — the driver chip grid (20 skeletons while loading) */}
      {results ? (
        <div
          className="my-3 grid w-full grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5"
          role="group"
          aria-label="Drivers"
        >
          {results.results.map((d) => {
            const selected = drivers.includes(d.acronym);
            const hasLaps = d.laps.some((l) => l.time != null);
            const c = d.teamColour ? `#${d.teamColour}` : "#cccccc";
            return hasLaps ? (
              <button
                key={d.driverNumber}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setDrivers((prev) => (prev.includes(d.acronym) ? prev.filter((a) => a !== d.acronym) : [...prev, d.acronym]))
                }
                title={d.fullName}
                className={`f1-in inline-flex h-9 flex-1 items-center justify-center rounded-md border px-1 text-xs transition duration-150 hover:brightness-125 active:scale-[0.97] ${
                  selected ? "font-bold shadow-[0_0_10px_rgba(0,0,0,0.35)]" : "font-normal"
                }`}
                style={{
                  color: c,
                  borderColor: selected ? c : `${c}66`,
                  backgroundColor: selected ? `${c}45` : `${c}0f`,
                }}
              >
                <span className="w-8 truncate">{d.acronym}</span>
              </button>
            ) : (
              <span
                key={d.driverNumber}
                className="f1-in inline-flex h-9 flex-1 cursor-not-allowed items-center justify-center rounded-md border px-1 text-xs"
                style={{ color: `${c}40`, borderColor: `${c}2e`, backgroundColor: "transparent" }}
                aria-disabled="true"
              >
                <span className="w-8 line-through">{d.acronym}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="my-3 grid w-full grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-white/[0.04]" />
          ))}
        </div>
      )}

      {/* Their compare button: n = the picked drivers; disabled without laps */}
      <div className="flex flex-col">
        {drivers.length > 0 && (
          <button
            type="button"
            onClick={compareFastest}
            disabled={picks.length === 0 || resultsLoading}
            className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#e10600] px-3 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[0_2px_14px_rgb(225_6_0/0.35)] transition hover:bg-[#ff2421] hover:shadow-[0_2px_18px_rgb(225_6_0/0.5)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
          >
            Compare fastest laps
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  // =========================================================================
  // Right column — their `XV`: chart (YH) over the lap matrix (KV)
  // =========================================================================
  const rightCol = resultsLoading ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-md">
      <div className="h-[300px] w-full animate-pulse rounded-xl bg-white/[0.045]" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-white/[0.045]" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-white/[0.045]" />
    </div>
  ) : !results || picked.length === 0 ? (
    <div className="flex h-[360px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 p-10 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-white/20" aria-hidden="true">
        <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m7 14 4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-sm text-white/50">
        Data will be shown here when you have selected drivers.
      </p>
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/25">
        Tap a driver chip on the left
      </p>
    </div>
  ) : (
    <div className="flex flex-1 flex-col gap-4 md:w-64">
      {/* YH — the session chart, with its OWN zoom instance */}
      <div className="relative h-[360px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#101016] shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
        <ChartKit
          rows={sessionRows}
          series={series}
          xKey={xKey}
          yLabel="LAP TIME"
          yAxisWidthDesktop={60}
          tickFmtY={axisSecF}
          tickFmtX={xKey === "LapStartTimestamp" ? clock : undefined}
          xTicks={xTicks}
          grid
          legend
          bottomInset={72}
          lineType="monotone"
          idleDots
          dotFill={(row) => dotForCompound(row.Compound as string)}
          onDotPick={(seriesKey, row) => {
            const lap = row.LapNumber;
            if (typeof lap === "number") addPickByName(seriesKey, lap);
          }}
          related={(row) => sessionRows.filter((r) => r.LapNumber === row.LapNumber)}
          tooltipTitle={(row) => {
            const n = row.LapNumber as number;
            if (!n) return null;
            if (xKey === "LapStartTimestamp") {
              const t = row.LapStartTimestamp;
              return t != null ? `Lap ${n} (${clock(t as number)})` : `Lap ${n}`;
            }
            return `Lap ${n}`;
          }}
          valueFmt={(v) => lapFmtF(v)}
          zoom={zoom}
          className="watermark h-full w-full"
        />
        {/* their flip button sits under the axis: bold word = active axis */}
        <button
          type="button"
          onPointerUp={flipAxis}
          className="absolute bottom-1 left-1/2 mx-auto -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#15151e]/90 px-2.5 py-1.5 text-[10.5px] font-medium tracking-[0.08em] text-white/45 backdrop-blur-sm transition hover:border-white/25 hover:text-white/80"
        >
          {xKey === "LapStartTimestamp" ? (
            <>
              <strong className="font-bold text-white">TIME</strong> / LAP NUMBER
            </>
          ) : (
            <>
              TIME / <strong className="font-bold text-white">LAP NUMBER</strong>
            </>
          )}
        </button>
        {/* their floating reset (bottom-right, only when zoomed) */}
        {zoom.zoomed && (
          <button
            type="button"
            onClick={zoom.zoomOut}
            title="Reset zoom"
            className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-[#15151e]/90 text-white/70 backdrop-blur-sm transition hover:border-white/25 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {/* their Show outliers toggle (bottom-left) */}
        <button
          type="button"
          role="switch"
          aria-checked={showOutliers}
          onClick={() => setShowOutliers((v) => !v)}
          className="absolute bottom-2 left-2 flex select-none items-center gap-1.5 text-[11px] font-medium text-white/55 transition hover:text-white"
        >
          <span
            className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${showOutliers ? "bg-[#e10600]" : "bg-white/15"}`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all duration-200 ${
                showOutliers ? "left-3.5" : "left-0.5"
              }`}
            />
          </span>
          Show outliers
        </button>
      </div>

      {/* KV — the lap matrix */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#101016] shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#191a20]">
              <th className="sticky left-0 z-[1] w-8 truncate border-b border-white/[0.07] bg-[#191a20] px-1 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-white/45" scope="col">
                Lap
              </th>
              {Array.from({ length: maxLapNumber }, (_, i) => (
                <th
                  key={i}
                  scope="col"
                  className="min-w-[3.25rem] border-b border-white/[0.07] bg-[#191a20] px-1 py-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 tabular-nums"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picked.map((d) => {
              const cell = (lap: number) => d.laps.find((l) => l.lap === lap);
              const timed = d.laps.filter((l) => l.time != null && !l.deleted);
              const driverBest = timed.length ? Math.min(...timed.map((l) => l.time as number)) : null;
              return (
                <tr key={d.driverNumber} className="border-b border-white/[0.04] last:border-0">
                  <td className="sticky left-0 z-[1] truncate border-r border-white/[0.07] bg-[#15151e] px-1 py-1.5 text-white/80">
                    <span className="w-8 font-f1 text-[11px] font-bold uppercase">{d.acronym}</span>
                  </td>
                  {Array.from({ length: maxLapNumber }, (_, i) => {
                    const lap = i + 1;
                    const l = cell(lap);
                    const isPicked = picks.some(
                      (p) => p.driverNumber === d.driverNumber && p.lap === lap && p.sessionKey === results.session.session_key
                    );
                    const isPb = l?.time != null && !l.deleted && driverBest === l.time;
                    // Session fastest wins over personal best (F1TV paints the
                    // pole violet even when it doubles as the driver's PB).
                    const isSessionBest =
                      l?.time != null &&
                      !l.deleted &&
                      results.sessionBest != null &&
                      l.time === results.sessionBest;
                    return (
                      <td key={lap} className="px-1 py-1.5">
                        {l?.time ? (
                          <button
                            type="button"
                            onClick={() =>
                              isPicked ? removePick(d.driverNumber, lap) : addPick(d.driverNumber, lap)
                            }
                            /* Their HasTelemetry gate: reelhouse loads any timed lap. */
                            className="flex h-8 w-full items-center justify-center gap-1 rounded-md border border-white/[0.07] bg-black/30 text-xs tabular-nums transition duration-150 hover:border-white/30 hover:bg-white/[0.07] active:scale-[0.97]"
                            style={
                              isSessionBest
                                ? {
                                    borderColor: "rgba(178, 82, 255, 0.55)",
                                    backgroundColor: "rgba(148, 60, 235, 0.14)",
                                  }
                                : isPb
                                  ? {
                                      borderColor: "rgba(0, 200, 60, 0.45)",
                                      backgroundColor: "rgba(0, 170, 60, 0.1)",
                                    }
                                  : undefined
                            }
                            title={
                              `Lap ${lap} · ${l.compound ? l.compound : "?"}` +
                              (l.deleted ? " · deleted" : "") +
                              (isSessionBest ? " · session fastest" : "") +
                              (isPb ? " · personal best" : "")
                            }
                          >
                            <TyreBadge compound={l.compound} size={13} />
                            {l.deleted ? <s className="text-white/40">{lapFmtF(l.time)}</s> : <span className="text-white/90">{lapFmtF(l.time)}</span>}
                            {isPicked && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3 shrink-0 text-[#00c050]" aria-hidden="true">
                                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        ) : (
                          <span
                            className="flex h-8 w-full cursor-not-allowed items-center justify-center rounded-md bg-white/[0.015] text-white/20"
                            aria-disabled="true"
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend (F1 timing colours: green = personal best, violet = session
          fastest of the whole session, green check = loaded, strike = deleted) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ borderColor: "rgba(0,200,60,0.5)", backgroundColor: "rgba(0,170,60,0.12)" }} aria-hidden="true" />
          personal best
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ borderColor: "rgba(178,82,255,0.55)", backgroundColor: "rgba(148,60,235,0.16)" }} aria-hidden="true" />
          session fastest
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-2.5 w-2.5 text-[#00c050]" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          loaded into telemetry
        </span>
        <span className="inline-flex items-center gap-1.5">
          <s>deleted</s>
        </span>
      </div>
    </div>
  );

  return (
    <section
      aria-label="Session centre"
      aria-busy={resultsLoading}
      className="f1-card rounded-2xl p-4 md:p-6"
    >
      <div className={`space-y-2 ${viewMode === "tabbed" ? "min-h-[calc(100vh-11rem)]" : ""}`}>
        <div className="flex w-full flex-col gap-4 md:flex-row">
          {leftRail}
          {rightCol}
        </div>
      </div>
    </section>
  );
}
