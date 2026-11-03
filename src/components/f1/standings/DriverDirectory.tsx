"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import F1Dialog from "@/components/f1/Dialog";
import { TeamMark } from "@/components/f1/TeamLogo";
import { pointsFmt, surname } from "@/components/f1/standings/parts";
import type { DriverCareer } from "@/lib/driver-career";
import type { SeasonPayload } from "@/lib/standings";

// ---------------------------------------------------------------------------
// Driver directory — the season's grid as portrait cards, ordered by world
// championships (then by this season's championship position), with the full
// career record behind each card. Mirrors the cricket page's player directory:
// filter, scan, open one driver. Championships come with the standings
// payload; the deeper career record is fetched once per driver and cached.
// ---------------------------------------------------------------------------

function TrophyMark({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M6 4h12v3a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V4Zm-2 1h1v2H4a2 2 0 0 1 0-2Zm15 0a2 2 0 0 1 0 2h-1V5h1ZM11 13h2v4h3.5l1 4h-11l1-4H11v-4Z" />
    </svg>
  );
}

/** The F1 CDN answers every card at a fixed width; ask for the sharpest rung. */
function sharpPortrait(url: string | null): string | null {
  return url ? url.replace(/\/(1|2|3|4|5)col\//, "/6col/") : null;
}

const careerCache = new Map<string, DriverCareer>();

function CareerBlock({
  driverId,
  season,
}: {
  driverId: string;
  season: number;
}) {
  const [career, setCareer] = useState<DriverCareer | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const requested = useRef<string | null>(null);

  useEffect(() => {
    const cached = careerCache.get(driverId);
    if (cached) {
      setCareer(cached);
      setState("done");
      return;
    }
    requested.current = driverId;
    const controller = new AbortController();
    setCareer(null);
    setState("loading");
    fetch(`/api/f1/driver?id=${encodeURIComponent(driverId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("career unavailable");
        return (await response.json()) as DriverCareer;
      })
      .then((data) => {
        careerCache.set(driverId, data);
        if (requested.current !== driverId) return;
        setCareer(data);
        setState("done");
      })
      .catch(() => {
        if (!controller.signal.aborted && requested.current === driverId) setState("error");
      });
    return () => controller.abort();
  }, [driverId]);

  if (state === "loading") {
    return (
      <div className="mt-4 border-t border-white/[0.07] pt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d9af6b]/80">
          Career
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[44px] animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  if (state === "error" || !career) {
    return (
      <div className="mt-4 border-t border-white/[0.07] pt-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d9af6b]/80">
          Career
        </p>
        <p className="text-[11.5px] text-white/35">Career record unavailable.</p>
      </div>
    );
  }

  const titles = career.championships;
  const seasons = career.seasons;

  return (
    <div className="mt-4 border-t border-white/[0.07] pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d9af6b]/80">
          Career
        </p>
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/25">
          {seasons.length ? `${career.firstSeason}–${career.lastSeason}` : season}
          {seasons.length ? ` · ${seasons.length} season${seasons.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {titles.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d9af6b]/35 bg-[linear-gradient(100deg,rgba(217,175,107,0.18),rgba(0,0,0,0.2))] px-2.5 py-2">
          <span className="flex shrink-0 items-center gap-1.5 font-f1 text-[13px] font-bold uppercase leading-none tracking-[0.04em] text-[#f0cd92]">
            <TrophyMark size={14} />
            {titles.length}× World Champion
          </span>
          <span className="flex flex-wrap gap-1">
            {titles.map((year) => (
              <span
                key={year}
                className="rounded bg-[#d9af6b]/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#f0cd92]"
              >
                {year}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[
          ["Starts", career.starts],
          ["Wins", career.wins],
          ["Podiums", career.podiums],
          ["Poles", career.poles],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</p>
            <p className="mt-0.5 font-f1 text-[16px] font-bold leading-none tabular-nums text-white">
              {value}
            </p>
          </div>
        ))}
      </div>

      <ul className="mt-2.5 space-y-1 text-[11.5px] leading-snug text-white/55">
        {titles.length > 0 && (
          <li className="flex items-start gap-1.5">
            <span aria-hidden="true" className="mt-[3px] text-[#d9af6b]">
              ◆
            </span>
            <span>
              World Champion in{" "}
              <span className="font-semibold text-[#f0cd92]">
                {titles.length > 1
                  ? `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`
                  : titles[0]}
              </span>
              .
            </span>
          </li>
        )}
        <li className="flex items-start gap-1.5">
          <span aria-hidden="true" className="mt-[3px] text-[#e10600]">
            ◆
          </span>
          <span>
            <span className="font-semibold text-white">{career.wins}</span> Grand Prix{" "}
            {career.wins === 1 ? "win" : "wins"} from{" "}
            <span className="font-semibold text-white">{career.starts}</span> starts.
          </span>
        </li>
        <li className="flex items-start gap-1.5">
          <span aria-hidden="true" className="mt-[3px] text-[#e10600]">
            ◆
          </span>
          <span>
            <span className="font-semibold text-white">{career.podiums}</span> podium finishes and{" "}
            <span className="font-semibold text-white">{career.poles}</span> pole positions.
          </span>
        </li>
        {career.teams.length > 0 && (
          <li className="flex items-start gap-1.5">
            <span aria-hidden="true" className="mt-[3px] text-[#e10600]">
              ◆
            </span>
            <span>Drove for {career.teams.map((team) => team.name).join(", ")}.</span>
          </li>
        )}
      </ul>
    </div>
  );
}

export default function DriverDirectory({ payload }: { payload: SeasonPayload }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { season, driverStandings, drivers, driverStats, champion } = payload;

  const byId = useMemo(
    () => new Map(driverStandings.map((row) => [row.id, row])),
    [driverStandings]
  );
  const driverInfo = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  // Titles first, then this season's championship order.
  const visible = useMemo(
    () =>
      drivers
        .slice()
        .sort(
          (a, b) =>
            b.championships.length - a.championships.length ||
            (byId.get(a.id)?.position ?? 99) - (byId.get(b.id)?.position ?? 99)
        ),
    [drivers, byId]
  );

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedInfo = selectedId ? driverInfo.get(selectedId) ?? null : null;
  const stats = selectedId ? driverStats[selectedId] ?? null : null;
  // The official current-season cutout (already at 720px) beats the feed crop.
  const selectedPortrait = selectedInfo
    ? selectedInfo.portraitUrl ?? sharpPortrait(selectedInfo.headshotUrl)
    : null;

  return (
    <section id="f1-drivers" aria-labelledby="f1-drivers-title" className="scroll-mt-32">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#e10600] shadow-[0_0_6px_rgb(225_6_0/0.8)]" />
            {season} grid · {driverStandings.length} drivers
          </p>
          <h2
            id="f1-drivers-title"
            className="mt-1 font-f1 text-2xl font-bold uppercase leading-none tracking-wide text-white md:text-3xl"
          >
            Driver <span className="text-[#e10600]">directory</span>
          </h2>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-white/45">
            Every driver on the grid, ordered by world championships and then championship
            position. Pick a portrait for their career record.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/45">
            {driverStandings.length} drivers
          </span>
        </div>
      </header>

      <div className="f1-card rounded-2xl p-4 md:p-5">
        {visible.length === 0 ? (
          <p className="px-2 py-10 text-center text-[12px] text-white/45">
            No drivers are published for {season} yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((driver) => {
              const row = byId.get(driver.id);
              const isChampion = champion?.driverId === driver.id;
              const titles = driver.championships.length;
              const portrait = driver.portraitUrl ?? sharpPortrait(driver.headshotUrl);
              return (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => setSelectedId(driver.id)}
                  aria-label={`Open ${driver.name}'s profile`}
                  className="group min-w-0 text-left focus-visible:outline-none"
                >
                  <span
                    className="relative block aspect-[4/5] overflow-hidden rounded-lg border border-white/[0.09] shadow-[0_14px_34px_-22px_rgb(0_0_0/0.9)]"
                    style={{
                      background: `radial-gradient(ellipse at 50% 22%, #${driver.colour}44 0%, #14141b 58%, #08080c 100%)`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#050507] via-[#050507]/60 to-transparent"
                    />
                    <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 font-f1 text-[10px] font-black tabular-nums tracking-wide text-white/80 backdrop-blur-sm">
                      {driver.number ? `#${driver.number}` : driver.code}
                    </span>
                    {isChampion ? (
                      <span
                        className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded bg-[#d9af6b]/20 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-[0.12em] text-[#f0cd92] backdrop-blur-sm"
                        title={`${season} World Champion`}
                      >
                        <TrophyMark size={10} />
                        Champion
                      </span>
                    ) : (
                      titles > 0 && (
                        <span
                          className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded bg-black/45 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-[0.12em] text-[#f0cd92] backdrop-blur-sm"
                          title={`${titles} world title${titles === 1 ? "" : "s"}`}
                        >
                          <TrophyMark size={10} />
                          {titles}× WC
                        </span>
                      )
                    )}
                    {portrait ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={portrait}
                        alt={driver.name}
                        loading="lazy"
                        draggable={false}
                        referrerPolicy="no-referrer"
                        className="absolute inset-x-0 bottom-0 mx-auto h-[94%] w-full object-contain object-bottom transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 grid place-items-center font-f1 text-5xl font-black tracking-[0.06em]"
                        style={{ color: `#${driver.colour}` }}
                      >
                        {driver.code}
                      </span>
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/[0.07] bg-black/65 px-2.5 py-1.5 backdrop-blur-[2px]">
                      <span className="block truncate font-f1 text-[14.5px] font-bold uppercase leading-none tracking-[0.03em] text-white">
                        {surname(driver.name)}
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-1 text-[10px] text-white/55">
                        <span className="truncate">{driver.nationality}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-white/80">
                          {row ? `P${row.position} · ${pointsFmt(row.points)}` : "—"}
                        </span>
                      </span>
                    </span>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[#e10600] via-[#ff5347] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <F1Dialog
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        eyebrow={`${season} driver`}
        labelledBy="f1-driver-profile-title"
        size="md"
      >
        {selected && selectedInfo && (
          <div>
            <div className="flex flex-wrap items-start gap-4">
              <span
                className="relative grid h-[104px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10"
                style={{
                  background: `radial-gradient(ellipse at 50% 25%, #${selectedInfo.colour}55 0%, #101016 70%)`,
                }}
              >
                {selectedPortrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedPortrait}
                    alt={selected.name}
                    className="h-full w-full object-contain object-bottom"
                    draggable={false}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="font-f1 text-2xl font-black" style={{ color: `#${selectedInfo.colour}` }}>
                    {selectedInfo.code}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="f1-driver-profile-title"
                  className="font-f1 text-xl font-bold uppercase leading-none tracking-wide text-white"
                >
                  {selected.name}
                </h3>
                <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-white/60">
                  <TeamMark team={selected.teamName} size={14} />
                  {selected.teamName}
                  {selectedInfo.number && (
                    <span className="text-white/30">· #{selectedInfo.number}</span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {champion?.driverId === selected.id && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-[#d9af6b]/30 bg-[#d9af6b]/10 px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#d9af6b]">
                      <TrophyMark size={11} />
                      {season} World Champion
                    </span>
                  )}
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/50">
                    {selectedInfo.nationality}
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/50">
                    P{selected.position} · {pointsFmt(selected.points)}
                  </span>
                </div>
              </div>
            </div>

            <CareerBlock driverId={selected.id} season={season} />

            <div className="mt-4 border-t border-white/[0.07] pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                {season} season
              </p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {[
                  ["Starts", stats?.starts ?? 0],
                  ["Wins", stats?.wins ?? selected.wins],
                  ["Podiums", stats?.podiums ?? 0],
                  ["Poles", stats?.poles ?? 0],
                  ["Points", pointsFmt(selected.points)],
                  ["DNFs", stats?.dnfs ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</p>
                    <p className="mt-0.5 font-f1 text-[16px] font-bold leading-none tabular-nums text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {[
                  ["Best finish", stats?.bestFinish ? `P${stats.bestFinish}` : "—"],
                  ["Best grid", stats?.bestGrid ? `P${stats.bestGrid}` : "—"],
                  ["Avg finish", stats?.avgFinish != null ? stats.avgFinish.toFixed(1) : "—"],
                  ["Fastest laps", stats?.fastestLaps ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</p>
                    <p className="mt-0.5 font-f1 text-[15px] font-bold leading-none tabular-nums text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </F1Dialog>
    </section>
  );
}
