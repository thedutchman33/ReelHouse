import "server-only";
import type { Media, MediaSummary, Season } from "@/types";
import type { BrowseFilters } from "@/lib/browse";

/** The browse page contract (mirrors tmdb.ts's BrowsePage — importing it
    there would be circular since tmdb.ts routes anime here). */
export interface AniListBrowsePage {
  items: MediaSummary[];
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// AniList — the anime catalog (GraphQL, no key required).
//
// Reelhouse splits its data sources deliberately: movies and series are TMDB,
// anime is AniList-native end to end — catalog ids ARE AniList ids, so the
// watch page can expand anime provider templates like
// https://vidy.st/anime/{anilistId}/{episode} directly. AniList models anime
// as ONE continuous episode run (no seasons), so episodes are synthesized as
// a single "Episodes" season of numbered stubs; counts come from AniList
// (`episodes`, or `nextAiringEpisode - 1` while airing) and are never capped.
// ---------------------------------------------------------------------------

const AL_ENDPOINT = "https://graphql.anilist.co";

/** AniList's genre vocabulary — the anime page's Genre dropdown. */
export const ANILIST_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
] as const;

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  format
  episodes
  duration
  status
  season
  seasonYear
  startDate { year month day }
  averageScore
  popularity
  genres
  coverImage { extraLarge large }
  bannerImage
  description
  nextAiringEpisode { episode }
  studios(isMain: true) { nodes { name } }
`;

interface AlFuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}
interface AlRelationNode {
  id: number;
  type?: string | null;
  format?: string | null;
}
interface AlMedia {
  id: number;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  format?: string | null;
  episodes?: number | null;
  duration?: number | null;
  status?: string | null;
  seasonYear?: number | null;
  startDate?: AlFuzzyDate | null;
  averageScore?: number | null;
  genres?: string[] | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  bannerImage?: string | null;
  description?: string | null;
  nextAiringEpisode?: { episode: number } | null;
  studios?: { nodes: { name: string }[] } | null;
  streamingEpisodes?: { title?: string | null; thumbnail?: string | null }[] | null;
  relations?: { edges: { relationType: string; node: AlRelationNode }[] } | null;
}

async function al<T>(
  query: string,
  variables: Record<string, unknown>,
  revalidate = 60 * 15
): Promise<T | null> {
  const post = (opts: Record<string, unknown>) =>
    fetch(AL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      ...opts,
    });
  try {
    let res = await post({ next: { revalidate } });
    // AniList rate-limits (30 req/min). One bounded retry covers cold passes
    // where the chain walk fires several uncached queries back to back.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await post({ next: { revalidate } });
    }
    if (!res.ok) {
      // A transient failure must not sit in the data cache for `revalidate`
      // seconds (a cached 429 would truncate a franchise chain for an hour) —
      // one uncached attempt, then give up.
      if (res.status === 429 || res.status >= 500) {
        const retry = await post({ cache: "no-store" });
        if (retry.ok) {
          const json = (await retry.json()) as { data?: T; errors?: unknown[] };
          return json.data && !json.errors ? json.data : null;
        }
      }
      return null;
    }
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    return json.data && !json.errors ? json.data : null;
  } catch {
    return null;
  }
}

/** AniList descriptions carry simple HTML (<br>, <i>, <b>) — strip to text. */
function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function isoDate(d?: AlFuzzyDate | null): string | undefined {
  if (!d?.year) return undefined;
  const m = String(d.month ?? 1).padStart(2, "0");
  const day = String(d.day ?? 1).padStart(2, "0");
  return `${d.year}-${m}-${day}`;
}

/** Total episode count: AniList's `episodes`, or aired-so-far while ongoing. */
function episodeCount(m: AlMedia): number {
  if (m.episodes && m.episodes > 0) return m.episodes;
  if (m.nextAiringEpisode?.episode) return Math.max(1, m.nextAiringEpisode.episode - 1);
  return 1;
}

function titleOf(m: AlMedia): string {
  return m.title.english || m.title.romaji || m.title.native || "Untitled";
}

/** Card summary — type "anime", tmdbId carries the ANILIST id. */
function alSummary(m: AlMedia): MediaSummary {
  return {
    id: `anime-${m.id}`,
    tmdbId: m.id,
    type: "anime",
    title: titleOf(m),
    posterUrl: m.coverImage?.large ?? m.coverImage?.extraLarge ?? undefined,
    backdropUrl: m.bannerImage ?? undefined,
    rating: m.averageScore ? m.averageScore / 10 : undefined,
    releaseDate: isoDate(m.startDate) ?? (m.seasonYear ? `${m.seasonYear}-01-01` : undefined),
    genres: (m.genres ?? []).slice(0, 4),
    overview: undefined,
  };
}

/**
 * Episodes as one continuous "Episodes" season of numbered stubs (AniList
 * models anime without seasons; vidy.st's anime path is episode-numbered).
 */
/**
 * Parse a Crunchyroll-style streaming title ("Episode 7 - For Myself") into
 * its number and name; non-conforming titles keep the full string.
 */
function parseStreamingTitle(
  raw: string
): { number: number | null; title: string } {
  const m = /^Episode\s+(\d+)\s*[-–—]\s*(.+)$/.exec(raw.trim());
  if (m) return { number: Number(m[1]), title: m[2].trim() };
  return { number: null, title: raw.trim() };
}

/**
 * One season of the franchise chain. Multi-season chains name the season
 * after its AniList entry ("Jujutsu Kaisen 2nd Season"); a standalone entry
 * keeps the established single "Episodes" heading. Episodes carry the entry's
 * own anilistId — per-season playback (vidy.st's path is per-entry and
 * episode-numbered) addresses the right show.
 */
function alSeason(m: AlMedia, seasonNumber: number, name: string): Season {
  const count = episodeCount(m);
  // Streaming episodes carry REAL per-episode thumbnails and names; they can
  // be partial (or absent), so they overlay the numbered stubs by episode
  // number and everything uncovered falls back to the stub.
  const streamed = new Map<number, { title: string; stillUrl?: string }>();
  (m.streamingEpisodes ?? []).forEach((e, i) => {
    if (!e?.title) return;
    const parsed = parseStreamingTitle(e.title);
    const number = parsed.number ?? i + 1;
    streamed.set(number, {
      title: parsed.title,
      ...(e.thumbnail ? { stillUrl: e.thumbnail } : {}),
    });
  });
  return {
    seasonNumber,
    name,
    episodeCount: count,
    anilistId: m.id,
    episodes: Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const hit = streamed.get(n);
      return {
        id: `s${seasonNumber}e${n}`,
        seasonNumber,
        episodeNumber: n,
        title: hit?.title || `Episode ${n}`,
        anilistId: m.id,
        ...(hit?.stillUrl ? { stillUrl: hit.stillUrl } : {}),
      };
    }),
  };
}

// ----------------------- franchise season chain ----------------------------
//
// AniList models each season of a franchise as its own Media entry (Jujutsu
// Kaisen S1 = 24 episodes, its SEQUEL entry carries S2's 23, and so on — the
// reason a title like JJK showed "only" S1's episodes). The chain of TV
// entries connected by PREQUEL/SEQUEL edges IS the season list, so it is
// walked (bounded breadth-first) and each entry becomes one Season. Movies,
// ONAs, PVs and recaps are not seasons and stay out.

const CHAIN_RELATIONS = new Set(["PREQUEL", "SEQUEL"]);
const CHAIN_CAP = 10;

interface ChainNode extends AlMedia {
  relations?: { edges: { relationType: string; node: AlRelationNode }[] } | null;
}

function chainNeighbors(n: ChainNode): number[] {
  return (n.relations?.edges ?? [])
    .filter(
      (e) =>
        CHAIN_RELATIONS.has(e.relationType) &&
        e.node.type === "ANIME" &&
        e.node.format === "TV"
    )
    .map((e) => e.node.id);
}

function chainTimestamp(m: AlMedia): number {
  const d = m.startDate;
  if (!d?.year) return Number.MAX_SAFE_INTEGER;
  return Date.UTC(d.year, (d.month ?? 1) - 1, d.day ?? 1);
}

async function buildSeasonChain(root: ChainNode): Promise<Season[]> {
  const nodes = new Map<number, ChainNode>([[root.id, root]]);
  // Round 1 walks the root's already-fetched relations; each later round
  // batch-fetches the discovered entries' own fields + relations (one GraphQL
  // query per round via media(id_in), capped so long chains stay bounded).
  let frontier: number[] = chainNeighbors(root);
  for (let round = 0; round < 3 && frontier.length && nodes.size < CHAIN_CAP; round++) {
    const fresh = [...new Set(frontier)].filter((id) => !nodes.has(id));
    if (fresh.length === 0) break;
    const data = await al<{ Page: { media: ChainNode[] } }>(
      `query ($ids: [Int]) {
        Page(page: 1, perPage: ${CHAIN_CAP}) {
          media(id_in: $ids, type: ANIME) { ${CHAIN_FIELDS} }
        }
      }`,
      { ids: fresh.slice(0, CHAIN_CAP - nodes.size) },
      60 * 60
    );
    const nextFrontier: number[] = [];
    for (const n of data?.Page?.media ?? []) {
      if (nodes.has(n.id)) continue;
      nodes.set(n.id, n);
      for (const id of chainNeighbors(n)) {
        if (!nodes.has(id)) nextFrontier.push(id);
      }
    }
    frontier = nextFrontier;
  }

  // Air-date order is season order. Unaired entries would only produce
  // phantom episode counts, so they stay out.
  const ordered = [...nodes.values()]
    .filter((m) => m.status !== "NOT_YET_RELEASED")
    .sort((a, b) => chainTimestamp(a) - chainTimestamp(b) || a.id - b.id);
  if (ordered.length <= 1) return [alSeason(root, 1, "Episodes")];
  return ordered.map((m, i) => alSeason(m, i + 1, titleOf(m)));
}

/** Detail-only fields — streaming episodes are heavy (per-episode
    thumbnails), so list queries don't fetch them. */
const DETAIL_FIELDS = `${MEDIA_FIELDS}
  streamingEpisodes { title thumbnail site }
  relations { edges { relationType node { id type format } } }`;

/** What a chain node needs: its own episode run + the next hop of the chain. */
const CHAIN_FIELDS = `${MEDIA_FIELDS}
  streamingEpisodes { title thumbnail }
  relations { edges { relationType node { id type format } } }`;

function alMedia(m: AlMedia, recs: AlMedia[], seasons?: Season[]): Media {
  const studio = m.studios?.nodes?.[0]?.name;
  return {
    ...alSummary(m),
    overview: stripHtml(m.description),
    runtime: m.duration || undefined,
    tagline: studio,
    // Movies are not episode-based — no episodes section, no episode rail.
    // Every other format (TV, TV_SHORT, ONA, OVA, SPECIAL) is an episode run;
    // the seasons come from the franchise chain (see buildSeasonChain).
    ...(m.format === "MOVIE" ? {} : { seasons: seasons ?? [alSeason(m, 1, "Episodes")] }),
    recommendations: recs.slice(0, 12).map(alSummary),
  };
}

// ------------------------------ public API ---------------------------------

/** One catalog page honoring the browse filter contract. Null = AniList failed. */
export async function anilistBrowse(filters: BrowseFilters): Promise<AniListBrowsePage | null> {
  const sortMap: Record<BrowseFilters["sort"], string> = {
    popularity: "POPULARITY_DESC",
    rating: "SCORE_DESC",
    latest: "START_DATE_DESC",
    oldest: "START_DATE_ASC",
  };
  const variables: Record<string, unknown> = {
    page: Math.min(filters.page, 500),
    perPage: 40,
    sort: sortMap[filters.sort],
  };
  // AniList 400s on declared-but-unused variables, so declarations and filter
  // arguments are composed in lockstep.
  const decls: string[] = ["$page: Int", "$perPage: Int", "$sort: [MediaSort]"];
  const args: string[] = ["type: ANIME", "sort: $sort", "isAdult: false"];
  if (filters.genre && (ANILIST_GENRES as readonly string[]).includes(filters.genre)) {
    decls.push("$genre: String");
    args.push("genre_in: [$genre]");
    variables.genre = filters.genre;
  }
  if (filters.year) {
    decls.push("$startDateGreater: FuzzyDateInt", "$startDateLess: FuzzyDateInt");
    args.push("startDate_greater: $startDateGreater", "startDate_less: $startDateLess");
    variables.startDateGreater = `${filters.year - 1}-12-31`;
    variables.startDateLess = `${filters.year + 1}-01-01`;
  }

  const data = await al<{ Page: { pageInfo: { lastPage?: number }; media: AlMedia[] } }>(
    `query (${decls.join(", ")}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { lastPage }
        media(${args.join(", ")}) { ${MEDIA_FIELDS} }
      }
    }`,
    variables,
    60 * 10
  );
  if (!data?.Page?.media?.length) return null;
  return {
    items: data.Page.media.map(alSummary),
    page: filters.page,
    totalPages: Math.min(500, data.Page.pageInfo?.lastPage ?? 1),
  };
}

/** Trending right now (homepage anime row). */
export async function anilistTrending(limit = 18): Promise<MediaSummary[]> {
  const data = await al<{ Page: { media: AlMedia[] } }>(
    `query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { perPage: limit },
    60 * 10
  );
  return (data?.Page?.media ?? []).map(alSummary);
}

/** Search anime by title (relevance-ordered). */
export async function anilistSearch(
  query: string,
  limit = 8
): Promise<MediaSummary[]> {
  const data = await al<{ Page: { media: AlMedia[] } }>(
    `query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, search: $search, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { search: query, perPage: limit },
    60 * 10
  );
  return (data?.Page?.media ?? []).map(alSummary);
}

/** Full detail by AniList id (detail page + watch page). */
export async function anilistDetail(anilistId: number): Promise<Media | null> {
  const data = await al<{
    Media: AlMedia & {
      // NOTE: inside a Recommendation node, `media` is the SOURCE title
      // (always self) — `mediaRecommendation` is the recommended one.
      recommendations?: { nodes: { mediaRecommendation?: AlMedia | null }[] } | null;
    };
  }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${DETAIL_FIELDS}
        recommendations(perPage: 20, sort: RATING_DESC) {
          nodes { mediaRecommendation { ${MEDIA_FIELDS} } }
        }
      }
    }`,
    { id: anilistId },
    60 * 30
  );
  if (!data?.Media) return null;
  // Defensive: dedupe and never recommend the title itself.
  const seen = new Set<number>([data.Media.id]);
  const recs: AlMedia[] = [];
  for (const n of data.Media.recommendations?.nodes ?? []) {
    const m = n.mediaRecommendation;
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    recs.push(m);
    if (recs.length >= 12) break;
  }
  // The franchise chain: every PREQUEL/SEQUEL TV entry becomes a Season, so
  // multi-season anime show their complete episode run.
  const seasons = data.Media.format === "MOVIE" ? undefined : await buildSeasonChain(data.Media);
  return alMedia(data.Media, recs, seasons);
}
