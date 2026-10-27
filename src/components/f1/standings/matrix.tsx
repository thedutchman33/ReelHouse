"use client";

import { pointsFmt } from "@/components/f1/standings/parts";

// Round-by-round championship heatmap. Mirrors the reference grid: 3px cell
// gutters, 32px rounded cells, a sticky entrant column and a points/position
// colour scale instead of borders and dividers.

export interface MatrixRow {
  id: string;
  label: string;
  colour: string;
}

function pointsStyle(points: number | null): { background: string; color: string } | null {
  if (points == null) return null;
  if (points >= 25) return { background: "#facc15", color: "#0b0b0e" };
  if (points >= 18) return { background: "#cbd5e1", color: "#0b0b0e" };
  if (points >= 15) return { background: "#2563eb", color: "#ffffff" };
  if (points >= 12) return { background: "#2563eb", color: "#ffffff" };
  if (points >= 10) return { background: "#3b82f6", color: "#ffffff" };
  if (points >= 8) return { background: "#38bdf8", color: "#0b0b0e" };
  if (points >= 6) return { background: "#7dd3fc", color: "#0b0b0e" };
  if (points >= 4) return { background: "#7f1d1d", color: "#fca5a5" };
  if (points >= 1) return { background: "#450a0a", color: "#fca5a5" };
  return { background: "#3a1a1a", color: "rgba(252,165,165,0.75)" };
}

function positionStyle(position: number | null): { background: string; color: string } | null {
  if (position == null) return null;
  if (position === 1) return { background: "#facc15", color: "#0b0b0e" };
  if (position <= 3) return { background: "#cbd5e1", color: "#0b0b0e" };
  if (position <= 10) return { background: "#2563eb", color: "#ffffff" };
  return { background: "#450a0a", color: "#fca5a5" };
}

export default function PointsMatrix({
  rows,
  values,
  positions,
  mode,
  caption,
  totals,
  rowLabel = "Driver",
}: {
  rows: MatrixRow[];
  /** One array per row: points (or positions) per round; null = no entry. */
  values: (number | null)[][];
  positions: (number | null)[][];
  mode: "points" | "position";
  caption: string;
  /** Championship totals, keyed by row id, for the Pts column. */
  totals?: Record<string, number>;
  /** First-column heading: "Driver" for the drivers' grid, "Team" otherwise. */
  rowLabel?: string;
}) {
  const roundCount = Math.max(0, ...values.map((v) => v.length));
  if (!rows.length || !roundCount) {
    return <p className="py-8 text-center text-[12px] text-white/40">No rounds have been scored yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-separate border-spacing-[3px] text-center text-[11.5px]"
        style={{ borderCollapse: "separate" }}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-white/50">
            <th
              scope="col"
              className="sticky left-0 z-20 bg-[#15151e] px-2 py-1 text-left text-[11px] font-semibold"
            >
              {rowLabel}
            </th>
            <th scope="col" className="px-2 text-center text-[11px] font-semibold">
              {mode === "points" ? "Pts" : "Best"}
            </th>
            {Array.from({ length: roundCount }, (_, i) => (
              <th key={i} scope="col" className="min-w-8 px-1 text-[11px] font-semibold">
                R{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.id} className="group">
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-nowrap rounded-md bg-[#15151e] px-2 py-1 text-left text-[12px] font-semibold text-white/85"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-[2px] shrink-0 rounded-full" style={{ backgroundColor: `#${row.colour}` }} />
                  <span className="truncate">{row.label}</span>
                </span>
              </th>
              {(() => {
                if (mode === "points") {
                  const total =
                    totals?.[row.id] ??
                    (values[r] ?? []).reduce<number>((acc, v) => acc + (v ?? 0), 0);
                  return (
                    <td className="px-2 font-bold tabular-nums text-white">
                      {pointsFmt(total)}
                    </td>
                  );
                }
                const best = (positions[r] ?? []).filter((v): v is number => v != null).sort((a, b) => a - b)[0];
                return (
                  <td className="px-2 font-bold tabular-nums text-white">{best ? `P${best}` : "–"}</td>
                );
              })()}
              {Array.from({ length: roundCount }, (_, i) => {
                const v = values[r]?.[i] ?? null;
                const pos = positions[r]?.[i] ?? null;
                const empty = mode === "points" ? v == null && pos == null : pos == null;
                const style = empty ? null : mode === "points" ? pointsStyle(v ?? 0) : positionStyle(pos);
                return (
                  <td
                    key={i}
                    title={
                      empty
                        ? `${row.label} · Round ${i + 1}: no entry`
                        : `${row.label} · Round ${i + 1}: ${pos ? `P${pos}` : "no finish"}${mode === "points" ? ` · ${v ?? 0} pts` : ""}`
                    }
                    className="h-8 min-w-8 rounded-md text-center font-bold tabular-nums"
                    style={style ?? { background: "rgba(255,255,255,0.025)", color: "rgba(255,255,255,0.22)" }}
                  >
                    {empty ? "–" : mode === "points" ? pointsFmt(v ?? 0) : pos ? `P${pos}` : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatrixLegend({ note }: { note: string }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/35">
      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-[#facc15]" />P1</span>
      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-[#cbd5e1]" />P2–P3</span>
      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-[#2563eb]" />P4–P10</span>
      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-[#450a0a]" />P11+</span>
      <span className="hidden sm:inline">{note}</span>
    </div>
  );
}
