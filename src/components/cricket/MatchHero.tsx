"use client";

import type { CricketMatch } from "@/lib/cricket/types";
import {
  formatDateRange,
  formatTime,
  indiaTeam,
  opponentTeam,
} from "@/lib/cricket/shared";
import { venueDimensions } from "@/lib/cricket/venue-boundaries";
import WatchLiveButton from "@/components/f1/WatchLiveButton";
import { CountdownCells } from "./Countdown";
import StadiumPlot from "./StadiumPlot";
import { TeamFlag } from "./TeamFlag";
import { TeamBadge } from "./ui";

function ScoreStrip({ match }: { match: CricketMatch }) {
  const india = indiaTeam(match);
  const opponent = opponentTeam(match);
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {[opponent, india].map((team) => (
        <div
          key={team.id}
          className="flex min-w-[156px] flex-1 items-center gap-2.5 rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5 sm:max-w-[236px]"
        >
          <TeamBadge team={team} size="md" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-white/45">
              <TeamFlag team={team} size="xs" />
              <span className="truncate">{team.shortName}</span>
            </p>
            <p className="truncate font-f1 text-[20px] font-bold leading-none tabular-nums text-white">
              {team.score ?? "—"}
            </p>
          </div>
        </div>
      ))}
      {match.result && (
        <p className="flex min-w-[170px] flex-1 items-center px-1 text-[14px] font-normal leading-snug text-[#b9d7ff]">
          {match.result}
        </p>
      )}
    </div>
  );
}

/**
 * The cricket hero mirrors the Formula 1 hero's exact geometry: the same
 * f1-card shell, two-line 4xl/6xl title, right-hand venue plate, and the same
 * WatchLiveButton in the title's action slot. The button opens the cricket
 * watch page instead of the F1 one; its live-window gating is unchanged.
 */
export default function MatchHero({
  match,
  now,
  onOpen,
  watchEndISO = null,
}: {
  match: CricketMatch;
  now: number;
  onOpen: () => void;
  /** End of the 30-minute post-match watch window, when applicable. */
  watchEndISO?: string | null;
}) {
  const india = indiaTeam(match);
  const opponent = opponentTeam(match);
  const live = match.status === "live";
  const completed = match.status === "completed";
  const hasScore = Boolean(india.score || opponent.score);
  const showCity = Boolean(match.city) && !match.venue.toLowerCase().includes(match.city!.toLowerCase());
  const dimensions = venueDimensions(match.venue, match.city);

  return (
    <section id="ck-hero" className="f1-card relative overflow-hidden rounded-2xl p-5 md:p-8">
      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-full px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.18em] ${
                live ? "bg-[#1d509e]/20 text-[#b9d7ff]" : "bg-[#1d509e]/15 text-[#8fb4ec]"
              }`}
            >
              {live ? <span aria-hidden="true">◆ </span> : null}
              {live ? "Live" : completed ? "Result" : "Next match"}
            </span>
            <TeamFlag team={opponent} size="md" />
            <span className="text-[13px] font-medium uppercase tracking-[0.18em] text-white/60">
              {opponent.shortName}
            </span>
            <span aria-hidden="true" className="hidden text-white/20 sm:inline">
              ·
            </span>
            <span className="text-[13px] font-medium uppercase tracking-[0.18em] text-white/45">
              {match.format}
            </span>
            <button
              type="button"
              onClick={onOpen}
              className="hidden max-w-full truncate text-left text-[13px] font-normal uppercase tracking-[0.16em] text-white/40 transition hover:text-white/70 sm:block"
            >
              {match.series}
            </button>
          </div>

          {/* Same two-line title lockup as the F1 hero: country/venue name in
              white, the defining line in the page accent. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <h2 className="min-w-0 flex-1 font-f1 text-4xl font-bold uppercase leading-[0.95] tracking-tight text-white sm:text-6xl">
              <span className="block truncate">{opponent.shortName}</span>
              <span className="block text-[#8fb4ec]">vs {india.shortName}</span>
            </h2>
            <div className="ml-auto w-full shrink-0 sm:w-auto">
              <WatchLiveButton
                now={now}
                targetISO={match.date}
                endISO={watchEndISO}
                sessionName={match.title}
                isLive={match.status === "live"}
                watchHref="/watch/cricket"
              />
            </div>
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/50">
            <span>{match.venue}</span>
            {showCity && (
              <>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span>{match.city}</span>
              </>
            )}
            <span aria-hidden="true" className="text-white/20">·</span>
            <time dateTime={match.date}>{formatDateRange(match.date, match.endDate)}</time>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span>{formatTime(match.date)}</span>
          </p>

          <div className="mt-6 min-h-[112px] w-full max-w-md">
            {hasScore ? (
              <>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em] text-white/50">
                  {live ? "Live score" : "Final score"}
                </p>
                <ScoreStrip match={match} />
              </>
            ) : (
              <>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em] text-white/50">
                  {match.title} in
                </p>
                <CountdownCells target={match.date} now={now} />
              </>
            )}
          </div>
        </div>

        <div className="flex w-[230px] shrink-0 flex-col items-center sm:w-[280px] lg:w-[330px] xl:w-[380px]">
          <StadiumPlot
            venueName={match.venue}
            city={match.city}
            dimensions={dimensions}
            className="ck-stadium-hero"
          />
          <p className="mt-1 text-center">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.2em] text-white/40">Venue</span>
            <span className="mt-0.5 block max-w-[320px] truncate font-display text-lg uppercase tracking-wide text-white">
              {match.venue}
            </span>
          </p>
          {dimensions && (
            <p className="mt-1 text-center text-[10.5px] uppercase tracking-[0.12em] text-white/25">
              Boundary distances on the field · {dimensions.source}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
