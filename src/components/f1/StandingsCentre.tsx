"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import DriversTab from "@/components/f1/standings/views/DriversTab";
import ConstructorsTab from "@/components/f1/standings/views/ConstructorsTab";
import StatsTab from "@/components/f1/standings/views/StatsTab";
import HeadToHeadTab from "@/components/f1/standings/views/HeadToHeadTab";
import { Selector } from "@/components/f1/standings/parts";
import type { SeasonPayload } from "@/lib/standings";

// ---------------------------------------------------------------------------
// Championship Standings — the ReelHouse version of the reference's Standings
// screen. Four tabs (drivers, constructors, driver stats, head to head), one
// season selector shared by every table and chart. The season payload is
// assembled server-side from Jolpica F1 and cached here per season so hopping
// between tabs never refetches.
// ---------------------------------------------------------------------------

type Tab = "drivers" | "constructors" | "stats" | "h2h";

const TABS: { key: Tab; label: string; short: string }[] = [
  { key: "drivers", label: "Drivers", short: "Drivers" },
  { key: "constructors", label: "Constructors", short: "Teams" },
  { key: "stats", label: "Driver Stats", short: "Stats" },
  { key: "h2h", label: "Head to Head", short: "H2H" },
];

const payloadCache = new Map<number, SeasonPayload>();

export default function StandingsCentre() {
  const [season, setSeason] = useState(() => new Date().getFullYear());
  const [seasons, setSeasons] = useState<number[]>([]);
  const [payload, setPayload] = useState<SeasonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("drivers");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    drivers: null,
    constructors: null,
    stats: null,
    h2h: null,
  });

  useEffect(() => {
    const cached = payloadCache.get(season);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setPayload(null);
    setError(null);
    setLoading(true);
    fetch(`/api/f1/standings?season=${season}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          payload?: SeasonPayload;
          seasons?: number[];
          error?: string;
        };
        if (!res.ok || !body.payload) throw new Error(body.error ?? `Standings request failed (${res.status})`);
        payloadCache.set(season, body.payload);
        if (Array.isArray(body.seasons) && body.seasons.length) setSeasons(body.seasons);
        setPayload(body.payload);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Standings are unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [season, attempt]);

  // The section nav's Drivers stop points at the directory, which lives in the
  // Drivers tab — bring it forward before the jump scrolls.
  useEffect(() => {
    const openDrivers = () => setTab("drivers");
    window.addEventListener("f1:open-drivers", openDrivers);
    return () => window.removeEventListener("f1:open-drivers", openDrivers);
  }, []);

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next: Tab | null = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length].key;
    else if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length].key;
    else if (e.key === "Home") next = TABS[0].key;
    else if (e.key === "End") next = TABS[TABS.length - 1].key;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const changeSeason = (value: string) => {
    const next = Number(value);
    if (Number.isFinite(next) && next !== season) setSeason(next);
  };

  const counts = payload
    ? {
        drivers: payload.driverStandings.length,
        constructors: payload.constructorStandings.length,
      }
    : null;

  return (
    <section
      id="f1-standings"
      aria-labelledby="f1-standings-title"
      aria-busy={loading}
      style={{ scrollMarginTop: "6.5rem" }}
      className="f1-sticky-shell scroll-mt-32"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#e10600] shadow-[0_0_6px_rgb(225_6_0/0.8)]" />
            Standings · {season}
          </p>
          <h2
            id="f1-standings-title"
            className="mt-1 font-f1 text-2xl font-bold uppercase leading-none tracking-wide text-white md:text-3xl"
          >
            Championship <span className="text-[#e10600]">Standings</span>
          </h2>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-white/45">
            Drivers&apos; and constructors&apos; championships, points progression, race-by-race points and
            team-mate battles — every season since 1950.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-[10px] uppercase tracking-[0.12em] text-white/25 lg:inline">
            Applies to the charts
          </span>
          <Selector label="Season" value={season} onChange={changeSeason} disabled={loading && !payload}>
            {(seasons.length ? seasons : [season]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Selector>
        </div>
      </header>

      {payload?.champion && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#d9af6b]/30 bg-[linear-gradient(100deg,rgba(217,175,107,0.16),rgba(225,6,0,0.08)_55%,rgba(0,0,0,0.25))] px-3.5 py-2.5 shadow-[0_10px_32px_-22px_rgb(217_175_107/0.6)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#d9af6b]/40 bg-[#d9af6b]/10 text-[#d9af6b]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M6 4h12v3a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V4Zm-2 1h1v2H4a2 2 0 0 1 0-2Zm15 0a2 2 0 0 1 0 2h-1V5h1ZM11 13h2v4h3.5l1 4h-11l1-4H11v-4Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#d9af6b]">
              {season} World Champion
            </p>
            <p className="truncate font-f1 text-[17px] font-bold uppercase leading-tight tracking-wide text-white">
              {payload.champion.name}
            </p>
          </div>
          <p className="ml-auto text-right text-[10.5px] font-semibold uppercase leading-tight tracking-[0.12em] text-white/45">
            {payload.champion.teamName}
            <span className="block tabular-nums text-white/35">
              {payload.champion.points} pts · {payload.champion.wins} wins · after round{" "}
              {payload.champion.round}
            </span>
          </p>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div
          role="tablist"
          aria-label="Championship standings views"
          onKeyDown={onTabKeyDown}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                type="button"
                role="tab"
                id={`f1-standings-tab-${t.key}`}
                aria-selected={active}
                aria-controls="f1-standings-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#e10600]/60 ${
                  active
                    ? "bg-gradient-to-r from-[#e10600] to-[#ff2b1f] text-white shadow-[0_2px_10px_rgb(225_6_0/0.25)]"
                    : "text-white/55 hover:text-[#ff4a45]"
                }`}
              >
                <span className="hidden truncate sm:inline">{t.label}</span>
                <span className="truncate sm:hidden">{t.short}</span>
              </button>
            );
          })}
        </div>
        {counts && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-1.5 text-[11px] font-semibold text-white/55 md:flex">
            Drivers
            <span className="rounded bg-white/10 px-1 text-[10px] font-bold tabular-nums text-white/70">
              {counts.drivers}
            </span>
          </span>
        )}
      </div>

      <div
        id="f1-standings-panel"
        role="tabpanel"
        aria-labelledby={`f1-standings-tab-${tab}`}
        tabIndex={0}
        className="outline-none focus-visible:ring-2 focus-visible:ring-[#e10600]/40"
      >
        {loading && !payload ? (
          <StandingsSkeleton />
        ) : error ? (
          <div className="f1-card rounded-2xl px-4 py-10 text-center">
            <p className="font-f1 text-sm font-bold uppercase tracking-[0.08em] text-white/80">
              Standings unavailable
            </p>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-white/45">
              The championship feed could not be reached. {error}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="mt-4 rounded-md bg-[#e10600] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#ff2421] active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : payload ? (
          <>
            <h3 className="sr-only">{TABS.find((t) => t.key === tab)?.label}</h3>
            {tab === "drivers" && (
              <DriversTab
                key={payload.season}
                payload={payload}
                seasons={seasons}
                onSeason={(s) => changeSeason(String(s))}
              />
            )}
            {tab === "constructors" && <ConstructorsTab key={payload.season} payload={payload} />}
            {tab === "stats" && <StatsTab key={payload.season} payload={payload} />}
            {tab === "h2h" && <HeadToHeadTab key={payload.season} payload={payload} />}
          </>
        ) : null}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-white/25">
        Championship classifications from Jolpica F1; progression, season statistics and head-to-head records are
        derived from the same race, sprint and qualifying results. Unofficial — not associated with Formula 1 or the FIA.
      </p>
    </section>
  );
}

function StandingsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-hidden="true">
      <div className="f1-card rounded-2xl p-4 md:p-5">
        <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-4 animate-pulse rounded bg-white/[0.07]" />
              <div className="h-6 w-6 animate-pulse rounded-full bg-white/[0.07]" />
              <div className="h-3 flex-1 animate-pulse rounded bg-white/[0.07]" />
              <div className="h-3 w-8 animate-pulse rounded bg-white/[0.07]" />
            </div>
          ))}
        </div>
      </div>
      <div className="f1-card rounded-2xl p-4 md:p-5">
        <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-8 h-[280px] animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
    </div>
  );
}
