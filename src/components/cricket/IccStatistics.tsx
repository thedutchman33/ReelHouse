"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlayerCompare from "./PlayerCompare";
import type {
  CricketPlayer,
  Gender,
  MatchFormat,
  PlayerRankingRow,
  RankingSet,
  TeamRankingRow,
} from "@/lib/cricket/types";
import { formatNumber, playerNameKey } from "@/lib/cricket/shared";
import { DriverDisc } from "@/components/f1/chart-interaction";
import { ChartTooltip, useChartDismiss } from "@/components/f1/standings/charts";
import { BoardLogo } from "./BoardLogo";
import { EmptyState, Select } from "./ui";

type Discipline = "batting" | "bowling" | "allrounder";

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: "batting", label: "Batting" },
  { key: "bowling", label: "Bowling" },
  { key: "allrounder", label: "All-rounders" },
];

const AXIS = "#94a3b8";
const GRID = "#334155";
const BLUE = "#8fb4ec";
const GOLD = "#d9af6b";

function rowsFor(set: RankingSet | null | undefined, discipline: Discipline): PlayerRankingRow[] {
  if (!set) return [];
  return discipline === "batting" ? set.batting : discipline === "bowling" ? set.bowling : set.allRounder;
}

function photoFor(row: PlayerRankingRow, photos: Map<string, CricketPlayer>): string | null {
  return photos.get(playerNameKey(row.name))?.imageUrl ?? row.imageUrl;
}

function movementText(change: number | null): string {
  if (change == null) return "No change";
  if (change === 0) return "Held";
  return `${Math.abs(change)} ${change > 0 ? "place gain" : "place drop"}`;
}

function Movement({ value }: { value: number | null }) {
  if (value == null || value === 0) {
    return <span className="text-white/30">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums ${
        value > 0 ? "text-[#34d399]" : "text-[#f87171]"
      }`}
    >
      <span aria-hidden="true">{value > 0 ? "▲" : "▼"}</span>
      {Math.abs(value)}
    </span>
  );
}

// ------------------------------ player ratings ------------------------------

export function PlayerStats({
  rankings,
  format,
  gender,
  players,
}: {
  rankings: RankingSet[];
  format: MatchFormat;
  gender: Gender;
  players: CricketPlayer[];
}) {
  const [discipline, setDiscipline] = useState<Discipline>("batting");
  const [tip, setTip] = useState<{
    row: PlayerRankingRow;
    left: number;
    top: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => setTip(null));

  const photos = useMemo(() => {
    const map = new Map<string, CricketPlayer>();
    for (const player of players) map.set(playerNameKey(player.name), player);
    return map;
  }, [players]);
  const set = rankings.find((entry) => entry.format === format) ?? null;
  const rows = rowsFor(set, discipline).slice(0, 10);
  const max = Math.max(1, ...rows.map((row) => row.rating));

  const width = 640;
  const rowH = 33;
  const top = 8;
  const left = 26;
  const barX = 264;
  const barMax = width - barX - 62;
  const height = top + rows.length * rowH + 12;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#8fb4ec]">
            ICC {format} player ratings
          </p>
          <p className="mt-1 text-[13.5px] text-white/40">
            The official rating points for the top ten in each discipline. Hover or tap a row for the full card.
          </p>
        </div>
        <div
          role="group"
          aria-label="Player rating discipline"
          className="inline-flex rounded-lg bg-black/30 p-0.5"
        >
          {DISCIPLINES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={discipline === entry.key}
              onClick={() => setDiscipline(entry.key)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                discipline === entry.key
                  ? "bg-gradient-to-r from-[#1d509e] to-[#3f78d8] text-white"
                  : "text-white/45 hover:text-white/80"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title={`${format} ${DISCIPLINES.find((entry) => entry.key === discipline)?.label} ratings unavailable`} />
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            role="img"
            aria-label={`Top ten ICC ${format} ${discipline} ratings`}
            className="h-auto w-full select-none"
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              setTip(null);
            }}
          >
            {[0.25, 0.5, 0.75, 1].map((fraction) => (
              <line
                key={fraction}
                x1={barX + barMax * fraction}
                x2={barX + barMax * fraction}
                y1={top}
                y2={height - 12}
                stroke={GRID}
                strokeOpacity={0.24}
              />
            ))}

            {rows.map((row, index) => {
              const y = top + index * rowH;
              const centre = y + rowH / 2;
              const active = tip?.row.name === row.name && tip.row.team === row.team;
              const dim = tip != null && !active;
              const barWidth = Math.max(2, (row.rating / max) * barMax);
              return (
                <g
                  key={`${row.name}-${row.team}-${index}`}
                  className="cursor-pointer"
                  onPointerEnter={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    setTip({ row, left: box.left + box.width * 0.45, top: box.top });
                  }}
                  onPointerDown={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    setTip({ row, left: box.left + box.width * 0.45, top: box.top });
                  }}
                  opacity={dim ? 0.45 : 1}
                >
                  <rect
                    x={0}
                    y={y}
                    width={width}
                    height={rowH - 1}
                    fill={active ? "rgba(255,255,255,0.045)" : "transparent"}
                    className="transition-[fill] duration-150"
                  />
                  <DriverDisc
                    x={left + 9}
                    y={centre}
                    r={10.5}
                    colour={index < 3 ? GOLD : BLUE}
                    href={photoFor(row, photos)}
                    label={row.teamCode}
                  />
                  <text x={left + 27} y={centre + 3.5} fontSize="11.5" fontWeight="500" fill="#eef4ff">
                    {row.name.length > 20 ? `${row.name.slice(0, 19)}…` : row.name}
                  </text>
                  <text x={barX - 14} y={centre + 3} textAnchor="end" fontSize="9" fontWeight="700" fill={row.teamCode ? "rgba(238,244,255,0.42)" : AXIS}>
                    {row.teamCode}
                  </text>
                  <rect
                    x={barX}
                    y={centre - 5}
                    width={barMax}
                    height={10}
                    rx={5}
                    fill="rgba(255,255,255,0.045)"
                  />
                  <rect
                    x={barX}
                    y={centre - 5}
                    width={barWidth}
                    height={10}
                    rx={5}
                    fill={index < 3 ? `url(#ck-rating-gold)` : `url(#ck-rating-blue)`}
                    stroke={active ? "#ffffff" : "none"}
                    strokeWidth={0.7}
                    className="f1-grow-x"
                    style={{ animationDelay: `${Math.min(500, index * 45)}ms` }}
                  />
                  <text x={barX + barWidth + 8} y={centre + 4} fontSize="10" fontWeight="800" fill={index < 3 ? GOLD : "#dbeafe"}>
                    {formatNumber(row.rating)}
                  </text>
                  <text x={width - 4} y={centre + 3} textAnchor="end" fontSize="9" fontWeight="700" fill="rgba(238,244,255,0.36)">
                    P{row.position}
                  </text>
                </g>
              );
            })}

            <defs>
              <linearGradient id="ck-rating-gold" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8a5e20" />
                <stop offset="100%" stopColor="#d9af6b" />
              </linearGradient>
              <linearGradient id="ck-rating-blue" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1d509e" />
                <stop offset="100%" stopColor="#8fb4ec" />
              </linearGradient>
            </defs>
          </svg>

          {tip && (
            <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={236}>
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec]" />
                <span className="truncate text-[14px] font-bold text-white">{tip.row.name}</span>
                <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                  P{tip.row.position}
                </span>
              </div>
              <div className="space-y-1 px-3 py-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-white/40">Team</span>
                  <span className="ml-auto text-white/80">{tip.row.team || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/40">Rating</span>
                  <span className="ml-auto font-f1 text-[14px] font-bold tabular-nums text-white">
                    {formatNumber(tip.row.rating)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/40">Movement</span>
                  <span className="ml-auto text-white/80">{movementText(tip.row.change)}</span>
                </div>
                <div className="flex items-center gap-2 border-t border-white/[0.08] pt-1.5 text-white/35">
                  <span>{format} · {gender === "men" ? "Men" : "Women"}</span>
                  <span className="ml-auto">{DISCIPLINES.find((entry) => entry.key === discipline)?.label}</span>
                </div>
              </div>
            </ChartTooltip>
          )}
        </div>
      )}

      <FormatLeaders rankings={rankings} discipline={discipline} format={format} />
    </div>
  );
}

function FormatLeaders({
  rankings,
  discipline,
  format,
}: {
  rankings: RankingSet[];
  discipline: Discipline;
  format: MatchFormat;
}) {
  const leaders = rankings
    .map((set) => ({ set, row: rowsFor(set, discipline)[0] ?? null }))
    .filter((entry): entry is { set: RankingSet; row: PlayerRankingRow } => entry.row != null);
  const [tip, setTip] = useState<{
    row: PlayerRankingRow;
    set: RankingSet;
    left: number;
    top: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => setTip(null));

  if (!leaders.length) return null;

  const width = 640;
  const height = 190;
  const left = 26;
  const bottom = 34;
  const top = 24;
  const plotW = width - left - 18;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...leaders.map((entry) => entry.row.rating));
  const step = plotW / leaders.length;
  const barW = Math.min(64, step * 0.48);
  const y = (value: number) => height - bottom - (value / max) * plotH;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
          Format leaders <span className="text-white/35">· {DISCIPLINES.find((entry) => entry.key === discipline)?.label}</span>
        </p>
        <span className="text-[11.5px] uppercase tracking-[0.12em] text-white/30">Top rating in each format</span>
      </div>
      <p className="mb-2 text-[12.5px] text-white/40">
        The same discipline across every ICC table the feed publishes. Hover a bar for the player card.
      </p>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`ICC ${discipline} leaders in each format`}
          className="h-auto w-full select-none"
          onPointerLeave={(event) => {
            if (event.pointerType === "touch") return;
            setTip(null);
          }}
        >
          {[0, 0.5, 1].map((fraction) => {
            const value = Math.round(max * fraction);
            return (
              <g key={fraction}>
                <line
                  x1={left}
                  x2={width - 18}
                  y1={y(value)}
                  y2={y(value)}
                  stroke={GRID}
                  strokeOpacity={fraction === 0 ? 0.6 : 0.28}
                  strokeDasharray={fraction === 0 ? undefined : "3 5"}
                />
                <text x={left - 7} y={y(value) + 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill={AXIS}>
                  {value}
                </text>
              </g>
            );
          })}

          {leaders.map((entry, index) => {
            const x = left + step * index + step / 2;
            const active = tip?.row.name === entry.row.name && tip.set.format === entry.set.format;
            const dim = tip != null && !active;
            return (
              <g
                key={entry.set.format}
                className="cursor-pointer"
                opacity={dim ? 0.45 : 1}
                onPointerEnter={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setTip({ ...entry, left: box.left + box.width / 2, top: box.top });
                }}
                onPointerDown={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setTip({ ...entry, left: box.left + box.width / 2, top: box.top });
                }}
              >
                <rect
                  x={x - barW / 2}
                  y={y(entry.row.rating)}
                  width={barW}
                  height={Math.max(2, height - bottom - y(entry.row.rating))}
                  rx={3}
                  fill={index === leaders.findIndex((item) => item.set.format === format) ? GOLD : BLUE}
                  opacity={active ? 1 : 0.82}
                  stroke={active ? "#ffffff" : "none"}
                  strokeWidth={0.8}
                  className="f1-grow"
                  style={{ animationDelay: `${index * 70}ms` }}
                />
                <text x={x} y={y(entry.row.rating) - 7} textAnchor="middle" fontSize="10" fontWeight="800" fill="#eef4ff">
                  {formatNumber(entry.row.rating)}
                </text>
                <text x={x} y={height - 18} textAnchor="middle" fontSize="10" fontWeight="700" fill={entry.set.format === format ? GOLD : AXIS}>
                  {entry.set.format}
                </text>
                <text x={x} y={height - 6} textAnchor="middle" fontSize="7.5" fill="rgba(238,244,255,0.38)">
                  {entry.row.name.length > 15 ? `${entry.row.name.slice(0, 14)}…` : entry.row.name}
                </text>
              </g>
            );
          })}
        </svg>

        {tip && (
          <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={236}>
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#d9af6b]" />
              <span className="truncate text-[14px] font-bold text-white">{tip.row.name}</span>
              <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                {tip.set.format} · P{tip.row.position}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[12px]">
              <span className="text-white/40">Team</span>
              <span className="text-right text-white/80">{tip.row.team || "—"}</span>
              <span className="text-white/40">Rating</span>
              <span className="text-right font-f1 text-[13px] font-bold tabular-nums text-white">
                {formatNumber(tip.row.rating)}
              </span>
              <span className="text-white/40">Movement</span>
              <span className="text-right text-white/80">{movementText(tip.row.change)}</span>
            </div>
          </ChartTooltip>
        )}
      </div>
    </div>
  );
}

// -------------------------------- head to head -------------------------------

type TeamOption = { name: string; code: string };

function allTeams(rankings: RankingSet[]): TeamOption[] {
  const map = new Map<string, TeamOption>();
  for (const set of rankings) {
    for (const row of set.team) {
      if (!map.has(row.name)) map.set(row.name, { name: row.name, code: row.code });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function teamRow(set: RankingSet | undefined, name: string): TeamRankingRow | null {
  return set?.team.find((row) => row.name === name) ?? null;
}

function SplitBar({
  a,
  b,
  aLabel,
  bLabel,
  low = false,
}: {
  a: number | null;
  b: number | null;
  aLabel: string;
  bLabel: string;
  low?: boolean;
}) {
  const av = a ?? 0;
  const bv = b ?? 0;
  const total = av + bv;
  const aPct = total > 0 ? (av / total) * 100 : 50;
  return (
    <div>
      <div className="grid grid-cols-[60px_minmax(0,1fr)_60px] items-center gap-2">
        <span className={`text-left font-f1 text-[13px] font-bold tabular-nums ${low && av > bv ? "text-white/55" : "text-white/85"}`}>
          {a == null ? "—" : formatNumber(a)}
        </span>
        <span className="truncate text-center text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">
          {aLabel}
        </span>
        <span className={`text-right font-f1 text-[13px] font-bold tabular-nums ${low && bv > av ? "text-white/55" : "text-white/85"}`}>
          {b == null ? "—" : formatNumber(b)}
        </span>
      </div>
      <div className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <span style={{ width: `${Math.max(0, Math.min(100, aPct))}%`, backgroundColor: BLUE }} />
        <span style={{ width: `${Math.max(0, 100 - aPct)}%`, backgroundColor: GOLD, opacity: 0.9 }} />
      </div>
    </div>
  );
}

function TeamHeadToHead({
  rankings,
  gender,
}: {
  rankings: RankingSet[];
  gender: Gender;
}) {
  const teams = useMemo(() => allTeams(rankings), [rankings]);
  const indiaName = gender === "women" ? "India Women" : "India";
  const india = teams.find((team) => team.name === indiaName) ?? teams[0] ?? null;
  const preferredNames =
    gender === "women"
      ? ["Australia Women", "England Women", "New Zealand Women", "South Africa Women"]
      : ["Australia", "England", "New Zealand", "Pakistan", "South Africa"];
  const preferredOpponent =
    teams.find((team) => team.name !== india?.name && preferredNames.includes(team.name)) ??
    teams.find((team) => team.name !== india?.name) ??
    null;
  const [teamA, setTeamA] = useState(india?.name ?? "");
  const [teamB, setTeamB] = useState(preferredOpponent?.name ?? "");
  const [tip, setTip] = useState<{
    format: MatchFormat;
    left: number;
    top: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => setTip(null));

  useEffect(() => {
    if (!teams.length) return;
    setTeamA((current) => (teams.some((team) => team.name === current) ? current : indiaName));
    setTeamB((current) =>
      teams.some((team) => team.name === current)
        ? current
        : teams.find((team) => team.name === preferredOpponent?.name)?.name ??
          teams.find((team) => team.name !== indiaName)?.name ??
          teams[0].name
    );
  }, [indiaName, preferredOpponent?.name, teams]);

  if (teams.length < 2) {
    return <EmptyState title="Two ranked teams are needed for a head-to-head" />;
  }

  const defaultA = india ?? teams[0];
  const defaultB =
    (preferredOpponent && preferredOpponent.name !== defaultA.name ? preferredOpponent : null) ??
    teams.find((team) => team.name !== defaultA.name) ??
    teams[1] ??
    teams[0];
  const a = teams.find((team) => team.name === teamA) ?? defaultA;
  const b = teams.find((team) => team.name === teamB && team.name !== a.name) ?? defaultB;
  const formats = rankings
    .filter((set) => set.team.length > 0)
    .map((set) => set.format)
    .filter((format, index, array) => array.indexOf(format) === index);
  const pairs = formats.map((format) => {
    const set = rankings.find((entry) => entry.format === format);
    return { format, set, a: teamRow(set, a.name), b: teamRow(set, b.name) };
  });
  const width = 640;
  const height = 300;
  const left = 40;
  const right = 18;
  const top = 20;
  const bottom = 46;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = Math.max(
    1,
    ...pairs.flatMap((pair) => [pair.a?.rating ?? 0, pair.b?.rating ?? 0])
  );
  const topRating = Math.ceil((max * 1.1) / 25) * 25;
  const y = (value: number) => height - bottom - (value / topRating) * plotH;
  const slot = plotW / Math.max(1, pairs.length);
  const barW = Math.min(46, slot * 0.24);

  const setA = (name: string) => {
    setTeamA(name);
    if (name === teamB) {
      const other = teams.find((team) => team.name !== name);
      if (other) setTeamB(other.name);
    }
  };
  const setB = (name: string) => {
    setTeamB(name);
    if (name === teamA) {
      const other = teams.find((team) => team.name !== name);
      if (other) setTeamA(other.name);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
        <div className="grid grid-cols-2 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="order-1 flex min-w-0 items-center gap-2.5">
            <BoardLogo team={{ name: a.name, abbreviation: a.code }} size="md" />
            <div className="min-w-0">
              <p className="truncate font-f1 text-[16px] font-bold uppercase tracking-wide text-white">{a.name}</p>
              <p className="text-[11.5px] uppercase tracking-[0.12em] text-white/35">{a.code} · ICC ranking</p>
            </div>
          </div>
          <div className="order-3 col-span-2 flex items-center justify-center gap-2 md:order-2 md:col-span-1">
            <Select
              label="Team 1"
              compact
              value={a.name}
              onChange={setA}
              options={teams.map((team) => ({
                value: team.name,
                label: team.name,
                hint: team.code,
                leading: <BoardLogo team={{ name: team.name, abbreviation: team.code }} size="sm" />,
              }))}
            />
            <span className="rounded bg-[#d9af6b] px-1.5 py-0.5 font-f1 text-[9px] font-bold text-[#171108]">VS</span>
            <Select
              label="Team 2"
              compact
              align="right"
              value={b.name}
              onChange={setB}
              options={teams.map((team) => ({
                value: team.name,
                label: team.name,
                hint: team.code,
                leading: <BoardLogo team={{ name: team.name, abbreviation: team.code }} size="sm" />,
              }))}
            />
          </div>
          <div className="order-2 flex min-w-0 items-center justify-end gap-2.5 text-right">
            <div className="min-w-0">
              <p className="truncate font-f1 text-[16px] font-bold uppercase tracking-wide text-white">{b.name}</p>
              <p className="text-[11.5px] uppercase tracking-[0.12em] text-white/35">{b.code} · ICC ranking</p>
            </div>
            <BoardLogo team={{ name: b.name, abbreviation: b.code }} size="md" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
          <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
            Rating head-to-head <span className="text-white/35">· by format</span>
          </p>
          <p className="mb-2 mt-1 text-[12.5px] text-white/40">
            ICC team ratings. Hover or tap a format pair for the points and ranking positions behind the bars.
          </p>
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              width="100%"
              role="img"
              aria-label={`ICC team rating comparison between ${a.name} and ${b.name}`}
              className="h-auto w-full select-none"
              onPointerLeave={(event) => {
                if (event.pointerType === "touch") return;
                setTip(null);
              }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const value = Math.round(topRating * fraction);
                return (
                  <g key={fraction}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={y(value)}
                      y2={y(value)}
                      stroke={GRID}
                      strokeOpacity={fraction === 0 ? 0.65 : 0.28}
                      strokeDasharray={fraction === 0 ? undefined : "3 5"}
                    />
                    <text x={left - 7} y={y(value) + 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill={AXIS}>
                      {value}
                    </text>
                  </g>
                );
              })}

              {pairs.map((pair, index) => {
                const cx = left + slot * index + slot / 2;
                const active = tip?.format === pair.format;
                const dim = tip != null && !active;
                return (
                  <g
                    key={pair.format}
                    className="cursor-pointer"
                    opacity={dim ? 0.45 : 1}
                    onPointerEnter={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      setTip({ format: pair.format, left: box.left + box.width / 2, top: box.top });
                    }}
                    onPointerDown={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      setTip({ format: pair.format, left: box.left + box.width / 2, top: box.top });
                    }}
                  >
                    <rect
                      x={cx - barW - 1}
                      y={y(pair.a?.rating ?? 0)}
                      width={barW}
                      height={Math.max(1, height - bottom - y(pair.a?.rating ?? 0))}
                      rx={3}
                      fill={BLUE}
                      opacity={active ? 1 : 0.85}
                      stroke={active ? "#ffffff" : "none"}
                      strokeWidth={0.8}
                      className="f1-grow"
                      style={{ animationDelay: `${index * 65}ms` }}
                    />
                    <rect
                      x={cx + 1}
                      y={y(pair.b?.rating ?? 0)}
                      width={barW}
                      height={Math.max(1, height - bottom - y(pair.b?.rating ?? 0))}
                      rx={3}
                      fill={GOLD}
                      opacity={active ? 1 : 0.85}
                      stroke={active ? "#ffffff" : "none"}
                      strokeWidth={0.8}
                      className="f1-grow"
                      style={{ animationDelay: `${index * 65 + 70}ms` }}
                    />
                    <text x={cx} y={height - 22} textAnchor="middle" fontSize="10" fontWeight="700" fill={AXIS}>
                      {pair.format}
                    </text>
                    <text x={cx} y={height - 8} textAnchor="middle" fontSize="7.5" fill="rgba(238,244,255,0.38)">
                      {pair.a ? `P${pair.a.position}` : "NR"} · {pair.b ? `P${pair.b.position}` : "NR"}
                    </text>
                  </g>
                );
              })}
            </svg>

            {tip && (
              <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={248}>
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#d9af6b]" />
                  <span className="text-[14px] font-bold text-white">{tip.format} head-to-head</span>
                </div>
                <div className="space-y-2 px-3 py-2">
                  {pairs
                    .filter((pair) => pair.format === tip.format)
                    .map((pair) => (
                      <div key={pair.format} className="space-y-1 text-[12px]">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BLUE }} />
                          <span className="min-w-0 flex-1 truncate text-white/70">{a.name}</span>
                          <span className="font-f1 text-[13px] font-bold tabular-nums text-white">
                            {pair.a ? formatNumber(pair.a.rating) : "NR"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} />
                          <span className="min-w-0 flex-1 truncate text-white/70">{b.name}</span>
                          <span className="font-f1 text-[13px] font-bold tabular-nums text-white">
                            {pair.b ? formatNumber(pair.b.rating) : "NR"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 border-t border-white/[0.08] pt-1 text-[11px] text-white/35">
                          <span>{pair.a ? `${formatNumber(pair.a.points)} pts · P${pair.a.position}` : "Not ranked"}</span>
                          <span className="ml-auto">{pair.b ? `${formatNumber(pair.b.points)} pts · P${pair.b.position}` : "Not ranked"}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </ChartTooltip>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
          <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
            {a.code} <span className="text-white/30">vs</span> {b.code}
          </p>
          <p className="mb-3 mt-1 text-[12.5px] text-white/40">
            Position, rating and points in every published ICC table. Lower is better for positions.
          </p>
          <div className="space-y-3">
            {pairs.map((pair) => (
              <div key={pair.format}>
                <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8fb4ec]">
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#8fb4ec]" />
                  {pair.format}
                </p>
                <div className="space-y-1.5">
                  <SplitBar a={pair.a?.position ?? null} b={pair.b?.position ?? null} aLabel="Position" bLabel={pair.format} low />
                  <SplitBar a={pair.a?.rating ?? null} b={pair.b?.rating ?? null} aLabel="Rating" bLabel={pair.format} />
                  <SplitBar a={pair.a?.points ?? null} b={pair.b?.points ?? null} aLabel="Points" bLabel={pair.format} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-white/[0.08] pt-2 text-[11px] text-white/35">
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full" style={{ backgroundColor: BLUE }} />
              {a.code}
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} />
              {b.code}
            </span>
            <span className="ml-auto">ICC official tables</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeadToHead({
  rankings,
  gender,
  players,
}: {
  rankings: RankingSet[];
  gender: Gender;
  players: CricketPlayer[];
}) {
  const [mode, setMode] = useState<"team" | "player">("team");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1">
        {([
          { key: "team", label: "Team head to head", sub: "ICC rankings" },
          { key: "player", label: "Player head to head", sub: "Batter vs bowler" },
        ] as const).map((entry) => {
          const active = mode === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(entry.key)}
              className={`flex flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-md px-3 py-2 text-[12.5px] font-semibold transition ${
                active
                  ? "bg-[#1d509e] text-white shadow-[0_2px_12px_rgb(29_80_158/0.4)]"
                  : "text-white/40 hover:bg-white/[0.04] hover:text-white/75"
              }`}
            >
              {entry.label}
              <span className={`text-[10px] font-normal uppercase tracking-[0.12em] ${active ? "text-white/60" : "text-white/25"}`}>
                {entry.sub}
              </span>
            </button>
          );
        })}
      </div>
      {mode === "team" ? (
        <TeamHeadToHead rankings={rankings} gender={gender} />
      ) : (
        <PlayerCompare players={players} gender={gender} mode="h2h" />
      )}
    </div>
  );
}

export function ComparePlayers({
  players,
  gender,
}: {
  players: CricketPlayer[];
  gender: Gender;
}) {
  return <PlayerCompare players={players} gender={gender} mode="compare" />;
}
