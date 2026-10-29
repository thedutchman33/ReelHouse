"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CricketDashboardData, CricketMatch, Gender } from "@/lib/cricket/types";
import {
  MATCH_WATCH_GRACE_MS,
  persistEndedAt,
  pickFeaturedMatch,
  readEndedAt,
  type EndedAtMap,
} from "@/lib/cricket/watch-window";
import { useNow } from "./Countdown";
import MatchHero from "./MatchHero";
import SeasonCalendar from "./SeasonCalendar";
import MatchCentre from "./MatchCentre";
import Rankings from "./Rankings";
import PlayerDirectory from "./PlayerDirectory";

const GENDERS: { key: Gender; label: string }[] = [
  { key: "men", label: "Men" },
  { key: "women", label: "Women" },
];

function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

function mergeMatches(data: CricketDashboardData, extra: CricketMatch[] = []): CricketMatch[] {
  const seen = new Set<string>();
  return [...data.fixtures, ...data.results, ...extra]
    .filter((match) => {
      if (seen.has(match.gid)) return false;
      seen.add(match.gid);
      return true;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** A live snapshot from just before the feed dropped the match. */
function asEnded(match: CricketMatch): CricketMatch {
  const stillChasing = /need .*runs? to win|require/i.test(match.result ?? "");
  return {
    ...match,
    status: "completed",
    statusLabel: "Result",
    live: false,
    result: stillChasing || !match.result ? "Match ended" : match.result,
  };
}

/** Hold the just-finished match as a result even if a stale fixture row says upcoming. */
function applyEndedWindow(
  matches: CricketMatch[],
  endedAt: EndedAtMap,
  now: number
): CricketMatch[] {
  return matches.map((match) => {
    const at = endedAt[match.gid];
    if (at === undefined || match.status === "live" || now < at || now - at >= MATCH_WATCH_GRACE_MS) {
      return match;
    }
    return asEnded(match);
  });
}

export default function CricketDashboard() {
  const now = useNow(1000);
  const [gender, setGender] = useState<Gender>("men");
  const [data, setData] = useState<CricketDashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [requested, setRequested] = useState<{ gid: string; nonce: number } | null>(null);
  const nonce = useRef(0);
  const hasData = useRef(false);
  const [endedAt, setEndedAt] = useState<EndedAtMap>({});
  const endedAtRef = useRef<EndedAtMap>({});
  const liveSnapshots = useRef(new Map<string, { match: CricketMatch; seenAt: number }>());

  useEffect(() => {
    const stored = readEndedAt();
    endedAtRef.current = stored;
    setEndedAt(stored);
  }, []);

  // The live feed drops a match as soon as it finishes, while the result list
  // can lag by several minutes. Remember the last live snapshot and start a
  // 30-minute watch window at that point, so the hero does not jump to the next
  // fixture the instant the final ball lands.
  useEffect(() => {
    if (!data) return;
    const stamp = Date.now();
    const liveNow = new Map<string, CricketMatch>();
    for (const match of [...data.fixtures, ...data.results]) {
      if (match.status === "live") liveNow.set(match.gid, match);
    }
    for (const match of liveNow.values()) {
      liveSnapshots.current.set(match.gid, { match, seenAt: stamp });
    }

    const next = { ...endedAtRef.current };
    let changed = false;
    for (const gid of liveNow.keys()) {
      if (next[gid] !== undefined) {
        delete next[gid];
        changed = true;
      }
    }
    for (const match of [...data.fixtures, ...data.results]) {
      if (match.status !== "completed" || !match.endedAt || liveNow.has(match.gid)) continue;
      const at = Date.parse(match.endedAt);
      if (!Number.isFinite(at)) continue;
      if (next[match.gid] !== at) {
        next[match.gid] = at;
        changed = true;
      }
    }
    for (const [gid, snapshot] of liveSnapshots.current) {
      if (snapshot.match.gender !== data.gender) {
        liveSnapshots.current.delete(gid);
        continue;
      }
      if (liveNow.has(gid) || next[gid] !== undefined) continue;
      next[gid] = snapshot.seenAt;
      changed = true;
    }
    if (changed) {
      endedAtRef.current = next;
      setEndedAt(next);
      persistEndedAt(next);
    }
    for (const [gid, snapshot] of liveSnapshots.current) {
      const at = next[gid];
      if (at !== undefined && stamp - at > MATCH_WATCH_GRACE_MS) {
        liveSnapshots.current.delete(gid);
      }
    }
  }, [data]);

  const load = useCallback(async (target: Gender, signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/cricket?gender=${target}`, { signal });
      if (!response.ok) throw new Error("cricket feed unavailable");
      const payload = (await response.json()) as CricketDashboardData;
      setData(payload);
      setFailed(false);
      setStale(false);
      setLastUpdated(Date.now());
      hasData.current = true;
    } catch {
      if (signal?.aborted) return;
      if (hasData.current) setStale(true);
      else setFailed(true);
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    hasData.current = false;
    setData(null);
    setFailed(false);
    setStale(false);
    setLastUpdated(null);
    setRequested(null);

    void load(gender, controller.signal);
    const timer = window.setInterval(() => {
      void load(gender, controller.signal);
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [gender, load]);

  const openMatch = (match: CricketMatch) => {
    if (match.status === "upcoming") {
      document.getElementById("ck-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    nonce.current += 1;
    setRequested({ gid: match.gid, nonce: nonce.current });
    window.setTimeout(() => {
      document.getElementById("ck-match-centre")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  if (failed) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-surface/40 px-6 py-16 text-center">
        <p className="font-f1 text-lg font-bold uppercase tracking-wide text-white">Cricket feed unavailable</p>
        <button
          type="button"
          onClick={() => void load(gender)}
          disabled={refreshing}
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-[#1d509e] px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#2f6fd0] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {refreshing ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  const endedSnapshots = [...liveSnapshots.current.values()]
    .filter(({ match }) => {
      const at = endedAt[match.gid];
      if (at === undefined || now < at || now - at >= MATCH_WATCH_GRACE_MS) return false;
      if (data.fixtures.some((entry) => entry.gid === match.gid && entry.status === "live")) return false;
      return true;
    })
    .map(({ match }) => asEnded(match));

  const allMatches = applyEndedWindow(mergeMatches(data, endedSnapshots), endedAt, now);
  const featured = pickFeaturedMatch(allMatches, endedAt, now);
  const featuredEndedAt = featured ? endedAt[featured.gid] : undefined;
  const watchEndISO =
    featuredEndedAt === undefined
      ? null
      : new Date(featuredEndedAt + MATCH_WATCH_GRACE_MS).toISOString();
  const scorecardPool = applyEndedWindow(
    mergeMatches(
      {
        ...data,
        fixtures: data.fixtures.filter((match) => match.status === "live"),
      },
      endedSnapshots
    ),
    endedAt,
    now
  )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 24);
  // A calendar card can point at a result older than the recent-match window.
  // Keep that match in the list so the match centre can actually select it.
  const requestedMatch = requested
    ? allMatches.find((match) => match.gid === requested.gid) ?? null
    : null;
  // The featured match is the next fixture, which has no result yet. Keep it
  // selectable so the match centre can show the announced squads before the
  // toss rather than jumping straight to the last completed game.
  const poolWithNext =
    featured && !scorecardPool.some((match) => match.gid === featured.gid)
      ? [featured, ...scorecardPool]
      : scorecardPool;
  const scorecardMatches =
    requestedMatch && !poolWithNext.some((match) => match.gid === requestedMatch.gid)
      ? [requestedMatch, ...poolWithNext]
      : poolWithNext;
  const ago = lastUpdated == null ? "not yet" : fmtAgo(now - lastUpdated);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-white/40">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              stale ? "bg-[#f0b429]" : "bg-[#22c55e] shadow-[0_0_6px_rgb(34_197_94/0.8)]"
            }`}
          />
          <span>{stale ? "Last refresh failed" : `Updated ${ago}`}</span>
          <button
            type="button"
            onClick={() => void load(gender)}
            disabled={refreshing}
            aria-label="Refresh cricket data"
            title="Refresh cricket data"
            className="ml-0.5 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-black/30 text-white/55 transition hover:border-[#3f78d8] hover:text-white disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div
          role="group"
          aria-label="Team"
          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/25 p-0.5"
        >
          {GENDERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setGender(entry.key)}
              aria-pressed={gender === entry.key}
              className={`rounded-[6px] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] transition ${
                gender === entry.key
                  ? "bg-[#1d509e] text-white shadow-[0_0_10px_rgb(29_80_158/0.45)]"
                  : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {stale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0b429]/40 bg-[#f0b429]/10 px-4 py-3 text-[13px] text-[#ffd27a]"
        >
          <p>Showing the last successful update.</p>
          <button
            type="button"
            onClick={() => void load(gender)}
            disabled={refreshing}
            className="rounded-md border border-[#f0b429]/50 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] transition hover:bg-[#f0b429]/20 disabled:opacity-60"
          >
            Retry
          </button>
        </div>
      )}

      {featured ? (
        <MatchHero
          match={featured}
          now={now}
          watchEndISO={watchEndISO}
          onOpen={() => openMatch(featured)}
        />
      ) : (
        <div className="f1-card rounded-2xl px-6 py-16 text-center">
          <p className="font-f1 text-sm font-bold uppercase tracking-[0.08em] text-white/70">No fixtures scheduled</p>
        </div>
      )}

      <SeasonCalendar matches={allMatches} now={now} gender={gender} onOpenMatch={openMatch} />

      <MatchCentre matches={scorecardMatches} requested={requested} />

      <Rankings gender={gender} players={data.players} />

      <PlayerDirectory players={data.players} gender={gender} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading cricket dashboard">
      <div className="flex items-center justify-between gap-3">
        <div className="h-3 w-36 animate-pulse rounded bg-white/[0.07]" />
        <div className="h-8 w-44 animate-pulse rounded-lg bg-white/[0.05]" />
      </div>
      <div className="f1-card rounded-2xl p-5 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="h-5 w-40 animate-pulse rounded bg-white/[0.06]" />
            <div className="mt-4 h-12 w-[70%] animate-pulse rounded bg-white/[0.08]" />
            <div className="mt-2 h-12 w-[46%] animate-pulse rounded bg-white/[0.06]" />
            <div className="mt-4 h-4 w-60 animate-pulse rounded bg-white/[0.04]" />
            <div className="mt-7 grid max-w-md grid-cols-4 gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-[86px] animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          </div>
          <div className="mx-auto h-[220px] w-[250px] animate-pulse rounded-2xl bg-white/[0.04] sm:w-[290px] lg:w-[330px]" />
        </div>
      </div>
      <div className="f1-card rounded-2xl p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[0.08]" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[112px] animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </div>
  );
}
