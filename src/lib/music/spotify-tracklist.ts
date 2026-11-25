// Tracklist readers for native Reelhouse imports. A user may provide the
// playlist's own metadata as JSON, CSV or pasted "Song Title - Artist Name"
// lines. Nothing here talks to Spotify: parsing is local, pure and testable.

export interface ParsedTracklistEntry {
  name: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  spotifyTrackId?: string;
}

export interface ParsedTracklist {
  entries: ParsedTracklistEntry[];
  /** Entries skipped because the same title + artist already appeared. */
  duplicates: number;
  warnings: string[];
  playlistName?: string;
  playlistDescription?: string;
}

const EMPTY: ParsedTracklist = { entries: [], duplicates: 0, warnings: [] };

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const found = text(value);
    if (found) return found;
  }
  return undefined;
}

function artistList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\s*(?:,|;|&|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        out.push(...artistList(item));
      } else if (item && typeof item === "object") {
        const name = firstText(
          (item as Record<string, unknown>).name,
          (item as Record<string, unknown>).artistName
        );
        if (name) out.push(name);
      }
    }
    return out;
  }
  if (value && typeof value === "object") {
    const name = firstText(
      (value as Record<string, unknown>).name,
      (value as Record<string, unknown>).artistName
    );
    return name ? [name] : [];
  }
  return [];
}

function durationMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Spotify API exports use milliseconds; hand-written files often use
    // seconds. Values below 1000 seconds are unambiguous for a song.
    return value < 1_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (clock) {
      const first = Number(clock[1]);
      const second = Number(clock[2]);
      const third = clock[3] === undefined ? undefined : Number(clock[3]);
      const seconds = third === undefined ? first * 60 + second : first * 3600 + second * 60 + third;
      return seconds > 0 ? seconds * 1000 : undefined;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return durationMs(numeric);
  }
  return undefined;
}

function spotifyId(...values: unknown[]): string | undefined {
  for (const value of values) {
    const raw = text(value);
    if (!raw) continue;
    const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(raw);
    if (uri) return uri[1];
    if (/^[A-Za-z0-9]{22}$/.test(raw)) return raw;
  }
  return undefined;
}

function entryFromObject(raw: unknown): ParsedTracklistEntry | null {
  if (typeof raw === "string") return entryFromLine(raw);
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  // Spotify account-data exports wrap each entry in { track: {...} }.
  const nested =
    item.track && typeof item.track === "object"
      ? (item.track as Record<string, unknown>)
      : undefined;

  const name = firstText(
    nested?.name,
    nested?.trackName,
    item.name,
    item.title,
    item.trackName
  );
  if (!name) return null;

  const artists = artistList(
    nested?.artists ??
      nested?.artistName ??
      nested?.artist ??
      item.artists ??
      item.artistName ??
      item.artist
  );

  const album = firstText(
    nested?.album && typeof nested.album === "object"
      ? (nested.album as Record<string, unknown>).name
      : nested?.album,
    nested?.albumName,
    item.album && typeof item.album === "object"
      ? (item.album as Record<string, unknown>).name
      : item.album,
    item.albumName
  );

  return {
    name: name.slice(0, 300),
    artists: artists.map((artist) => artist.slice(0, 160)).slice(0, 8),
    album: album?.slice(0, 300),
    durationMs: durationMs(
      nested?.duration_ms ?? nested?.durationMs ?? nested?.duration ?? item.duration_ms ?? item.durationMs ?? item.duration
    ),
    spotifyTrackId: spotifyId(
      nested?.id,
      nested?.spotifyTrackId,
      item.spotifyTrackId,
      item.trackId,
      nested?.uri,
      item.spotifyUri,
      item.uri
    ),
  };
}

function entryFromLine(rawLine: string): ParsedTracklistEntry | null {
  let line = rawLine.replace(/\u00a0/g, " ").trim();
  if (!line || line.startsWith("#")) return null;
  // Common numbered-list forms: "1. Song", "01 - Song", "1) Song".
  line = line.replace(/^\d{1,3}[.)]\s*/, "").trim();
  line = line.replace(/^\d{1,3}\s+[-–—]\s+/, "").trim();
  if (!line) return null;

  const parts = line.split(/\s+[-–—]\s+/);
  const name = (parts.shift() ?? "").trim();
  if (!name) return null;
  const artistText = parts.join(" - ").trim();
  const artists = artistText
    ? artistText
        .split(/\s*(?:,|;|&|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i)
        .map((artist) => artist.trim())
        .filter(Boolean)
    : [];
  return { name: name.slice(0, 300), artists: artists.slice(0, 8) };
}

function dedupe(entries: ParsedTracklistEntry[]): { entries: ParsedTracklistEntry[]; duplicates: number } {
  const seen = new Set<string>();
  const out: ParsedTracklistEntry[] = [];
  let duplicates = 0;
  for (const entry of entries) {
    const key = `${entry.name} ${entry.artists.join(" ")}`
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    out.push(entry);
  }
  return { entries: out, duplicates };
}

export function parseManualTracklist(input: string): ParsedTracklist {
  const entries: ParsedTracklistEntry[] = [];
  let unreadable = 0;
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const entry = entryFromLine(line);
    if (!entry) {
      unreadable += 1;
      continue;
    }
    entries.push(entry);
  }
  const unique = dedupe(entries);
  const warnings: string[] = [];
  if (unreadable > 0) {
    warnings.push(`${unreadable} line${unreadable === 1 ? "" : "s"} could not be read.`);
  }
  if (unique.duplicates > 0) {
    warnings.push(`${unique.duplicates} duplicate entr${unique.duplicates === 1 ? "y was" : "ies were"} skipped.`);
  }
  if (unique.entries.length === 0) {
    warnings.push("No tracks found. Use one entry per line: Song Title - Artist Name.");
  }
  return { entries: unique.entries, duplicates: unique.duplicates, warnings };
}

function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (quoted) {
      if (char === '"' && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /(^|\b)(title|name|track|song)\b/.test(joined) && /(artist|album|duration|length)/.test(joined);
}

export function parseCsvTracklist(input: string): ParsedTracklist {
  const rows = input.split(/\r?\n/).filter((row) => row.trim().length > 0);
  if (rows.length === 0) return { ...EMPTY, warnings: ["The CSV file is empty."] };
  const entries: ParsedTracklistEntry[] = [];
  let nameIndex = 0;
  let artistIndex = 1;
  let albumIndex = 2;
  let durationIndex = 3;
  let start = 0;
  const firstCells = splitCsvRow(rows[0]);
  if (looksLikeHeader(firstCells)) {
    const headers = firstCells.map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ""));
    const find = (names: string[]) => headers.findIndex((header) => names.includes(header));
    nameIndex = find(["title", "name", "track", "trackname", "song", "songtitle"]);
    artistIndex = find(["artist", "artists", "artistname", "artistnames"]);
    albumIndex = find(["album", "albumname"]);
    durationIndex = find(["duration", "durationms", "length", "time"]);
    if (nameIndex < 0) nameIndex = 0;
    start = 1;
  }
  for (let index = start; index < rows.length; index += 1) {
    const cells = splitCsvRow(rows[index]);
    const name = cells[nameIndex]?.trim();
    if (!name) continue;
    entries.push({
      name: name.slice(0, 300),
      artists: artistIndex >= 0 ? artistList(cells[artistIndex] ?? "") : [],
      album: albumIndex >= 0 ? text(cells[albumIndex])?.slice(0, 300) : undefined,
      durationMs: durationIndex >= 0 ? durationMs(cells[durationIndex]) : undefined,
    });
  }
  const unique = dedupe(entries);
  const warnings: string[] = [];
  if (unique.duplicates > 0) {
    warnings.push(`${unique.duplicates} duplicate entr${unique.duplicates === 1 ? "y was" : "ies were"} skipped.`);
  }
  if (unique.entries.length === 0) {
    warnings.push("No usable rows found. Include a title and artist column.");
  }
  return { entries: unique.entries, duplicates: unique.duplicates, warnings };
}

function tracksFromJson(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (Array.isArray(item.tracks)) return item.tracks;
  if (Array.isArray(item.items)) return item.items;
  if (item.tracks && typeof item.tracks === "object") {
    const tracks = item.tracks as Record<string, unknown>;
    if (Array.isArray(tracks.items)) return tracks.items;
  }
  if (item.playlist && typeof item.playlist === "object") {
    return tracksFromJson(item.playlist);
  }
  // Spotify account-data playlist export.
  if (Array.isArray(item.playlists)) {
    const first = item.playlists[0];
    return first ? tracksFromJson(first) : null;
  }
  if (Array.isArray(item.entries)) return item.entries;
  return null;
}

function playlistMeta(value: unknown): { name?: string; description?: string } {
  if (!value || typeof value !== "object") return {};
  const item = value as Record<string, unknown>;
  const source =
    item.playlist && typeof item.playlist === "object"
      ? (item.playlist as Record<string, unknown>)
      : item;
  return {
    name: firstText(source.name, source.title, source.playlistName)?.slice(0, 120),
    description: firstText(source.description, source.playlistDescription)?.slice(0, 500),
  };
}

export function parseJsonTracklist(input: string): ParsedTracklist {
  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    return { ...EMPTY, warnings: ["That JSON file is not valid JSON."] };
  }
  let items = tracksFromJson(payload);
  if (!items && payload && typeof payload === "object") {
    const playlists = (payload as Record<string, unknown>).playlists;
    if (Array.isArray(playlists) && playlists.length > 1) {
      return {
        ...EMPTY,
        warnings: [
          "This JSON contains several playlists. Upload one playlist's JSON file, or use the account ZIP import.",
        ],
      };
    }
  }
  if (!items) {
    return { ...EMPTY, warnings: ["No tracks array was found in that JSON file."] };
  }
  const entries: ParsedTracklistEntry[] = [];
  for (const raw of items) {
    const entry = entryFromObject(raw);
    if (entry) entries.push(entry);
  }
  const unique = dedupe(entries);
  const meta = playlistMeta(payload);
  const warnings: string[] = [];
  if (unique.duplicates > 0) {
    warnings.push(`${unique.duplicates} duplicate entr${unique.duplicates === 1 ? "y was" : "ies were"} skipped.`);
  }
  if (unique.entries.length === 0) {
    warnings.push("No tracks with a title were found in that JSON file.");
  }
  return {
    entries: unique.entries,
    duplicates: unique.duplicates,
    warnings,
    playlistName: meta.name,
    playlistDescription: meta.description,
  };
}

export function parseTracklistFile(name: string, content: string): ParsedTracklist {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return parseJsonTracklist(content);
  if (lower.endsWith(".csv")) return parseCsvTracklist(content);
  if (lower.endsWith(".txt")) return parseManualTracklist(content);
  // Sniff the content when the extension is missing or unfamiliar.
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonTracklist(content);
  if (trimmed.includes(",") && trimmed.includes("\n")) return parseCsvTracklist(content);
  return parseManualTracklist(content);
}

export const TRACKLIST_FILE_ACCEPT = ".json,.csv,.txt,application/json,text/csv,text/plain";
