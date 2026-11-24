export interface LyricLine {
  time: number;
  text: string;
}

const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** Parse an LRC document into ordered, timestamped lines. */
export function parseLrc(input: string | null | undefined): LyricLine[] {
  if (!input) return [];
  const lines: LyricLine[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const stamps = Array.from(rawLine.matchAll(STAMP));
    if (stamps.length === 0) continue;
    const text = rawLine.replace(STAMP, "").trim();
    if (!text) continue;
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fraction = stamp[3] ?? "0";
      const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));
      const time = minutes * 60 + seconds + milliseconds / 1000;
      if (Number.isFinite(time)) lines.push({ time, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line currently being sung, or -1 before the first line. */
export function activeLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0 || !Number.isFinite(currentTime)) return -1;
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].time <= currentTime) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}
