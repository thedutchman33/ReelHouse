// Minimal WebVTT parser for the custom subtitle overlay.
//
// The player renders captions itself (rather than relying on a native <track>)
// so appearance settings — font size, color, background blur, timing latency —
// can be applied with full control and positioned above the custom controls.
// This handles the small subset of VTT we ship: optional cue ids, HH:MM:SS.mmm
// or MM:SS.mmm timestamps, and multi-line plain-text cues.

export interface Cue {
  start: number; // seconds
  end: number; // seconds
  text: string; // may contain "\n"
}

function parseTimestamp(raw: string): number | null {
  // Accept "HH:MM:SS.mmm" or "MM:SS.mmm".
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(raw.trim());
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function parseVtt(input: string): Cue[] {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n\n+/);
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    // Skip the file header and NOTE/STYLE/REGION blocks.
    if (/^WEBVTT/.test(lines[0]) || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;

    // A cue may lead with an id line before the "start --> end" timing line.
    let timingIndex = lines.findIndex((l) => l.includes("-->"));
    if (timingIndex === -1) continue;

    const [startRaw, endRaw] = lines[timingIndex].split("-->");
    const start = parseTimestamp(startRaw ?? "");
    const end = parseTimestamp((endRaw ?? "").split(/\s+/)[0] ?? "");
    if (start == null || end == null) continue;

    const body = lines
      .slice(timingIndex + 1)
      .join("\n")
      // strip simple inline tags (<b>, <i>, <c.classname>, <00:00:00.000>)
      .replace(/<[^>]+>/g, "")
      .trim();
    if (body) cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** Return the active cue text for a time (with a latency offset), or null. */
export function activeCue(cues: Cue[], time: number, latency = 0): string | null {
  const t = time - latency;
  for (const cue of cues) {
    if (t >= cue.start && t <= cue.end) return cue.text;
  }
  return null;
}
