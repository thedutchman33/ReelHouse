"use client";

import { useEffect, useId, useState } from "react";
import CircuitMap3D from "@/components/f1/CircuitMap3D";
import F1Dialog from "@/components/f1/Dialog";
import { useSessionTime } from "@/components/f1/timezone";
import type { F1Round } from "@/lib/f1";
import type { TrackInfo } from "@/lib/track-info";

// ---------------------------------------------------------------------------
// The season-calendar sheet for a race that has not happened yet: the real
// circuit map plus the official weekend facts — track length, race distance,
// lap count, the outright lap record and the defending winner at the circuit.
// ---------------------------------------------------------------------------

type Status = "loading" | "done" | "error";

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-1 font-f1 text-[19px] font-bold leading-none tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 truncate text-[10.5px] text-white/40">{hint}</p>}
    </div>
  );
}

export default function RaceDetails({
  round,
  roundNumber,
  year,
  open,
  onClose,
}: {
  round: F1Round;
  roundNumber: number;
  year: number;
  open: boolean;
  onClose: () => void;
}) {
  const m = round.meeting;
  const { dateTime, dayMonth } = useSessionTime();
  const titleId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [info, setInfo] = useState<TrackInfo | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setInfo(null);
    setStatus("loading");
    const query = new URLSearchParams({
      year: String(year),
      round: String(roundNumber),
      meeting: m.meeting_name,
    });
    fetch(`/api/f1/track?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("track unavailable");
        return (await response.json()) as TrackInfo;
      })
      .then((payload) => {
        setInfo(payload);
        setStatus("done");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [open, year, roundNumber, m.meeting_name]);

  return (
    <F1Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      eyebrow={
        <>
          Round {String(roundNumber).padStart(2, "0")} · {year}
        </>
      }
      size="lg"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {m.country_flag && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.country_flag}
            alt={m.country_name}
            className="h-4 w-7 rounded-sm object-cover"
            draggable={false}
          />
        )}
        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/50">
          {m.country_name}
        </span>
        <span className="ml-auto rounded-full bg-[#e10600]/15 px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.14em] text-[#ff5347]">
          Upcoming
        </span>
      </div>

      <h3
        id={titleId}
        className="mt-2 font-f1 text-2xl font-bold uppercase leading-[1.05] tracking-wide text-white sm:text-[30px]"
      >
        {m.meeting_name.replace(/ Grand Prix$/i, "")}
        <span className="text-[#e10600]"> Grand Prix</span>
      </h3>
      <p className="mt-1.5 text-[12.5px] text-white/50">
        {info?.officialName ?? m.circuit_short_name ?? m.location}
        <span className="text-white/20"> · </span>
        {m.location}
        <span className="text-white/20"> · </span>
        <time dateTime={round.race.date_start}>{dayMonth(round.race.date_start)}</time>
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] sm:items-start">
        <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2">
          {/* The F1 race-page layout — sector bands, sector names, speed trap —
              on the extruded 3D plate with its lapping light. */}
          <CircuitMap3D
            variant="sectors"
            circuitInfoUrl={m.circuit_info_url}
            circuitImage={m.circuit_image}
            name={m.circuit_short_name ?? m.location}
          />
          <p className="pb-1 text-center text-[9.5px] font-black uppercase tracking-[0.18em] text-white/35">
            {m.circuit_short_name ?? m.location}
            <span className="text-white/20"> · </span>
            Sector layout &amp; speed trap
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {status === "loading" ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[64px] animate-pulse rounded-lg bg-white/[0.04]" />
            ))
          ) : (
            <>
              <StatTile
                label="Circuit length"
                value={info?.circuitLengthKm ? `${info.circuitLengthKm} km` : "—"}
                hint={info?.circuitType ?? undefined}
              />
              <StatTile
                label="Race distance"
                value={info?.raceDistanceKm ? `${info.raceDistanceKm} km` : "—"}
              />
              <StatTile
                label="Laps"
                value={info?.laps ? String(info.laps) : "—"}
                hint={info?.location ?? undefined}
              />
              <StatTile
                label="Lap record"
                value={info?.lapRecord?.time ?? "—"}
                hint={
                  info?.lapRecord
                    ? `${info.lapRecord.driver}${info.lapRecord.season ? ` (${info.lapRecord.season})` : ""}`
                    : undefined
                }
              />
            </>
          )}

          <div className="col-span-2 rounded-lg border border-[#d9af6b]/25 bg-[#d9af6b]/[0.07] px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#d9af6b]/80">
              Defending winner
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-f1 text-[16px] font-bold leading-none text-white">
              {info?.defendingWinner?.name ?? (status === "loading" ? "…" : "—")}
              {info?.defendingWinner && (
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/40">
                  {info.defendingWinner.team} · {info.defendingWinner.season}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-[11px] text-white/35">
        <p>
          {round.race.session_name} starts{" "}
          <time dateTime={round.race.date_start} className="whitespace-nowrap text-white/60">
            {dateTime(round.race.date_start)}
          </time>
        </p>
        {status === "error" ? (
          <span className="text-white/30">Official circuit facts unavailable.</span>
        ) : (
          <span className="uppercase tracking-[0.12em]">Official F1 circuit data</span>
        )}
      </div>
    </F1Dialog>
  );
}
