import "server-only";

import type { MatchFormat } from "../types";

// ---------------------------------------------------------------------------
// Announced tour squads.
//
// BCCI publishes the playing XI in its scorecard feed only after the toss, and
// its CMS squad endpoint covers India alone. The announced squads for a
// bilateral tour are, however, tabulated on the tour's Wikipedia article, with
// each board's announcement cited as the source. This module reads that one
// table: the format columns (Tests / ODIs / T20Is) for both teams. It never
// guesses a list — a page without the table, or a column without names, comes
// back empty so the page can say the squad is not published yet.
// ---------------------------------------------------------------------------

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const REVALIDATE_SECONDS = 6 * 60 * 60;

export interface TourSquadPlayer {
  name: string;
  captain: boolean;
  viceCaptain: boolean;
  wicketkeeper: boolean;
}

export interface TourSquad {
  /** Wikipedia's country code for the team, e.g. IND, NZ. */
  teamCode: string;
  format: MatchFormat;
  players: TourSquadPlayer[];
}

const TEAM_BY_CODE: Record<string, string> = {
  IND: "India",
  NZ: "New Zealand",
  AUS: "Australia",
  ENG: "England",
  SA: "South Africa",
  PAK: "Pakistan",
  SL: "Sri Lanka",
  BAN: "Bangladesh",
  WI: "West Indies",
  AFG: "Afghanistan",
  ZIM: "Zimbabwe",
  IRE: "Ireland",
  SCO: "Scotland",
  NED: "Netherlands",
  NEP: "Nepal",
  UAE: "United Arab Emirates",
  OMA: "Oman",
  USA: "United States of America",
  NAM: "Namibia",
  PNG: "Papua New Guinea",
  HK: "Hong Kong",
};

const FORMAT_BY_LABEL: Record<string, MatchFormat> = {
  test: "Test",
  tests: "Test",
  odi: "ODI",
  odis: "ODI",
  t20i: "T20I",
  t20is: "T20I",
};

function stripMarkup(value: string): string {
  return value
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/\{\{Efn\|[\s\S]*?\}\}/gi, "")
    .replace(/\{\{efn\|[\s\S]*?\}\}/gi, "")
    .replace(/\{\{[^{}]*\}\}/g, "");
}

/** Wiki markup for a bullet list → the announced players on that line. */
function parsePlayerLine(line: string): TourSquadPlayer | null {
  const body = stripMarkup(line).trim();
  if (!body.startsWith("*")) return null;
  // A struck-through name is a withdrawal, not part of the squad.
  if (/<s>|<del>/i.test(line)) return null;
  const link = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(body);
  const raw = (link?.[2] ?? link?.[1] ?? body.replace(/^\*+\s*/, "")).trim();
  const name = raw.replace(/\s*\((?:c|vc|wk|captain|vice-captain|wicket-keeper)\)\s*$/i, "").trim();
  if (!name || !/[a-z]/i.test(name)) return null;
  // Unwrap piped links so "([[Captain (cricket)#Vice-captain|vc]])" becomes
  // "(vc)". Without this a vice-captain reads as a captain.
  const marker = body
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1");
  const viceCaptain = /\(\s*(?:vice-captain|vc)\s*\)/i.test(marker);
  const captain = !viceCaptain && /\(\s*(?:captain|c)\s*\)/i.test(marker);
  const wicketkeeper = /\(\s*(?:wicket-?keeper|wk)\s*\)/i.test(marker);
  return { name, captain, viceCaptain, wicketkeeper };
}

/**
 * Reads the squads table from a tour article's wikitext. The table is laid out
 * as two `{{cr|XXX}}` groups, three format columns each, followed by one row of
 * bullet lists in the same column order.
 */
export function parseTourSquads(wikitext: string): TourSquad[] {
  const section = /==+\s*Squads?\s*==+([\s\S]*?)(?=\n==[^=]|$)/i.exec(wikitext)?.[1];
  if (!section) return [];
  const table = /\{\|[\s\S]*?\n\|\}/.exec(section)?.[0];
  if (!table) return [];
  const rows = table.split(/\n\|-/);
  if (rows.length < 4) return [];

  // Team header: one template per group, with colspan telling us how many
  // format columns belong to it ("Tests", "ODIs", "T20Is").
  const groups = [...rows[1].matchAll(/\{\{cr\|([A-Za-z]{2,4})[^}]*\}\}/g)].map(
    (match) => match[1].toUpperCase()
  );
  if (groups.length === 0) return [];
  const spans = [...rows[1].matchAll(/colspan\s*=\s*"?(\d+)"?/gi)].map((match) =>
    Number(match[1])
  );
  const slots: string[] = [];
  groups.forEach((code, index) => {
    const span = spans[index] ?? Math.floor(6 / groups.length);
    for (let column = 0; column < span; column += 1) slots.push(code);
  });

  const formats = rows[2]
    .split(/\n!/)
    .slice(1)
    .map((cell) => stripMarkup(cell).trim().toLowerCase());

  const lists = rows[3].split(/\n\|/).slice(1);
  const squads: TourSquad[] = [];
  slots.forEach((code, index) => {
    const format = FORMAT_BY_LABEL[formats[index] ?? ""];
    if (!format) return;
    const players = (lists[index] ?? "")
      .split("\n")
      .map(parsePlayerLine)
      .filter((player): player is TourSquadPlayer => Boolean(player));
    if (players.length > 0) squads.push({ teamCode: code, format, players });
  });
  return squads;
}

export function squadTeamName(code: string): string | null {
  return TEAM_BY_CODE[code.toUpperCase()] ?? null;
}

export function tourSeason(dateISO: string): string {
  const date = new Date(dateISO);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return `${start}\u2013${String(start + 1).slice(-2)}`;
}

async function wikiJson<T>(params: Record<string, string>): Promise<T | null> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  try {
    const response = await fetch(`${WIKI_API}?${query}`, {
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Finds the tour article for the two teams and season. */
async function resolveTourPage(home: string, away: string, season: string): Promise<string | null> {
  const searches = [`${away} cricket team in ${home} ${season}`, `${home} cricket team in ${away} ${season}`];
  for (const search of searches) {
    const result = await wikiJson<{ query?: { search?: { title?: string }[] } }>({
      action: "query",
      list: "search",
      srlimit: "5",
      srsearch: search,
    });
    const title = (result?.query?.search ?? [])
      .map((row) => row.title ?? "")
      .find((candidate) => /cricket team in .+ in \d{4}/i.test(candidate));
    if (title) return title;
  }
  return null;
}

const cache = new Map<string, { at: number; squads: TourSquad[] }>();
const CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;

/**
 * The announced squads for a tour, or an empty list when the article or its
 * squads table is unavailable.
 */
export async function fetchTourSquads({
  home,
  away,
  date,
}: {
  home: string;
  away: string;
  date: string;
}): Promise<TourSquad[]> {
  if (!home || !away) return [];
  const season = tourSeason(date);
  const cached = cache.get(`${home}|${away}|${season}`);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.squads;

  const title = await resolveTourPage(home, away, season);
  if (!title) return [];

  const page = await wikiJson<{ parse?: { wikitext?: string } }>({
    action: "parse",
    page: title,
    prop: "wikitext",
    redirects: "1",
  });
  const squads = parseTourSquads(page?.parse?.wikitext ?? "");
  if (squads.length > 0) cache.set(`${home}|${away}|${season}`, { at: Date.now(), squads });
  return squads;
}
