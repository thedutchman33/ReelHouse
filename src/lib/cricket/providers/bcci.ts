import "server-only";

import type {
  CricketMatch,
  CricketPlayer,
  CricketTeam,
  Gender,
  MatchFormat,
  MatchStatus,
  PlayerFacts,
  ScorecardData,
  ScorecardInnings,
  ScorecardTeam,
} from "../types";

// ---------------------------------------------------------------------------
// BCCI's public web feeds.
//
// bcci.tv exposes the same JSON its own match centre reads through a
// same-origin proxy: /api/bff/feed/v1/* for fixtures, live scores and
// scorecards, and /api/bff/cms/* for the player directory. No key is needed.
// The pages are read as the BCCI website itself reads them; nothing is
// invented when a field is missing.
// ---------------------------------------------------------------------------

export const BCCI_WEB = "https://www.bcci.tv";
const FEED = `${BCCI_WEB}/api/bff/feed/v1`;
const CMS = `${BCCI_WEB}/api/bff/cms`;

const LIVE_REVALIDATE_SECONDS = 30;
const FIXTURES_REVALIDATE_SECONDS = 60;
const RESULTS_REVALIDATE_SECONDS = 5 * 60;
const SCORECARD_REVALIDATE_SECONDS = 2 * 60;
const PLAYERS_REVALIDATE_SECONDS = 12 * 60 * 60;

interface BffEnvelope<T> {
  status?: number;
  data?: T;
  error?: unknown;
}

export interface BffTeam {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  score?: string | null;
  scores?: {
    inningsNumber: number;
    score: string;
    overs: string;
    isBatting?: boolean;
  }[];
}

export interface BffMatch {
  id: string;
  gid: string;
  groundId?: string | null;
  competitionId?: string;
  competitionName: string;
  competitionLabel?: string;
  name: string;
  title: string;
  matchNumberLabel?: string;
  status: string;
  statusLabel: string;
  liveStatusId?: number;
  liveStatusName?: string;
  showLiveIndicator?: boolean;
  subStatusLabel?: string;
  resultString: string;
  startDateTimeUtc: string;
  endDate?: string | null;
  dateString?: string;
  groundName: string;
  groundLocation?: string | null;
  groundShortName?: string;
  formatLabel: string;
  seasonLabel?: string;
  teams: BffTeam[];
}

interface BffMatchList {
  matches?: BffMatch[];
  meta?: { page?: number; hasMore?: boolean; totalPages?: number; totalMatches?: number };
}

export interface BffPlayer {
  playerGid: string;
  playerId?: number | string | null;
  name: string;
  slug: string;
  role: string;
  gender: string;
  grade: string | null;
  style: string | null;
  status: string;
  imageUrl: string | null;
  imageUrlSet?: {
    small?: string;
    medium?: string;
    large?: string;
    xlarge?: string;
  };
}

interface BffDirectory {
  players?: BffPlayer[];
}

export interface BffLive {
  matches?: BffMatch[];
}

async function bffFetch<T>(url: string, revalidate: number): Promise<T> {
  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate },
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US",
      Origin: BCCI_WEB,
      Referer: `${BCCI_WEB}/matches`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`BCCI feed returned ${response.status}`);
  const body = (await response.json()) as BffEnvelope<T>;
  if (body?.data == null) throw new Error("BCCI feed returned no data");
  return body.data;
}

/** The two India sides the page follows. */
function indiaTeamParam(gender: Gender): string {
  return gender === "women" ? "india-women" : "india";
}

function isIndiaName(name: string, gender: Gender): boolean {
  const normalized = name.trim().toLowerCase();
  return gender === "women" ? normalized === "india women" : normalized === "india";
}

function formatOf(label: string): MatchFormat | null {
  const value = label.replace(/^women'?s\s+/i, "").trim();
  if (/^test$/i.test(value)) return "Test";
  if (/^odi$/i.test(value) || /one.?day/i.test(value)) return "ODI";
  if (/^t20i?$/i.test(value)) return "T20I";
  return null;
}

function teamColour(value: string | undefined): string {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : "#30425f";
}

function scoreOf(team: BffTeam): string | null {
  if (team.score) return team.score;
  if (!team.scores?.length) return null;
  return team.scores.map((entry) => entry.score).filter(Boolean).join(" & ") || null;
}

function mapTeam(team: BffTeam): CricketTeam {
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName || team.name,
    abbreviation: team.abbreviation || team.shortName || team.name.slice(0, 3).toUpperCase(),
    primary: teamColour(team.primaryColor),
    secondary: teamColour(team.secondaryColor),
    score: scoreOf(team),
    scores: (team.scores ?? []).map((entry) => ({
      inningsNumber: entry.inningsNumber,
      score: entry.score,
      overs: entry.overs,
      isBatting: Boolean(entry.isBatting),
    })),
  };
}

/**
 * Maps one BCCI card to the page's model. The BCCI live list uses the same
 * card shape as the fixture list, so one mapper serves both.
 */
export function normalizeBcciMatch(
  raw: BffMatch,
  gender: Gender,
  liveGids: Set<string> = new Set()
): CricketMatch | null {
  const format = formatOf(raw.formatLabel);
  if (!format) return null;
  if (!raw.teams?.some((team) => isIndiaName(team.name, gender))) return null;

  const status: MatchStatus =
    liveGids.has(raw.gid) || raw.showLiveIndicator || raw.status === "live"
      ? "live"
      : raw.status === "results" || raw.status === "completed"
        ? "completed"
        : "upcoming";

  return {
    id: raw.id,
    gid: raw.gid,
    groundId: raw.groundId ?? null,
    gender,
    format,
    formatLabel: raw.formatLabel,
    date: raw.startDateTimeUtc,
    endDate: raw.endDate ?? null,
    series: raw.competitionName || raw.competitionLabel || "International",
    title: raw.matchNumberLabel || raw.title || raw.competitionName || "Match",
    matchNumber: raw.matchNumberLabel || raw.title || raw.competitionName || "Match",
    venue: raw.groundName,
    city: raw.groundLocation ?? raw.groundShortName ?? null,
    status,
    statusLabel: raw.statusLabel || (status === "live" ? "Live" : status === "completed" ? "Result" : "Fixture"),
    result: raw.resultString || null,
    teams: raw.teams.map(mapTeam),
    live: status === "live",
  };
}

/** Fetches every page of a current/next-year fixture or result list. */
export async function fetchBcciMatches(
  gender: Gender,
  status: "fixtures" | "results",
  season: number
): Promise<BffMatch[]> {
  const rows: BffMatch[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const query = new URLSearchParams({
      status,
      class: "international",
      season: String(season),
      gender,
      teams: indiaTeamParam(gender),
      page: String(page),
    });
    const data = await bffFetch<BffMatchList>(`${FEED}/matches/list?${query.toString()}`, status === "fixtures" ? FIXTURES_REVALIDATE_SECONDS : RESULTS_REVALIDATE_SECONDS);
    rows.push(...(data.matches ?? []));
    if (!data.meta?.hasMore) break;
  }
  return rows;
}

/** Every live match BCCI is currently publishing, across all competitions. */
export async function fetchBcciLive(): Promise<BffMatch[]> {
  const data = await bffFetch<BffLive>(`${FEED}/matches/live`, LIVE_REVALIDATE_SECONDS);
  return data.matches ?? [];
}

interface RawScorecardTeam {
  id: string;
  name: string;
  shortName?: string;
  abbreviation?: string;
  primaryColor?: string;
  secondaryColor?: string;
  score?: string | null;
  scores?: CricketTeam["scores"];
}

type RawScorecard = Omit<ScorecardData, "match" | "details" | "innings"> & {
  match: Omit<ScorecardData["match"], "teams"> & { teams?: RawScorecardTeam[] };
  details?: Partial<ScorecardData["details"]>;
  innings?: ScorecardInnings[];
};

/** The display-ready scorecard for one match. */
export async function fetchBcciScorecard(gid: string): Promise<ScorecardData> {
  const raw = await bffFetch<RawScorecard>(`${FEED}/matches/${encodeURIComponent(gid)}/scorecard`, SCORECARD_REVALIDATE_SECONDS);
  return normalizeScorecard(raw);
}

function normalizeScorecardTeam(team: RawScorecardTeam): ScorecardTeam {
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName || team.name,
    abbreviation: team.abbreviation || team.name.slice(0, 3).toUpperCase(),
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    score: team.score ?? null,
    scores: team.scores,
  };
}

function normalizeInnings(innings: ScorecardInnings): ScorecardInnings {
  return {
    ...innings,
    battingRows: innings.battingRows ?? [],
    didNotBat: innings.didNotBat ?? [],
    bowlingRows: innings.bowlingRows ?? [],
    fallOfWickets: innings.fallOfWickets ?? [],
    extras: innings.extras ?? { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalties: 0, total: 0 },
    target: innings.target && innings.target !== "0" ? innings.target : null,
  };
}

function normalizeScorecard(raw: RawScorecard): ScorecardData {
  return {
    ...raw,
    match: {
      ...raw.match,
      teams: (raw.match.teams ?? []).map(normalizeScorecardTeam),
    },
    details: {
      competitionLabel: raw.details?.competitionLabel ?? raw.match.competitionLabel,
      competitionSeason: raw.details?.competitionSeason ?? "",
      dateString: raw.details?.dateString ?? raw.match.dateString,
      startDateTimeUtc: raw.details?.startDateTimeUtc ?? raw.match.startDateTimeUtc,
      venueLabel: raw.details?.venueLabel ?? raw.match.venueLabel,
      venueTimeZone: raw.details?.venueTimeZone ?? "",
      tossLabel: raw.details?.tossLabel || "Toss not published",
      officials: raw.details?.officials ?? [],
      playerOfTheMatch: raw.details?.playerOfTheMatch ?? null,
    },
    innings: (raw.innings ?? []).map(normalizeInnings),
  };
}

function roleOf(value: string): string {
  const role = value.trim().toLowerCase();
  if (role.includes("wicket")) return "Wicketkeeper Batter";
  if (role.includes("all")) return "All-rounder";
  if (role.includes("bowl")) return "Bowler";
  if (role.includes("bat")) return "Batter";
  return value;
}

function gradeOf(value: string | null): string | null {
  const match = value?.match(/\b([A-D])\b/);
  return match ? match[1] : null;
}

/**
 * BCCI's directory wraps portraits in Next's image optimiser, e.g.
 * /_next/image?url=%2Fapi%2Fteam-assets%3Fpathname%3Dsquad%252F65346.png...&w=384
 * That URL is malformed for the optimiser (the inner &brand is not escaped),
 * so it answers 400 in the browser. The underlying team-assets endpoint serves
 * the original portrait and is what we store instead.
 */
export function normalizeBcciImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, BCCI_WEB);
  } catch {
    return null;
  }
  const inner =
    parsed.pathname === "/_next/image"
      ? parsed.searchParams.get("url")
      : parsed.origin === BCCI_WEB && parsed.pathname === "/api/team-assets"
        ? `${parsed.pathname}${parsed.search}`
        : null;
  if (inner) {
    try {
      const asset = new URL(inner, BCCI_WEB);
      // Re-encode the nested URL as one parameter; BCCI's own wrapper leaves
      // the inner &brand unescaped, which makes its optimiser answer 400. SVG
      // fallbacks are also rejected there, so the avatar keeps its initials.
      return `${BCCI_WEB}/_next/image?url=${encodeURIComponent(
        `${asset.pathname}${asset.search}`
      )}&w=384&q=75`;
    } catch {
      return null;
    }
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
}

export function normalizeBcciPlayer(raw: BffPlayer): CricketPlayer | null {
  if (!raw?.playerGid || !raw.name) return null;
  return {
    id: raw.playerGid,
    playerId:
      typeof raw.playerId === "number"
        ? raw.playerId
        : typeof raw.playerId === "string" && /^\d+$/.test(raw.playerId)
          ? Number(raw.playerId)
          : null,
    name: raw.name,
    slug: raw.slug || raw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    gender: raw.gender === "women" ? "women" : "men",
    role: roleOf(raw.role || "Player"),
    grade: gradeOf(raw.grade),
    style: raw.style || null,
    imageUrl: normalizeBcciImageUrl(raw.imageUrlSet?.small || raw.imageUrl),
    active: raw.status === "active",
  };
}

export async function fetchBcciPlayers(gender: Gender): Promise<CricketPlayer[]> {
  const query = new URLSearchParams({ limit: "100", gender });
  const data = await bffFetch<BffDirectory>(`${CMS}/players-directory?${query.toString()}`, PLAYERS_REVALIDATE_SECONDS);
  return (data.players ?? [])
    .map(normalizeBcciPlayer)
    .filter((player): player is CricketPlayer => Boolean(player));
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads the server-rendered profile fact list (role, born, styles, debut).
 * Exported as a pure parser so the BCCI HTML contract is testable.
 */
export function parseBcciPlayerFacts(html: string): PlayerFacts | null {
  if (!html) return null;
  const block = /<dl[^>]*data-testid="player-profile-facts"[^>]*>([\s\S]*?)<\/dl>/.exec(html);
  if (!block) return null;
  const facts: Record<string, string> = {};
  for (const match of block[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const key = decodeHtml(match[1]).toLowerCase();
    const value = decodeHtml(match[2]);
    if (key && value) facts[key] = value;
  }
  if (Object.keys(facts).length === 0) return null;
  return {
    born: facts.born || null,
    battingStyle: facts["batting style"] || null,
    bowlingStyle: facts["bowling style"] || null,
    debut: facts["national debut"] || null,
  };
}

let playerCache: { at: number; gid: string; facts: PlayerFacts | null } | null = null;
let playerFailedAt: number | null = null;
const PLAYER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PLAYER_FAILURE_TTL_MS = 5 * 60 * 1000;

/** Reads the public profile page for its fact list. Cached in-process. */
export async function fetchBcciPlayerFacts(gid: string, slug: string): Promise<PlayerFacts | null> {
  const now = Date.now();
  if (playerCache?.gid === gid && now - playerCache.at < PLAYER_CACHE_TTL_MS) {
    return playerCache.facts;
  }
  if (playerFailedAt && now - playerFailedAt < PLAYER_FAILURE_TTL_MS) return null;

  try {
    const response = await fetch(`${BCCI_WEB}/players/${encodeURIComponent(gid)}/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      playerFailedAt = now;
      return null;
    }
    const facts = parseBcciPlayerFacts(await response.text());
    playerCache = { at: now, gid, facts };
    playerFailedAt = null;
    return facts;
  } catch {
    playerFailedAt = now;
    return null;
  }
}

// ------------------------------- match squads -------------------------------

interface StatsSquadPlayer {
  player_id: string;
  name: string;
  known_as?: string;
  player_role?: string;
  is_captain?: string;
  is_keeper?: string;
}

interface StatsSquadTeam {
  team_id: string;
  name: string;
  abbreviation?: string;
  player?: StatsSquadPlayer[];
}

async function statsFetch<T>(path: string, revalidate: number): Promise<T> {
  const response = await fetch(`https://stats.bcci.tv${path}`, {
    cache: "force-cache",
    next: { revalidate },
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`BCCI stats returned ${response.status}`);
  return (await response.json()) as T;
}

/** The playing XI BCCI publishes after the toss, or empty lists before it. */
export async function fetchBcciMatchSquads(gid: string): Promise<{
  teams: StatsSquadTeam[];
  awaitingToss: boolean;
}> {
  const raw = await statsFetch<{ team?: StatsSquadTeam[] }>(
    `/match/${encodeURIComponent(gid)}/scorecard`,
    2 * 60
  );
  const teams = raw.team ?? [];
  const awaitingToss = teams.every((team) => (team.player ?? []).length === 0);
  return { teams, awaitingToss };
}

/** BCCI's graded India squad, used only when a fixture predates the toss. */
export async function fetchBcciSquads(gender: Gender) {
  const data = await bffFetch<{
    grades?: {
      name: string;
      players?: {
        playerId?: number;
        playerGid?: string;
        name?: string;
        role?: string;
      }[];
    }[];
  }>(`${CMS}/squads?tags=${gender === "women" ? "women" : "men"}`, PLAYERS_REVALIDATE_SECONDS);
  const players = (data.grades ?? []).flatMap((grade) => grade.players ?? []);
  const seen = new Set<string>();
  return players
    .filter((player) => {
      if (!player.name || !player.playerGid || seen.has(player.playerGid)) return false;
      seen.add(player.playerGid);
      return true;
    })
    .map((player) => ({
      playerId: player.playerId ? String(player.playerId) : null,
      name: player.name ?? "",
      role: roleOf(player.role ?? "Player"),
      captain: false,
      viceCaptain: false,
      wicketkeeper: /wicket/i.test(player.role ?? ""),
    }));
}

/** Route validation: BCCI match and player identifiers are UUID-shaped. */
export function isBcciGid(value: string): boolean {
  return /^[a-z0-9-]{8,64}$/i.test(value);
}
