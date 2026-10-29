"use client";

import { useId, useRef, type ReactNode } from "react";
import { downloadNodeAsImage } from "@/components/f1/snapshot";
import { DriverAvatar, TeamMark } from "@/components/f1/TeamLogo";
import type { StandingRow } from "@/lib/standings";

// ------------------------------- formatting --------------------------------

/** F1 points are whole numbers except half points (e.g. Spa 2021). */
export function pointsFmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "−123" behind the leader; a tie is "0" (the leader cell shows the dash). */
export function gapFmt(gap: number): string {
  if (!Number.isFinite(gap)) return "—";
  if (gap === 0) return "0";
  const v = Math.abs(gap);
  return `${gap < 0 ? "−" : "+"}${Number.isInteger(v) ? v : v.toFixed(1)}`;
}

export function signedFmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

export function pctFmt(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function avgFmt(value: number | null): string {
  return value == null ? "—" : value.toFixed(1);
}

/** Surname only, like the reference tables (the team mark carries the rest). */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

const TEAM_CODES: Record<string, string> = {
  Mercedes: "MER",
  Ferrari: "FER",
  "Red Bull Racing": "RBR",
  McLaren: "MCL",
  "Aston Martin": "AST",
  Alpine: "ALP",
  Williams: "WIL",
  "Racing Bulls": "VRB",
  "Haas F1 Team": "HAA",
  Audi: "AUD",
  Cadillac: "CAD",
  Sauber: "SAU",
};

/** Three-letter constructor label for the stats charts. */
export function teamCode(name: string): string {
  return TEAM_CODES[name] ?? name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

// --------------------------------- atoms -----------------------------------

export { TeamMark };

/** ▲2 / ▼1 / — movement since the previous round. */
export function Change({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[11px] text-white/25" aria-label="No previous round">—</span>;
  }
  if (value === 0) {
    return <span className="text-[11px] text-white/30" aria-label="No change">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
        value > 0 ? "text-[#34d399]" : "text-[#f87171]"
      }`}
      aria-label={`${Math.abs(value)} place${Math.abs(value) === 1 ? "" : "s"} ${value > 0 ? "gained" : "lost"}`}
    >
      <span aria-hidden="true">{value > 0 ? "▲" : "▼"}</span>
      {Math.abs(value)}
    </span>
  );
}

// -------------------------------- surfaces ---------------------------------

export function Panel({
  title,
  subtitle,
  meta,
  children,
  className = "",
  exportName,
  headingLevel = 4,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Value supplied makes the panel exportable, matching the reference. */
  exportName?: string;
  headingLevel?: 3 | 4;
}) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const Heading = `h${headingLevel}` as "h3" | "h4";
  return (
    <section
      ref={ref}
      aria-labelledby={id}
      className={`f1-card min-w-0 rounded-xl p-4 md:p-5 ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="order-1 min-w-0 flex-1">
          <Heading
            id={id}
            className="text-balance font-f1 text-[14px] font-bold uppercase leading-[1.15] tracking-[0.055em] text-white md:text-[15px]"
          >
            {title}
          </Heading>
          {subtitle && <p className="mt-1.5 text-[11px] leading-snug text-white/40">{subtitle}</p>}
        </div>
        {meta && (
          <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:order-2 sm:w-auto sm:justify-end">
            {meta}
          </div>
        )}
        <div className="order-2 shrink-0 sm:order-3">
          {exportName && (
            <button
              type="button"
              onClick={() => {
                if (ref.current) downloadNodeAsImage(ref.current, exportName);
              }}
              title="Download as image"
              aria-label={`Download ${title} as image`}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 text-white/60 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e10600]/60 disabled:cursor-wait disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

// -------------------------------- controls ---------------------------------

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex min-w-0 rounded-lg bg-black/25 p-0.5"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`relative flex items-center justify-center rounded-md px-3 py-1.5 text-[12px] font-medium leading-none transition-colors ${
              active ? "text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-0 z-0 rounded-md bg-gradient-to-r from-[#e10600] to-[#ff2b1f] transition-opacity duration-200 ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
            <span className="relative z-[1]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Selector({
  label,
  value,
  onChange,
  children,
  disabled,
  compact,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Hide the visible label on phones (the select keeps its aria-label). */
  compact?: boolean;
}) {
  return (
    <label className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
      {!compact && <span>{label}</span>}
      <span className="relative inline-flex items-center">
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 appearance-none rounded-md bg-gradient-to-r from-[#e10600] to-[#ff2b1f] pl-3 pr-8 font-f1 text-[11px] font-bold tracking-normal text-white outline-none transition-colors duration-200 hover:from-[#c00500] hover:to-[#e0201a] focus-visible:ring-2 focus-visible:ring-[#e10600]/40 disabled:cursor-wait disabled:opacity-60"
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute right-2 h-4 w-4 text-white/80"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}

// --------------------------------- table -----------------------------------

export function StandingsTable({
  rows,
  variant,
  season,
}: {
  rows: StandingRow[];
  variant: "driver" | "constructor";
  season: number;
}) {
  return (
    <div className="min-w-0">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">
          {season} Formula 1 {variant === "driver" ? "Drivers'" : "Constructors'"} Championship standings. Evo. is
          the gap to the championship leader.
        </caption>
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.025em] text-white/50">
            <th scope="col" className="w-9 py-2 pl-0.5 text-left">Pos.</th>
            <th scope="col" className="py-2">{variant === "driver" ? "Driver" : "Constructor"}</th>
            <th scope="col" className="w-12 py-2 text-right">Points</th>
            <th scope="col" className="w-12 py-2 pr-0.5 text-right">Evo.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="h-[43px] border-t border-white/[0.08] transition-colors hover:bg-white/[0.04]"
            >
              <td className="py-2 pl-0.5 text-[12px] font-semibold tabular-nums text-white/85">
                {row.position || "–"}
              </td>
              <td className="min-w-0 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  {variant === "constructor" ? (
                    <TeamMark team={row.teamName} size={20} tone="mono" />
                  ) : (
                    <DriverAvatar
                      name={row.name}
                      colour={`#${row.colour}`}
                      headshotUrl={row.headshotUrl}
                      size={28}
                    />
                  )}
                  <span className="min-w-0 truncate text-[12.5px] font-semibold text-white" title={row.name}>
                    {variant === "driver" ? surname(row.name) : row.name}
                  </span>
                </div>
              </td>
              <td className="py-2 text-right align-middle">
                <span className="font-f1 text-[13px] font-bold leading-none tabular-nums text-white">
                  {pointsFmt(row.points)}
                </span>
              </td>
              <td className="py-2 pr-0.5 text-right align-middle">
                {row.position === 1 ? (
                  <span className="text-[11px] text-white/25" aria-label="Championship leader">–</span>
                ) : (
                  <span
                    className="inline-flex items-center justify-end gap-0.5 text-[11px] tabular-nums text-white/45"
                    aria-label={`${pointsFmt(Math.abs(row.gap))} points behind the leader`}
                  >
                    <span aria-hidden="true" className="text-[#f87171]">↓</span>
                    {pointsFmt(Math.abs(row.gap))}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------- states ----------------------------------

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[120px] place-items-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-[12px] text-white/45">
      {children}
    </div>
  );
}

export function MiniStat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className="mt-1 font-f1 text-xl font-bold leading-none text-white tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-white/35">{hint}</p>}
    </div>
  );
}
