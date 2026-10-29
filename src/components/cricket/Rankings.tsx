"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  CricketPlayer,
  Gender,
  MatchFormat,
  PlayerRankingRow,
  RankingSet,
  TeamRankingRow,
} from "@/lib/cricket/types";
import { formatNumber, formatShortDate, playerNameKey, teamJerseyBar } from "@/lib/cricket/shared";
import CompareSection from "./CompareSection";
import HeadToHeadSection from "./HeadToHeadSection";
import PlayerStatsSection from "./PlayerStatsSection";
import { TeamFlag } from "./TeamFlag";
import { EmptyState, PlayerAvatar, SectionHeading, Select } from "./ui";

type Tab = "team" | "batting" | "bowling" | "allrounder";
type View = "rankings" | "player-stats" | "head-to-head" | "compare";

const VIEWS: { key: View; label: string }[] = [
  { key: "rankings", label: "Rankings" },
  { key: "player-stats", label: "Player Stats" },
  { key: "head-to-head", label: "Head to Head" },
  { key: "compare", label: "Compare" },
];

const TABS: { key: Tab; label: string; short: string }[] = [
  { key: "team", label: "Teams", short: "Teams" },
  { key: "batting", label: "Batting", short: "Bat" },
  { key: "bowling", label: "Bowling", short: "Bowl" },
  { key: "allrounder", label: "All-rounders", short: "AR" },
];

function Movement({ change }: { change: number | null }) {
  if (change == null) return <span className="text-[11.5px] text-white/25">—</span>;
  if (change === 0) return <span className="text-[12.5px] text-white/30">—</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12.5px] font-semibold tabular-nums ${change > 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
      <span aria-hidden="true">{change > 0 ? "▲" : "▼"}</span>
      {Math.abs(change)}
    </span>
  );
}

function Rank({ position }: { position: number }) {
  return (
    <span className={`inline-grid h-8 w-8 place-items-center rounded-lg border font-f1 text-[17px] font-bold tabular-nums transition-all duration-200 group-hover:scale-105 ${
      position === 1
        ? "border-[#d9af6b]/35 bg-[#d9af6b]/10 text-[#d9af6b]"
        : position <= 3
          ? "border-white/12 bg-white/[0.05] text-white"
          : "border-white/[0.06] bg-black/20 text-white/55"
    }`}>
      {position}
    </span>
  );
}

function RatingBars({
  rows,
  label,
  kind,
}: {
  rows: { name: string; code: string; team?: string; rating: number | null; imageUrl?: string | null }[];
  label: string;
  kind: "team" | "player";
}) {
  const top = rows.filter((row) => row.rating != null).slice(0, 6);
  const max = Math.max(1, ...top.map((row) => row.rating ?? 0));
  return (
    <div>
      <p className="mb-3 font-f1 text-[13px] font-bold uppercase tracking-[0.08em] text-white/55">{label}</p>
      <div className="space-y-2.5">
        {top.map((row, index) => {
          const bar = teamJerseyBar(kind === "player" ? row.team : row.name);
          return (
          <div key={`${row.code}-${row.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {kind === "player" ? (
                  <PlayerAvatar
                    player={{ name: row.name, imageUrl: row.imageUrl ?? null }}
                    size={18}
                  />
                ) : null}
                <TeamFlag
                  team={{ name: row.team || row.name, abbreviation: row.code }}
                  size="xs"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-white/70">
                  {row.name}
                </span>
                <span className="shrink-0 font-f1 text-[13px] font-bold tabular-nums text-white">
                  {formatNumber(row.rating)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className={`ck-bar h-full rounded-full ${
                    bar ? "" : "bg-[linear-gradient(90deg,#1d509e,#8fb4ec)]"
                  }`}
                  style={{
                    width: `${Math.max(3, ((row.rating ?? 0) / max) * 100)}%`,
                    animationDelay: `${index * 55}ms`,
                    background: bar?.background,
                  }}
                />
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamTable({ rows }: { rows: TeamRankingRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.rating ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <caption className="sr-only">ICC team rankings</caption>
        <thead>
          <tr className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/45">
            <th scope="col" className="w-14 py-2.5 pl-1">Pos.</th>
            <th scope="col" className="w-[30%] py-2.5">Team</th>
            <th scope="col" className="py-2.5 pr-3 text-[12px] text-white/30">Rating strength</th>
            <th scope="col" className="w-20 py-2.5 text-right">Rating</th>
            <th scope="col" className="w-20 py-2.5 text-right">Points</th>
            <th scope="col" className="w-14 py-2.5 pr-1 text-right">+/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const bar = teamJerseyBar(row.name);
            return (
            <tr
              key={`${row.position}-${row.name}`}
              title={`${row.name} · ${formatNumber(row.rating)} rating · ${formatNumber(row.points)} points`}
              className="ck-rank-row group h-[58px] border-t border-white/[0.07]"
            >
              <td className="pl-1"><Rank position={row.position} /></td>
              <td className="min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TeamFlag team={{ name: row.name, abbreviation: row.code }} size="sm" />
                  <span className="ck-rank-name truncate text-[16.5px] font-medium text-white/85 transition-colors duration-200 group-hover:text-white">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="pr-4">
                <div className="ck-rank-track h-2.5 overflow-hidden rounded-full bg-white/[0.055]">
                  <div
                    className={`ck-bar h-full rounded-full ${
                      bar ? "" : "bg-[linear-gradient(90deg,#123a78,#3f78d8_55%,#8fb4ec)]"
                    }`}
                    style={{
                      width: `${Math.max(3, ((row.rating ?? 0) / max) * 100)}%`,
                      animationDelay: `${index * 40}ms`,
                      background: bar?.background,
                      boxShadow: bar ? `0 0 10px ${bar.glow}` : undefined,
                    }}
                  />
                </div>
              </td>
              <td className="text-right font-f1 text-[19px] font-bold tabular-nums text-white transition-colors duration-200 group-hover:text-[#d9af6b]">
                {formatNumber(row.rating)}
              </td>
              <td className="text-right font-f1 text-[16px] tabular-nums text-white/50 transition-colors group-hover:text-white/75">
                {formatNumber(row.points)}
              </td>
              <td className="pr-1 text-right"><Movement change={row.change} /></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerTable({
  rows,
  photos,
}: {
  rows: PlayerRankingRow[];
  photos: Map<string, CricketPlayer>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.rating));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">ICC player rankings</caption>
        <thead>
          <tr className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/45">
            <th scope="col" className="w-14 py-2.5 pl-1">Pos.</th>
            <th scope="col" className="w-[29%] py-2.5">Player</th>
            <th scope="col" className="w-[20%] py-2.5">Team</th>
            <th scope="col" className="py-2.5 pr-3 text-[12px] text-white/30">Rating strength</th>
            <th scope="col" className="w-20 py-2.5 text-right">Rating</th>
            <th scope="col" className="w-14 py-2.5 pr-1 text-right">+/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const bar = teamJerseyBar(row.team);
            return (
            <tr
              key={`${row.position}-${row.name}`}
              title={`${row.name} · ${formatNumber(row.rating)} rating · ${row.team}`}
              className="ck-rank-row group h-[58px] border-t border-white/[0.07]"
            >
              <td className="pl-1"><Rank position={row.position} /></td>
              <td className="min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="transition-transform duration-300 group-hover:scale-110">
                    <PlayerAvatar
                      player={{
                        name: row.name,
                        imageUrl: photos.get(playerNameKey(row.name))?.imageUrl ?? row.imageUrl,
                      }}
                      size={30}
                    />
                  </span>
                  <span className="ck-rank-name block truncate text-[16.5px] font-medium text-white/85 transition-colors duration-200 group-hover:text-white">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <TeamFlag team={{ name: row.team, abbreviation: row.teamCode }} size="xs" />
                  <span className="truncate text-[15px] text-white/50 transition-colors group-hover:text-white/75">
                    {row.team}
                  </span>
                </div>
              </td>
              <td className="pr-4">
                <div className="ck-rank-track h-2.5 overflow-hidden rounded-full bg-white/[0.055]">
                  <div
                    className={`ck-bar h-full rounded-full ${
                      bar ? "" : "bg-[linear-gradient(90deg,#123a78,#3f78d8_55%,#8fb4ec)]"
                    }`}
                    style={{
                      width: `${Math.max(3, (row.rating / max) * 100)}%`,
                      animationDelay: `${index * 40}ms`,
                      background: bar?.background,
                      boxShadow: bar ? `0 0 10px ${bar.glow}` : undefined,
                    }}
                  />
                </div>
              </td>
              <td className="text-right font-f1 text-[19px] font-bold tabular-nums text-white transition-colors duration-200 group-hover:text-[#d9af6b]">
                {formatNumber(row.rating)}
              </td>
              <td className="pr-1 text-right"><Movement change={row.change} /></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function setFor(rankings: RankingSet[], format: MatchFormat): RankingSet | null {
  return rankings.find((set) => set.format === format) ?? null;
}

const rankingsCache = new Map<Gender, RankingSet[]>();

export default function Rankings({ gender, players }: { gender: Gender; players: CricketPlayer[] }) {
  const available = useMemo(
    () => (gender === "women" ? (["ODI", "T20I"] as MatchFormat[]) : (["Test", "ODI", "T20I"] as MatchFormat[])),
    [gender]
  );
  const [rankings, setRankings] = useState<RankingSet[]>(() => rankingsCache.get(gender) ?? []);
  const [loading, setLoading] = useState(() => !rankingsCache.has(gender));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const photos = useMemo(() => {
    const map = new Map<string, CricketPlayer>();
    for (const player of players) map.set(playerNameKey(player.name), player);
    return map;
  }, [players]);
  const [format, setFormat] = useState<MatchFormat>(available[0]);
  const [view, setView] = useState<View>("rankings");
  const [tab, setTab] = useState<Tab>("team");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    team: null,
    batting: null,
    bowling: null,
    allrounder: null,
  });

  useEffect(() => {
    const cached = rankingsCache.get(gender);
    if (cached && cached.length > 0) {
      setRankings(cached);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    setRankings([]);
    setLoading(true);
    setError(false);
    fetch(`/api/cricket/rankings?gender=${gender}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { rankings?: RankingSet[] };
        if (!response.ok) throw new Error("rankings unavailable");
        const sets = body.rankings ?? [];
        if (sets.length === 0) throw new Error("rankings unavailable");
        rankingsCache.set(gender, sets);
        setRankings(sets);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [gender, attempt]);

  useEffect(() => {
    if (!available.includes(format)) setFormat(available[0]);
  }, [available, format]);

  const set = setFor(rankings, format);
  const rows =
    tab === "team"
      ? set?.team ?? []
      : tab === "batting"
        ? set?.batting ?? []
        : tab === "bowling"
          ? set?.bowling ?? []
          : set?.allRounder ?? [];
  const visibleRows = rows.slice(0, tab === "team" ? 10 : 20);

  const chartRows =
    tab === "team"
      ? (set?.team ?? []).map((row) => ({ name: row.name, code: row.code, rating: row.rating }))
      : (rows as PlayerRankingRow[]).map((row) => ({
          name: row.name,
          code: row.teamCode,
          team: row.team,
          rating: row.rating,
          imageUrl: photos.get(playerNameKey(row.name))?.imageUrl ?? row.imageUrl,
        }));

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((entry) => entry.key === tab);
    let next: Tab | null = null;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length].key;
    else if (event.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length].key;
    else if (event.key === "Home") next = TABS[0].key;
    else if (event.key === "End") next = TABS[TABS.length - 1].key;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="ck-rankings" aria-labelledby="ck-rankings-title" className="scroll-mt-28">
      <SectionHeading
        id="ck-rankings-title"
        eyebrow={`ICC · ${gender === "men" ? "Men" : "Women"}`}
        title="ICC Ranking"
        accent="& Statistics"
        right={
          view === "rankings" ? (
            <Select
              label="Format"
              value={format}
              onChange={(value) => setFormat(value as MatchFormat)}
              options={available.map((option) => ({ value: option, label: option }))}
            />
          ) : undefined
        }
      />

      <div className="f1-card rounded-2xl p-4 md:p-5">
        <div
          role="tablist"
          aria-label="ICC ranking and statistics views"
          className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-white/[0.07] pb-3"
        >
          {VIEWS.map((entry) => {
            const active = view === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(entry.key)}
                className={`shrink-0 rounded-md px-3 py-2 text-[13.5px] font-semibold transition-colors ${
                  active
                    ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)]"
                    : "text-white/40 hover:bg-white/[0.04] hover:text-white/75"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
          {view === "rankings" && (
            <span className="ml-auto hidden shrink-0 text-[11.5px] uppercase tracking-[0.12em] text-white/30 sm:inline">
              Official ICC tables
            </span>
          )}
        </div>

        {view === "rankings" ? (
          <>
        <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-0.5">
          <div role="tablist" aria-label="Ranking tables" onKeyDown={onTabKeyDown} className="flex min-w-0 items-center gap-1">
            {TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <button
                  key={entry.key}
                  ref={(element) => {
                    tabRefs.current[entry.key] = element;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(entry.key)}
                  className={`shrink-0 rounded-md px-3 py-2 text-[13.5px] font-medium transition ${
                    active
                      ? "bg-gradient-to-r from-[#1d509e] to-[#3f78d8] text-white shadow-[0_2px_10px_rgb(63_120_216/0.25)]"
                      : "text-white/45 hover:text-[#b9d7ff]"
                  }`}
                >
                  <span className="hidden sm:inline">{entry.label}</span>
                  <span className="sm:hidden">{entry.short}</span>
                </button>
              );
            })}
          </div>
          {set && (
            <span className="ml-auto hidden shrink-0 text-[11.5px] uppercase tracking-[0.12em] text-white/30 md:inline">
              {formatShortDate(set.asOf)}
            </span>
          )}
        </div>

        {loading && !set ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[42px] animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : error && !set ? (
          <div className="py-8 text-center">
            <p className="font-f1 text-sm font-bold uppercase tracking-[0.08em] text-white/70">Rankings unavailable</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-3 rounded-md bg-[#1d509e] px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#2f6fd0] active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : !set || rows.length === 0 ? (
          <EmptyState title={`${format} rankings unavailable`} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              {tab === "team" ? (
                <TeamTable rows={visibleRows as TeamRankingRow[]} />
              ) : (
                <PlayerTable rows={visibleRows as PlayerRankingRow[]} photos={photos} />
              )}
            </div>
            <div className="border-t border-white/[0.07] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <RatingBars
                rows={chartRows}
                label={tab === "team" ? "Top teams" : "Top players"}
                kind={tab === "team" ? "team" : "player"}
              />
              <p className="mt-4 text-[11.5px] uppercase tracking-[0.1em] text-white/30">
                {set.asOf ? `Updated ${formatShortDate(set.asOf)}` : `ICC ${format}`}
              </p>
            </div>
          </div>
        )}
          </>
        ) : view === "player-stats" ? (
          <PlayerStatsSection gender={gender} />
        ) : view === "head-to-head" ? (
          <HeadToHeadSection gender={gender} />
        ) : (
          <CompareSection gender={gender} />
        )}
      </div>
    </section>
  );
}
