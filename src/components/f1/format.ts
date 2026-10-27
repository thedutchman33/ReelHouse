/** Time/tick formatters ported verbatim from GP-Tempo (their `nv`, `NH`,
 *  `v1`, `w1`). All are pure functions served on both F1 centres. */

/** nv — lap time `m:ss.mmm`. */
export function lapFmtF(s: number): string {
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(3).padStart(6, "0");
  return `${m}:${rest}`;
}

/** NH — axis tick `m:ss` (padded seconds, integer). */
export function axisSecF(s: number): string {
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(0).padStart(2, "0");
  return `${m}:${rest}`;
}

/** v1 — clock tick `h:MM AM/PM` (uppercase, browser locale). */
export function clockF(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toUpperCase();
}

/** w1 — playback clock `m:ss.s` (padded to 4 chars). */
export function playClockF(s: number): string {
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${rest}`;
}

/** Delta display: signed seconds with 3 decimals, e.g. `+0.124 s`. */
export function deltaFmt(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(3)} s`;
}
