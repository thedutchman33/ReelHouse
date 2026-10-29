"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CricketMatch,
  MatchFormat,
  MatchSquadsData,
  ScorecardData,
  ScorecardInnings,
} from "@/lib/cricket/types";
import {
  bcciPlayerImageUrl,
  formatDate,
  formatTime,
  formatDecimal,
  teamJerseyColour,
} from "@/lib/cricket/shared";
import { BoardLogo } from "./BoardLogo";
import { MatchProgressChart, PartnershipChart, RunsChart } from "./MatchCharts";
import { TeamFlag } from "./TeamFlag";
import { EmptyState, PlayerAvatar, SectionHeading, Select } from "./ui";

type View = "scorecard" | "squads" | "charts";

const SQUAD_SOURCE_LABEL: Record<string, string> = {
  xi: "Playing XI",
  squad: "Announced squad",
  national: "National squad",
};

/** Both teams' lists: the XI after the toss, the announced squad before it. */
function SquadsPanel({ match }: { match: CricketMatch }) {
  const [data, setData] = useState<MatchSquadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const query = new URLSearchParams({
      gid: match.gid,
      gender: match.gender,
      home: match.teams[0]?.name ?? "",
      away: match.teams[1]?.name ?? "",
      date: match.date,
      format: match.format,
    });
    fetch(`/api/cricket/squad?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("squads unavailable");
        return (await response.json()) as MatchSquadsData;
      })
      .then((payload) => setData(payload))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [match.gid, match.gender, match.date, match.format, match.teams]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (failed || !data) {
    return <EmptyState title="Squads unavailable">BCCI has not published these squads yet.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {data.squads.map((squad) => {
          const team = match.teams.find(
            (entry) => entry.id === squad.teamId || entry.name === squad.teamName
          );
          return (
            <section
              key={squad.teamId}
              className="rounded-xl border border-white/[0.07] bg-black/20 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2">
                <p className="flex min-w-0 items-center gap-1.5 font-f1 text-[15px] font-bold uppercase tracking-wide text-white">
                  <TeamFlag
                    team={{ name: squad.teamName, abbreviation: squad.teamCode }}
                    size="sm"
                  />
                  <span className="truncate">{squad.teamName}</span>
                </p>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/35">
                  {SQUAD_SOURCE_LABEL[squad.source]}
                </span>
              </div>
              {squad.players.length ? (
                <ul className="space-y-0.5">
                  {squad.players.map((player, index) => (
                    <li
                      key={`${player.name}-${index}`}
                      className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                    >
                      <PlayerAvatar
                        player={{
                          name: player.name,
                          imageUrl: player.imageUrl ?? bcciPlayerImageUrl(player.playerId),
                        }}
                        fallbackImageUrl={player.fallbackImageUrl ?? null}
                        colour={team?.primary ?? null}
                        size={24}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">
                        {player.name}
                      </span>
                      {player.captain && (
                        <span className="rounded bg-[#d9af6b]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#d9af6b]">
                          C
                        </span>
                      )}
                      {player.viceCaptain && (
                        <span className="rounded bg-white/[0.07] px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">
                          VC
                        </span>
                      )}
                      {player.wicketkeeper && (
                        <span className="rounded bg-[#8fb4ec]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8fb4ec]">
                          WK
                        </span>
                      )}
                      {player.role && (
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-white/30">
                          {player.role}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 py-6 text-center text-[12.5px] text-white/35">
                  Not published yet. Named at the toss.
                </p>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed text-white/30">
        {data.awaitingToss
          ? "The playing XI is confirmed at the toss. Until then this is the announced squad for the series."
          : "Playing XIs as published by BCCI."}
      </p>
    </div>
  );
}

function TeamScore({ team, align = "left" }: { team: ScorecardData["match"]["teams"][number]; align?: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <BoardLogo
        team={{
          name: team.name,
          abbreviation: team.abbreviation,
          primary: team.primaryColor ? `#${team.primaryColor}` : "#30425f",
          secondary: team.secondaryColor ? `#${team.secondaryColor}` : "#30425f",
        }}
        size="md"
      />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-white/45">
          <TeamFlag team={{ name: team.name, abbreviation: team.abbreviation }} size="xs" />
          <span className="truncate">{team.shortName || team.name}</span>
        </p>
        <p className="truncate font-f1 text-[20px] font-bold leading-none tabular-nums text-white">{team.score ?? "—"}</p>
      </div>
    </div>
  );
}

function InningsTables({
  innings,
  colour,
}: {
  innings: ScorecardInnings;
  colour: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
          <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
            {innings.label} <span className="text-white/35">· batting</span>
          </p>
          <p className="text-[12.5px] tabular-nums text-white/50">
            {innings.score} ({innings.overs} ov)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
                <th scope="col" className="px-3 py-2 text-left">Batter</th>
                <th scope="col" className="px-2 py-2 text-left">Dismissal</th>
                <th scope="col" className="px-2 py-2 text-right">R</th>
                <th scope="col" className="px-2 py-2 text-right">B</th>
                <th scope="col" className="px-2 py-2 text-right">4s</th>
                <th scope="col" className="px-2 py-2 text-right">6s</th>
                <th scope="col" className="px-3 py-2 text-right">SR</th>
              </tr>
            </thead>
            <tbody>
              {innings.battingRows.map((row) => (
                <tr
                  key={row.playerName}
                  title={`${row.playerName} · ${row.runs} runs off ${row.balls} balls · ${row.dismissalString}`}
                  className="ck-score-row group border-t border-white/[0.05]"
                >
                  <td className="max-w-[220px] px-3 py-2 font-normal text-white">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="transition-transform duration-200 group-hover:scale-110">
                        <PlayerAvatar
                          player={{ name: row.playerName, imageUrl: row.imageUrl ?? bcciPlayerImageUrl(row.playerId) }}
                          colour={colour}
                          size={22}
                        />
                      </span>
                      <span className="ck-score-name truncate transition-colors duration-200 group-hover:text-white">
                        {row.playerName}
                        {row.dismissalString === "not out" && <span className="text-[#d9af6b]"> *</span>}
                      </span>
                    </span>
                  </td>
                  <td className="max-w-[210px] truncate px-2 py-2 text-white/40">{row.dismissalString}</td>
                  <td className="ck-score-runs px-2 py-2 text-right font-f1 font-bold tabular-nums text-white">{row.runs}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/55">{row.balls}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/55">{row.fours}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/55">{row.sixes}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white/65">{row.strikeRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>        <div className="border-t border-white/[0.06] px-3 py-2 text-[12.5px] text-white/40">
          Extras {innings.extras.total}
          <span className="text-white/15"> · </span>
          {innings.didNotBat.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
              <span>Did not bat:</span>
              {innings.didNotBat.map((row) => (
                <span key={row.playerId} className="inline-flex items-center gap-1">
                  <PlayerAvatar
                    player={{ name: row.playerName, imageUrl: row.imageUrl ?? bcciPlayerImageUrl(row.playerId) }}
                    colour={colour}
                    size={14}
                  />
                  {row.playerName}
                </span>
              ))}
            </span>
          ) : (
            "All out"
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
        <div className="border-b border-white/[0.07] px-3 py-2">
          <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">Bowling</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
                <th scope="col" className="px-3 py-2 text-left">Bowler</th>
                <th scope="col" className="px-2 py-2 text-right">O</th>
                <th scope="col" className="px-2 py-2 text-right">M</th>
                <th scope="col" className="px-2 py-2 text-right">R</th>
                <th scope="col" className="px-2 py-2 text-right">W</th>
                <th scope="col" className="px-3 py-2 text-right">Econ</th>
              </tr>
            </thead>
            <tbody>
              {innings.bowlingRows.map((row) => (
                <tr
                  key={row.playerName}
                  title={`${row.playerName} · ${row.wickets} wicket${row.wickets === 1 ? "" : "s"} for ${row.runsConceded} runs`}
                  className="ck-score-row group border-t border-white/[0.05]"
                >
                  <td className="px-3 py-2 font-normal text-white">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="transition-transform duration-200 group-hover:scale-110">
                        <PlayerAvatar
                          player={{ name: row.playerName, imageUrl: row.imageUrl ?? bcciPlayerImageUrl(row.playerId) }}
                          colour={colour}
                          size={22}
                        />
                      </span>
                      <span className="ck-score-name truncate transition-colors duration-200 group-hover:text-white">
                        {row.playerName}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/55">{row.overs}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/55">{row.maidens}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/55">{row.runsConceded}</td>
                  <td className="ck-score-wicket px-2 py-2 text-right font-f1 font-bold tabular-nums text-[#b9d7ff]">{row.wickets}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white/65">
                    {formatDecimal(Number(row.overs) > 0 ? row.runsConceded / Number(row.overs) : null, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function MatchCentre({
  matches,
  requested,
}: {
  matches: CricketMatch[];
  requested: { gid: string; nonce: number } | null;
}) {
  const [format, setFormat] = useState<"all" | MatchFormat>("all");
  const [gid, setGid] = useState<string>("");
  const [view, setView] = useState<View>("scorecard");
  const [inningsIndex, setInningsIndex] = useState(0);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const filtered = useMemo(
    () => matches.filter((match) => format === "all" || match.format === format),
    [matches, format]
  );

  useEffect(() => {
    setGid((current) =>
      filtered.some((match) => match.gid === current)
        ? current
        : (filtered.find((match) => match.status !== "upcoming") ?? filtered[0])?.gid ?? ""
    );
  }, [filtered]);

  useEffect(() => {
    if (!requested) return;
    const requestedMatch = matches.find((match) => match.gid === requested.gid);
    if (!requestedMatch) return;
    setFormat("all");
    setGid(requestedMatch.gid);
    setView("scorecard");
    setInningsIndex(0);
  }, [requested, matches]);

  const selected = matches.find((match) => match.gid === gid) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!gid) {
      setScorecard(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setScorecard(null);
    fetch(`/api/cricket/scorecard?gid=${encodeURIComponent(gid)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("scorecard unavailable");
        return (await response.json()) as ScorecardData;
      })
      .then((payload) => {
        setScorecard(payload);
        setInningsIndex(0);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [gid]);

  const innings = scorecard?.innings[inningsIndex] ?? scorecard?.innings[0] ?? null;
  const battingTeam =
    (scorecard?.match.teams ?? []).find((team) => team.id === innings?.teamId) ?? null;
  const battingColour = battingTeam?.primaryColor
    ? `#${battingTeam.primaryColor.replace(/^#/, "")}`
    : teamJerseyColour(battingTeam?.name);
  const match = scorecard?.match;
  const header = scorecard?.matchHeader;
  const displayTeams = match?.teams ?? [];
  const playerOfTheMatch = scorecard?.details.playerOfTheMatch ?? null;
  const pomRuns = Number(playerOfTheMatch?.runs?.score ?? "") || 0;
  const pomBalls = Number(playerOfTheMatch?.runs?.balls ?? "") || 0;
  const pomWickets = Number(playerOfTheMatch?.wickets?.wicketsDown ?? "") || 0;
  const pomConceded = Number(playerOfTheMatch?.wickets?.runsConceded ?? "") || 0;
  const pomStrikeRate = pomBalls > 0 ? (pomRuns / pomBalls) * 100 : null;

  return (
    <section id="ck-match-centre" aria-labelledby="ck-match-centre-title" className="scroll-mt-28">
      <SectionHeading
        id="ck-match-centre-title"
        eyebrow="Scorecards"
        title="Match"
        accent="centre"
        right={
          <div role="group" aria-label="Match centre views" className="inline-flex rounded-lg bg-black/30 p-0.5">
            {(["scorecard", "squads", "charts"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium uppercase tracking-[0.1em] transition ${
                  view === option ? "bg-[#1d509e] text-white" : "text-white/40 hover:text-white/80"
                }`}
              >
                {option === "scorecard" ? "Scorecard" : option === "squads" ? "Squads" : "Charts"}
              </button>
            ))}
          </div>
        }
      />

      <div className="f1-card rounded-2xl p-4 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row">
          <div className="w-full shrink-0 md:w-64">
            <div className="flex flex-col gap-2.5">
              <Select
                label="Format"
                value={format}
                onChange={(value) => setFormat(value as "all" | MatchFormat)}
                options={[
                  { value: "all", label: "All formats" },
                  { value: "Test", label: "Test" },
                  { value: "ODI", label: "ODI" },
                  { value: "T20I", label: "T20I" },
                ]}
              />
              <Select
                label="Match"
                value={gid}
                onChange={setGid}
                disabled={!filtered.length}
                placeholder="No matches"
                options={filtered.map((entry) => ({
                  value: entry.gid,
                  label: `${entry.matchNumber} · ${entry.series}`,
                  hint: `${formatDate(entry.date)} · ${entry.venue}`,
                  leading: (
                    <span className="flex items-center -space-x-1">
                      {entry.teams.slice(0, 2).map((team) => (
                        <TeamFlag key={team.id} team={team} size="xs" />
                      ))}
                    </span>
                  ),
                }))}
              />
              {selected && selected.status === "live" && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8fb4ec]">
                  <span aria-hidden="true" className="ck-live-dot" />
                  Live
                </span>
              )}
            </div>

            {selected && (
              <dl className="mt-4 space-y-2 border-t border-white/[0.07] pt-3 text-[12.5px]">
                {[
                  ["Date", formatDate(selected.date)],
                  ["Venue", selected.venue],
                  ["Format", selected.format],
                  ["Result", selected.result ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 uppercase tracking-[0.1em] text-white/30">{label}</dt>
                    <dd className="min-w-0 text-right text-white/65">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {scorecard && (
              <div className="mt-4 border-t border-white/[0.07] pt-3 text-[12.5px]">
                <p className="uppercase tracking-[0.1em] text-white/30">Toss</p>
                <p className="mt-0.5 text-white/65">{scorecard.details.tossLabel}</p>
              </div>
            )}

            {failed && (
              <div role="status" className="mt-4 text-[13px] text-[#ff9b94]">
                <p>Scorecard unavailable.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!gid) return;
                    setGid("");
                    window.setTimeout(() => setGid(gid), 30);
                  }}
                  className="mt-2 rounded-md border border-[#ff9b94]/40 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] transition hover:bg-[#ff9b94]/10"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-20 animate-pulse rounded-xl bg-white/[0.045]" />
                <div className="h-8 w-44 animate-pulse rounded bg-white/[0.045]" />
                <div className="h-[280px] animate-pulse rounded-xl bg-white/[0.045]" />
              </div>
            ) : failed ? (
              <EmptyState title="Scorecard unavailable" />
            ) : scorecard && (innings || view === "squads" || view === "charts") ? (
              <>
                {playerOfTheMatch && (
                  <div className="mb-3 overflow-hidden rounded-xl border border-[#d9af6b]/30 bg-[linear-gradient(110deg,rgba(217,175,107,0.16),rgba(29,80,158,0.14)_52%,rgba(0,0,0,0.25))] shadow-[0_10px_32px_-18px_rgb(217_175_107/0.55)]">
                    <div className="h-px bg-gradient-to-r from-transparent via-[#d9af6b]/70 to-transparent" />
                    <div className="flex flex-wrap items-center gap-3 px-3.5 py-3 sm:gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d9af6b]/40 bg-[#d9af6b]/10 text-[#d9af6b]">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
                          <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
                          <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 12v4M9 20h6M10 16h4l1 4H9l1-4Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <PlayerAvatar
                        player={{
                          name: `${playerOfTheMatch.firstName} ${playerOfTheMatch.lastName}`,
                          imageUrl:
                            playerOfTheMatch.imageUrl ??
                            bcciPlayerImageUrl(playerOfTheMatch.playerId),
                        }}
                        size={52}
                        className="rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-[#d9af6b]">
                          Player of the match
                        </p>
                        <p className="mt-0.5 truncate font-f1 text-[22px] font-bold uppercase leading-none tracking-wide text-white">
                          {playerOfTheMatch.firstName} {playerOfTheMatch.lastName}
                        </p>
                        <p className="mt-1 text-[13.5px] normal-case tracking-normal text-white/55">
                          {pomRuns > 0 && pomBalls > 0
                            ? `${pomRuns} runs from ${pomBalls} balls${pomStrikeRate ? ` at ${formatDecimal(pomStrikeRate, 1)} strike rate` : ""}.`
                            : null}
                          {pomRuns > 0 && pomWickets > 0 ? " " : ""}
                          {pomWickets > 0
                            ? `${pomWickets} ${pomWickets === 1 ? "wicket" : "wickets"} for ${pomConceded} runs.`
                            : null}
                          {pomRuns === 0 && pomWickets === 0 ? "Decisive contribution in the result." : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {pomRuns > 0 && (
                          <span className="rounded-lg border border-[#d9af6b]/30 bg-black/25 px-3 py-2 text-center">
                            <span className="block font-f1 text-[20px] font-bold leading-none tabular-nums text-white">
                              {pomRuns}
                            </span>
                            <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">
                              Runs {pomBalls > 0 ? `(${pomBalls}b)` : ""}
                            </span>
                          </span>
                        )}
                        {pomWickets > 0 && (
                          <span className="rounded-lg border border-[#d9af6b]/30 bg-black/25 px-3 py-2 text-center">
                            <span className="block font-f1 text-[20px] font-bold leading-none tabular-nums text-white">
                              {pomWickets}/{pomConceded}
                            </span>
                            <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">
                              Wickets
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-[linear-gradient(100deg,rgba(29,80,158,0.18),rgba(0,0,0,0.2))] px-3 py-3">
                  {displayTeams.map((team, index) => (
                    <div key={team.id} className={`flex flex-1 ${index === 1 ? "justify-end" : ""}`}>
                      <TeamScore team={team} align={index === 1 ? "right" : "left"} />
                    </div>
                  ))}
                  <p className="min-w-[150px] flex-1 text-center text-[13px] font-normal leading-snug text-[#b9d7ff] sm:text-left">
                    {header?.resultString || scorecard.match.resultString}
                  </p>
                </div>

                {scorecard.innings.length > 0 && (
                <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-0.5">
                  {scorecard.innings.map((entry, index) => {
                    const team = scorecard.match.teams.find((candidate) => candidate.id === entry.teamId);
                    return (
                      <button
                        key={`${entry.teamId}-${entry.inningsNumber}`}
                        type="button"
                        aria-pressed={index === inningsIndex}
                        onClick={() => setInningsIndex(index)}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                          index === inningsIndex
                            ? "bg-[#1d509e] text-white"
                            : "text-white/40 hover:bg-white/[0.05] hover:text-white/80"
                        }`}
                      >
                        <TeamFlag
                          team={{
                            name: team?.name ?? entry.label,
                            abbreviation: team?.abbreviation ?? "",
                          }}
                          size="xs"
                        />
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
                )}

                {view === "scorecard" ? (
                  <div className="mt-3">
                    {innings ? (
                      <InningsTables innings={innings} colour={battingColour} />
                    ) : (
                      <EmptyState title="Scorecard not published yet">
                        BCCI publishes the card once play starts.
                      </EmptyState>
                    )}
                  </div>
                ) : view === "squads" ? (
                  <div className="mt-3">
                    {selected ? (
                      <SquadsPanel match={selected} />
                    ) : (
                      <EmptyState title="No match selected" />
                    )}
                  </div>
                ) : !innings ? (
                  <div className="mt-3">
                    <EmptyState title="Charts available after play starts" />
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                        <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                          Runs <span className="text-white/35">by batter</span>
                        </p>
                        <RunsChart rows={innings.battingRows} colour={battingColour} />
                      </div>
                      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                        <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                          Partnerships
                        </p>
                        <PartnershipChart innings={innings} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                      <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                        Match progress <span className="text-white/35">· both teams</span>
                      </p>
                      <MatchProgressChart innings={scorecard.innings} teams={displayTeams} />
                    </div>
                  </div>
                )}

                <p className="mt-3 text-right text-[11.5px] tabular-nums text-white/30">
                  {header?.venueName} · {formatTime(header?.startDateTimeUtc)}
                </p>
              </>
            ) : (
              <EmptyState title="No match selected" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
