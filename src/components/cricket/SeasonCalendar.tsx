"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CricketMatch, Gender } from "@/lib/cricket/types";
import { formatShortDate, opponentTeam } from "@/lib/cricket/shared";
import { MiniCountdown } from "./Countdown";
import SquadModal from "./SquadModal";
import { TeamFlag } from "./TeamFlag";

interface CalendarGroup {
  key: string;
  eyebrow: string;
  title: string;
  /** Word after the title: "calendar" for a format, "series" for a tour. */
  noun?: string;
  empty: string;
  matches: CricketMatch[];
}

function yearRange(matches: CricketMatch[]): string {
  const years = [...new Set(matches.map((match) => new Date(match.date).getUTCFullYear()))].sort();
  if (!years.length) return "No dates";
  if (years.length === 1) return String(years[0]);
  return `${years[0]}–${String(years[years.length - 1]).slice(-2)}`;
}

function isWorldCupSeries(match: CricketMatch): boolean {
  return match.format === "ODI" && /world cup/i.test(match.series);
}

function isCwc2027(match: CricketMatch): boolean {
  return isWorldCupSeries(match) && new Date(match.date).getUTCFullYear() === 2027;
}

const DAY_MS = 86_400_000;

interface SeriesGroup {
  name: string;
  matches: CricketMatch[];
  total: number;
  completed: number;
  live: number;
}

function seriesGroups(matches: CricketMatch[]): SeriesGroup[] {
  const grouped = new Map<string, CricketMatch[]>();
  for (const match of matches) {
    const list = grouped.get(match.series) ?? [];
    list.push(match);
    grouped.set(match.series, list);
  }
  return [...grouped].map(([name, list]) => {
    const sorted = [...list].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return {
      name,
      matches: sorted,
      total: sorted.length,
      completed: sorted.filter((match) => match.status === "completed").length,
      live: sorted.filter((match) => match.status === "live").length,
    };
  });
}

function nearestMatchMs(group: SeriesGroup, now: number): number {
  return Math.min(...group.matches.map((match) => Math.abs(new Date(match.date).getTime() - now)));
}

/**
 * The series India is in the middle of right now: a live match first, then a
 * run whose first and last dates bracket today, then the next one on the
 * horizon, and finally the most recent finished tour.
 */
function currentSeries(
  groups: SeriesGroup[],
  now: number
): { group: SeriesGroup; label: string } | null {
  if (!groups.length) return null;
  const live = groups.find((group) => group.live > 0);
  if (live) return { group: live, label: "Live series" };

  const ongoing = groups
    .filter((group) => {
      const first = new Date(group.matches[0].date).getTime();
      const last = group.matches[group.matches.length - 1];
      const end = new Date(last.endDate ?? last.date).getTime() + DAY_MS;
      return first <= now && now < end;
    })
    .sort((a, b) => nearestMatchMs(a, now) - nearestMatchMs(b, now))[0];
  if (ongoing) return { group: ongoing, label: "Currently playing series" };

  const upcoming = groups
    .filter((group) => new Date(group.matches[0].date).getTime() > now)
    .sort((a, b) => new Date(a.matches[0].date).getTime() - new Date(b.matches[0].date).getTime());
  if (upcoming.length) return { group: upcoming[0], label: "Next series" };

  const latest = [...groups].sort(
    (a, b) =>
      new Date(b.matches[b.matches.length - 1].date).getTime() -
      new Date(a.matches[a.matches.length - 1].date).getTime()
  )[0];
  return latest ? { group: latest, label: "Latest series" } : null;
}

function CalendarCard({
  group,
  now,
  onOpenMatch,
}: {
  group: CalendarGroup;
  now: number;
  onOpenMatch: (match: CricketMatch) => void;
}) {
  const [squadMatch, setSquadMatch] = useState<CricketMatch | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: true, r: false });
  const today = new Date(now).getUTCFullYear();

  const measureEdge = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setEdge({
      l: el.scrollLeft <= 1,
      r: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  const next = group.matches.find((match) => {
    if (match.status === "live") return true;
    return match.status === "upcoming" && new Date(match.date).getTime() >= now;
  });

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-next]");
    if (card) {
      el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
    } else {
      el.scrollLeft = 0;
    }
    measureEdge();
    el.addEventListener("scroll", measureEdge, { passive: true });
    window.addEventListener("resize", measureEdge);
    return () => {
      el.removeEventListener("scroll", measureEdge);
      window.removeEventListener("resize", measureEdge);
    };
  }, [group.matches.length, next?.gid, measureEdge]);

  const openCard = (match: CricketMatch) => {
    if (match.status === "upcoming") setSquadMatch(match);
    else onOpenMatch(match);
  };

  const scrollStrip = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 280), behavior: "smooth" });
  };

  const onStripKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollStrip(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollStrip(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }
  };

  const doneCount = group.matches.filter((match) => match.status === "completed").length;
  const progressPct = group.matches.length ? Math.round((doneCount / group.matches.length) * 100) : 0;

  return (
    <article className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec] shadow-[0_0_6px_rgb(143_180_236/0.8)]" />
            {group.eyebrow}
          </p>
          <p className="mt-1 font-display text-2xl font-black uppercase leading-none tracking-wide text-white sm:text-[27px]">
            {group.title} <span className="italic text-[#8fb4ec]">{group.noun ?? "calendar"}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="mr-1 hidden text-right text-[11.5px] font-semibold uppercase leading-tight tracking-[0.18em] text-white/35 sm:block">
            {group.matches.length ? (
              <>
                {group.matches.length} {group.matches.length === 1 ? "match" : "matches"} · {yearRange(group.matches)}
                {" "}
                · <span className="tabular-nums text-[#8fb4ec]">{doneCount} done</span>
              </>
            ) : (
              "No fixtures"
            )}
          </p>
          <button
            type="button"
            aria-label={`Earlier ${group.title} matches`}
            disabled={edge.l || group.matches.length === 0}
            onClick={() => scrollStrip(-1)}
            className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/30 text-white/60 transition hover:border-[#8fb4ec] hover:bg-[#1d509e] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <svg viewBox="0 0 8 12" className="h-3 w-2" aria-hidden="true">
              <path d="M6.5 1 2 6l4.5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`Later ${group.title} matches`}
            disabled={edge.r || group.matches.length === 0}
            onClick={() => scrollStrip(1)}
            className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/30 text-white/60 transition hover:border-[#8fb4ec] hover:bg-[#1d509e] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <svg viewBox="0 0 8 12" className="h-3 w-2" aria-hidden="true">
              <path d="M1.5 1 6 6l-4.5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {group.matches.length ? (
        <>
          <div className="relative mb-4 mt-3.5 h-[3px] rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#3f78d8]" style={{ width: `${progressPct}%` }} />
            <div
              aria-hidden="true"
              className="absolute top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-[#8fb4ec] shadow-[0_0_9px_rgb(143_180_236/0.8)]"
              style={{ left: `calc(${progressPct}% - 4.5px)` }}
            />
          </div>

          <div
            ref={stripRef}
            tabIndex={0}
            role="region"
            aria-label={`${group.title} calendar — press the arrow keys to scroll through matches`}
            onKeyDown={onStripKeyDown}
            className="ck-scroll flex snap-x snap-mandatory gap-2.5 overflow-x-auto rounded-lg pb-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f78d8]/60"
          >
            {group.matches.map((match, index) => {
              const live = match.status === "live";
              const done = match.status === "completed";
              const isNext = match.gid === next?.gid;
              const opponent = opponentTeam(match);
              const year = new Date(match.date).getUTCFullYear();
              const result = match.result?.trim();

              return (
                <article
                  key={match.gid}
                  data-next={isNext ? "" : undefined}
                  aria-current={isNext ? "true" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    match.status === "upcoming"
                      ? `View announced squad for ${match.title}, ${opponent.name} vs India`
                      : `Open ${match.title} in the match centre`
                  }
                  onClick={() => openCard(match)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openCard(match);
                    }
                  }}
                  title={`${match.title} · ${opponent.name} vs India · ${match.venue}`}
                  className={`relative w-[132px] shrink-0 cursor-pointer snap-start rounded-xl border p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-[#8fb4ec]/50 hover:shadow-[0_10px_28px_-16px_rgb(0_0_0/0.9)] focus-visible:border-[#8fb4ec]/60 ${
                    live
                      ? "border-[#8fb4ec]/70 bg-gradient-to-b from-[#3f78d8]/[0.24] to-black/55 shadow-[0_0_26px_rgb(63_120_216/0.3)]"
                      : isNext
                        ? "border-[#3f78d8]/65 bg-gradient-to-b from-[#3f78d8]/[0.16] to-black/55 shadow-[0_0_26px_rgb(63_120_216/0.2)]"
                        : done
                          ? "border-white/[0.07] bg-black/50"
                          : "border-white/[0.1] bg-black/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    {done ? (
                      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                        <circle cx="6" cy="6" r="5.6" fill="#3f78d8" />
                        <path d="M3.5 6.2 5.1 7.9 8.5 4.2" fill="none" stroke="#ffffff" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isNext
                            ? "bg-[#8fb4ec] shadow-[0_0_7px_rgb(143_180_236/0.9)]"
                            : live
                              ? "bg-[#3f78d8] shadow-[0_0_7px_rgb(63_120_216/0.9)]"
                              : "bg-white/20"
                        }`}
                      />
                    )}
                    {isNext ? (
                      <span className="rounded-sm bg-[#1d509e] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white">
                        {live ? "Live" : "Next"}
                      </span>
                    ) : done ? (
                      <span className="rounded-sm border border-[#3f78d8]/35 bg-[#3f78d8]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#b9d7ff]">
                        Done
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-semibold tabular-nums tracking-wider text-white/40">
                        {group.key === "t20i" ? "T20I" : match.format}
                      </span>
                    )}
                  </div>

                  <p className={`mt-2.5 truncate font-f1 text-[31px] font-black uppercase leading-[0.9] tracking-[0.01em] ${done ? "text-white/35" : "text-white"}`}>
                    {opponent.abbreviation}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <TeamFlag team={opponent} size="sm" />
                    <span className={`truncate text-[12px] font-normal ${done ? "text-white/45" : "text-white/85"}`}>
                      {opponent.shortName}
                    </span>
                  </div>
                  <p className={`truncate text-[11.5px] ${isNext ? "text-[#b9d7ff]" : done ? "text-white/30" : "text-white/45"}`}>
                    {match.title}
                  </p>
                  <p className={`mt-0.5 truncate text-[11px] ${done ? "text-white/25" : "text-white/40"}`}>
                    {match.city || match.venue}
                  </p>

                  <div className="mt-2 border-t border-white/[0.07] pt-1.5">
                    <time dateTime={match.date} className={`text-[11.5px] font-semibold uppercase tracking-[0.1em] ${isNext ? "text-[#b9d7ff]" : done ? "text-white/30" : "text-white/60"}`}>
                      {formatShortDate(match.date)} {year !== today ? year : ""}
                    </time>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[11.5px]">
                      {live ? (
                        <span className="flex items-center gap-1 font-bold text-[#b9d7ff]">
                          <span aria-hidden="true" className="h-1 w-1 animate-pulse rounded-full bg-[#8fb4ec]" />
                          Live
                        </span>
                      ) : done ? (
                        <span className="truncate text-white/30">{result || "Result"}</span>
                      ) : isNext ? (
                        <>
                          <span className="text-white/30">In</span>
                          <span className="font-bold text-[#8fb4ec]">
                            <MiniCountdown target={match.date} now={now} />
                          </span>
                        </>
                      ) : (
                        <span className="text-white/30">Upcoming</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            <div aria-hidden="true" className="w-px shrink-0" />
          </div>
        </>
      ) : (
        <div className="mt-4 grid min-h-[92px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 px-4 text-center text-[12px] leading-relaxed text-white/40">
          {group.empty}
        </div>
      )}

      <SquadModal
        match={squadMatch}
        gender={group.matches[0]?.gender ?? "men"}
        onClose={() => setSquadMatch(null)}
      />
    </article>
  );
}

export default function SeasonCalendar({
  matches,
  now,
  gender,
  onOpenMatch,
}: {
  matches: CricketMatch[];
  now: number;
  gender: Gender;
  onOpenMatch: (match: CricketMatch) => void;
}) {
  const sorted = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const worldCup = gender === "men" ? sorted.filter(isCwc2027) : [];
  const odi = sorted.filter((match) => match.format === "ODI" && !isWorldCupSeries(match));
  const t20 = sorted.filter((match) => match.format === "T20I");
  const test = sorted.filter((match) => match.format === "Test");

  const groups: CalendarGroup[] = [
    ...(gender === "men"
      ? [
          {
            key: "cwc",
            eyebrow: "ICC Men's Cricket World Cup 2027 · India fixtures",
            title: "CWC 2027",
            empty: "India's CWC 2027 fixtures are not in the BCCI feed yet.",
            matches: worldCup,
          },
        ]
      : []),
    { key: "odi", eyebrow: "One-day internationals", title: "ODI", empty: "No ODI fixtures in this season's feed.", matches: odi },
    { key: "t20i", eyebrow: "Twenty20 internationals", title: "T20I", empty: "No T20I fixtures in this season's feed.", matches: t20 },
    { key: "test", eyebrow: "Test matches", title: "Test", empty: "No Test fixtures in this season's feed.", matches: test },
  ];

  const total = sorted.length;
  const competitionLabel = `${groups.length} ${groups.length === 1 ? "competition" : "competitions"}`;
  const current = currentSeries(seriesGroups(sorted), now);
  const seriesGroup: CalendarGroup | null = current
    ? {
        key: "series",
        eyebrow: current.label,
        title: current.group.name,
        noun: "series",
        empty: "No fixtures in this series.",
        matches: current.group.matches,
      }
    : null;
  const calendars = seriesGroup ? [seriesGroup, ...groups] : groups;

  return (
    <section
      id="ck-calendar"
      aria-label={calendars.map((group) => `${group.title} ${group.noun ?? "calendar"}`).join(", ")}
      className="scroll-mt-28 space-y-3.5"
    >
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec] shadow-[0_0_6px_rgb(143_180_236/0.8)]" />
            {competitionLabel}
          </p>
          <h2 className="mt-1 font-display text-2xl font-black uppercase leading-none tracking-wide text-white sm:text-[27px]">
            Match <span className="italic text-[#8fb4ec]">calendars</span>
          </h2>
        </div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-white/30">
          {total} fixtures and results
        </p>
      </div>
      {calendars.map((group) => (
        <CalendarCard key={group.key} group={group} now={now} onOpenMatch={onOpenMatch} />
      ))}
    </section>
  );
}
