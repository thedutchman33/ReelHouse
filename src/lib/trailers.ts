import type {
  Media,
  TrailerFeed,
  TrailerFeedItem,
  TrailerKind,
  TrailerVideo,
} from "@/types";

// ---------------------------------------------------------------------------
// Trailer feed helpers.
//
// The live feed comes from TMDB (see lib/tmdb#getTrailerFeed). This module is
// deliberately pure: URL parsing, pagination and the offline fallback all live
// here so the page and the client player agree on one contract.
//
// The fallback is a small set of real, official YouTube trailers. It keeps the
// feed useful when no TMDB key is configured or TMDB is unreachable — the app's
// bundled mock catalog carries no video records of its own.
// ---------------------------------------------------------------------------

export const TRAILERS_PER_PAGE = 12;

// ---------------------------------------------------------------------------
// Full-trailer filtering.
//
// TMDB files short-form promo uploads (30-second cuts, dialogue snippets, suit
// reveals) under `Teaser`, but some arrive as `Trailer` with a quote caption
// like "To me, my X-Men." Those are vertical Shorts, not trailers, and they
// dominated the feed. Moctale's video list only carries the studio's actual
// full trailers ("Trailer", "New Trailer", "Final Trailer"), so the feed
// accepts exactly those.
// ---------------------------------------------------------------------------

export interface TmdbVideoLike {
  key?: string;
  site?: string;
  type?: string;
  name?: string;
  official?: boolean;
  published_at?: string;
}

/** Captions that mark a short-form promo rather than a full trailer. */
const SHORT_FORM_PATTERN =
  /teaser|tease|clip|featurette|behind[\s-]?the[\s-]?scenes|bloopers?|gag reel|special look|first look|sneak peek|sneak|tv spot|\bspots?\b|announcement|reveal|interview|making of|reaction|breakdown|explained|recap|short film|\bshorts?\b|promo|deleted scene|trailer commentary/i;

/**
 * True only for a studio-official, full-length YouTube trailer: TMDB type
 * exactly `Trailer`, a caption that calls itself a trailer, and none of the
 * short-form/promo markers above.
 */
export function isFullTrailerVideo(video: TmdbVideoLike): boolean {
  if (video?.site !== "YouTube") return false;
  if (!video.key || video.key.length !== 11) return false;
  if (video.official !== true) return false;
  if (String(video.type ?? "").trim().toLowerCase() !== "trailer") return false;
  const name = String(video.name ?? "").trim();
  if (!/trailer/i.test(name)) return false;
  return !SHORT_FORM_PATTERN.test(name);
}

/** Flagship captions first: Final Trailer, New Trailer, Official Trailer. */
export function fullTrailerScore(video: TmdbVideoLike): number {
  const name = String(video.name ?? "").toLowerCase();
  if (name.includes("final trailer")) return 4;
  if (name.includes("new trailer")) return 3;
  if (name.includes("official trailer")) return 2;
  return 1;
}

/** The title's best full trailer, or undefined when it only has promos. */
export function pickFullTrailerVideo(
  videos: readonly TmdbVideoLike[]
): TmdbVideoLike | undefined {
  const timestamp = (video: TmdbVideoLike): number => {
    const parsed = Date.parse(String(video.published_at ?? ""));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const full = videos.filter(isFullTrailerVideo);
  if (!full.length) return undefined;
  return [...full].sort(
    (a, b) => fullTrailerScore(b) - fullTrailerScore(a) || timestamp(b) - timestamp(a)
  )[0];
}

function videoTimestamp(video: TmdbVideoLike): number {
  const parsed = Date.parse(String(video.published_at ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Detail-player options from TMDB: official YouTube trailers and teasers,
 * newest first. If TMDB has no official videos, keep the playable YouTube
 * uploads rather than hiding the section. Non-trailer clips are used only when
 * no trailer or teaser exists.
 */
export function pickDetailTrailerOptions(
  videos: readonly TmdbVideoLike[]
): TrailerVideo[] {
  const playable = videos.filter(
    (video) =>
      video.site === "YouTube" &&
      /^[A-Za-z0-9_-]{11}$/.test(String(video.key ?? ""))
  );
  const trailerish = playable.filter((video) =>
    /^(?:trailer|teaser)$/i.test(String(video.type ?? "").trim())
  );
  const base = trailerish.length > 0 ? trailerish : playable;
  const official = base.filter((video) => video.official === true);
  const pool = official.length > 0 ? official : base;
  const seen = new Set<string>();

  return [...pool]
    .sort(
      (a, b) =>
        videoTimestamp(b) - videoTimestamp(a) ||
        String(a.name ?? "").localeCompare(String(b.name ?? ""))
    )
    .reduce<TrailerVideo[]>((options, video) => {
      const key = String(video.key);
      if (seen.has(key)) return options;
      seen.add(key);
      const type = String(video.type ?? "").trim().toLowerCase();
      options.push({
        key,
        name:
          String(video.name ?? "").trim() ||
          (type === "teaser" ? "Teaser" : "Trailer"),
      });
      return options;
    }, []);
}

/** Put the newest actual trailer first, without dropping any other videos. */
function withPrimaryTrailer(options: TrailerVideo[]): TrailerVideo[] {
  if (options.length < 2) return options;
  const trailerIndex = options.findIndex(
    (option) => /\btrailer\b/i.test(option.name) && !/\bteaser\b/i.test(option.name)
  );
  const teaserIndex = options.findIndex((option) =>
    /\b(?:trailer|teaser)\b/i.test(option.name)
  );
  const index = trailerIndex >= 0 ? trailerIndex : teaserIndex;
  if (index <= 0) return options;
  return [
    options[index]!,
    ...options.slice(0, index),
    ...options.slice(index + 1),
  ];
}

/**
 * The detail hero's single source of truth for playable videos. Moctale's
 * curated list wins because it carries the community's trailers, teasers and
 * special looks; TMDB is the fallback. The first actual trailer opens by
 * default (Moctale's first entry can be a date announcement), and the rest keep
 * their source order as selectable options.
 */
export function detailTrailerOptions(
  media: Pick<Media, "trailerKey" | "trailerName" | "trailerVideos">,
  moctaleVideos: readonly { key: string; caption: string }[] = []
): TrailerVideo[] {
  const seen = new Set<string>();
  const fromMoctale = moctaleVideos.flatMap<TrailerVideo>((video) => {
    const key = video.key.trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(key) || seen.has(key)) return [];
    seen.add(key);
    return [{ key, name: video.caption.trim() || "Trailer" }];
  });
  if (fromMoctale.length > 0) return withPrimaryTrailer(fromMoctale);
  if (media.trailerVideos?.length) return withPrimaryTrailer(media.trailerVideos);
  if (media.trailerKey) {
    return [{ key: media.trailerKey, name: media.trailerName ?? "Official Trailer" }];
  }
  return [];
}

export const TRAILER_KIND_OPTIONS: { value: TrailerKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
];

/** The feed's Topics popup. Multi-select is an OR, like Moctale's spaces feed. */
export type TrailerTopic = "movie" | "tv" | "anime" | "official";

export const TRAILER_TOPIC_OPTIONS: {
  value: TrailerTopic;
  label: string;
}[] = [
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
  { value: "anime", label: "Anime" },
  { value: "official", label: "Official" },
];

export const ALL_TRAILER_TOPICS: TrailerTopic[] =
  TRAILER_TOPIC_OPTIONS.map((option) => option.value);

function matchesTopic(item: TrailerFeedItem, topic: TrailerTopic): boolean {
  switch (topic) {
    case "movie":
      return item.type === "movie";
    case "tv":
      return item.type === "tv";
    case "anime":
      return item.genres.includes("Animation");
    case "official":
      return item.official;
  }
}

/**
 * Filter one feed page by the Topics popup and the inline search box. Topics
 * combine with OR (choosing Movies + Series keeps both); search always narrows
 * the topic result. The source order is preserved.
 */
export function filterTrailerItems(
  items: TrailerFeedItem[],
  topics: readonly TrailerTopic[],
  query = ""
): TrailerFeedItem[] {
  if (topics.length === 0) return [];
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (!topics.some((topic) => matchesTopic(item, topic))) return false;
    if (!q) return true;
    return [
      item.title,
      item.trailerName,
      item.year,
      item.type === "tv" ? "series tv show" : "movie film",
      item.genres.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

/**
 * The trailer feed is newest-first. TMDB publishes `published_at` for every
 * YouTube video, so this is the real release time of the trailer (not the
 * film's release date). Entries without a date fall to the end.
 */
export function sortTrailersNewest(
  items: readonly TrailerFeedItem[]
): TrailerFeedItem[] {
  const timestamp = (value?: string): number => {
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return [...items].sort((a, b) => {
    const byDate = timestamp(b.publishedAt) - timestamp(a.publishedAt);
    if (byDate !== 0) return byDate;
    return a.title.localeCompare(b.title);
  });
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Read the feed's content type from a route's search params. */
export function parseTrailerKind(
  value: string | string[] | undefined
): TrailerKind {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (raw === "movie" || raw === "movies" || raw === "film" || raw === "films") {
    return "movie";
  }
  if (
    raw === "tv" ||
    raw === "series" ||
    raw === "show" ||
    raw === "shows"
  ) {
    return "tv";
  }
  return "all";
}

/** Read a safe, positive page number from a route's search params. */
export function parseTrailerPage(
  value: string | string[] | undefined,
  totalPages = 500
): number {
  const raw = Number(firstValue(value));
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return Math.min(totalPages, raw);
}

/** URL for a trailer feed view. Defaults stay out of the address bar. */
export function trailerHref(
  kind: TrailerKind,
  page = 1,
  path = "/trailers"
): string {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("type", kind);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

type FallbackTrailer = Omit<TrailerFeedItem, "detailHref">;

// Interleaved so the default "All" view reads as a mixed feed rather than a
// movie list followed by a series list. Titles, years and trailer names are
// verified against the official YouTube videos behind each key.
const FALLBACK_TRAILERS: FallbackTrailer[] = [
  {
    id: "movie-693134",
    tmdbId: 693134,
    type: "movie",
    title: "Dune: Part Two",
    year: "2024",
    rating: 8.2,
    genres: ["Sci-Fi", "Adventure"],
    youtubeKey: "Way9Dexny3w",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
  },
  {
    id: "tv-66732",
    tmdbId: 66732,
    type: "tv",
    title: "Stranger Things",
    year: "2016",
    rating: 8.6,
    genres: ["Sci-Fi", "Horror"],
    youtubeKey: "b9EkMc79ZSU",
    trailerName: "Official Final Trailer",
    official: true,
    overview:
      "When a young boy disappears, his mother and friends confront terrifying forces to get him back.",
  },
  {
    id: "movie-872585",
    tmdbId: 872585,
    type: "movie",
    title: "Oppenheimer",
    year: "2023",
    rating: 8.1,
    genres: ["Drama", "History"],
    youtubeKey: "uYPbbksJxIg",
    trailerName: "New Trailer",
    official: true,
    overview:
      "The story of J. Robert Oppenheimer's role in the development of the atomic bomb.",
  },
  {
    id: "tv-94997",
    tmdbId: 94997,
    type: "tv",
    title: "House of the Dragon",
    year: "2022",
    rating: 8.4,
    genres: ["Drama", "Fantasy"],
    youtubeKey: "DotnJ7tTA34",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "The Targaryen civil war unfolds two hundred years before the events of Game of Thrones.",
  },
  {
    id: "movie-414906",
    tmdbId: 414906,
    type: "movie",
    title: "The Batman",
    year: "2022",
    rating: 7.8,
    genres: ["Crime", "Action"],
    youtubeKey: "mqqft2x_Aa4",
    trailerName: "Main Trailer",
    official: true,
    overview:
      "Batman follows a trail of cryptic clues left by a sadistic killer targeting Gotham's elite.",
  },
  {
    id: "tv-100088",
    tmdbId: 100088,
    type: "tv",
    title: "The Last of Us",
    year: "2023",
    rating: 8.6,
    genres: ["Drama", "Adventure"],
    youtubeKey: "uLtkt8BonwM",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "A hardened survivor is hired to smuggle a teenager across a post-apocalyptic America.",
  },
  {
    id: "movie-569094",
    tmdbId: 569094,
    type: "movie",
    title: "Spider-Man: Across the Spider-Verse",
    year: "2023",
    rating: 8.4,
    genres: ["Animation", "Action"],
    youtubeKey: "cqGjhVJWtEg",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "Miles Morales is thrown across the multiverse and must redefine what it means to be a hero.",
  },
  {
    id: "movie-361743",
    tmdbId: 361743,
    type: "movie",
    title: "Top Gun: Maverick",
    year: "2022",
    rating: 8.2,
    genres: ["Action", "Drama"],
    youtubeKey: "qSqVVswa420",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "After thirty years as a test pilot, Maverick returns to train a detachment of Top Gun graduates.",
  },
  {
    id: "tv-95396",
    tmdbId: 95396,
    type: "tv",
    title: "Severance",
    year: "2022",
    rating: 8.7,
    genres: ["Sci-Fi", "Thriller"],
    youtubeKey: "xEQP4VVuyrY",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "Office workers whose memories have been surgically divided discover a mysterious world beyond work.",
  },
  {
    id: "movie-603692",
    tmdbId: 603692,
    type: "movie",
    title: "John Wick: Chapter 4",
    year: "2023",
    rating: 8.1,
    genres: ["Action", "Thriller"],
    youtubeKey: "qEVUtrk8_B4",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "John Wick uncovers a path to defeating the High Table, but a new enemy stands in his way.",
  },
  {
    id: "movie-346698",
    tmdbId: 346698,
    type: "movie",
    title: "Barbie",
    year: "2023",
    rating: 7.0,
    genres: ["Comedy", "Fantasy"],
    youtubeKey: "pBk4NYhWNMM",
    trailerName: "Main Trailer",
    official: true,
    overview:
      "Barbie begins to question her perfect life in Barbieland and embarks on a journey into the real world.",
  },
  {
    id: "movie-76600",
    tmdbId: 76600,
    type: "movie",
    title: "Avatar: The Way of Water",
    year: "2022",
    rating: 7.6,
    genres: ["Sci-Fi", "Adventure"],
    youtubeKey: "d9MyW72ELq0",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "Jake Sully and Neytiri build a family and must leave their home to protect each other.",
  },
  {
    id: "movie-447365",
    tmdbId: 447365,
    type: "movie",
    title: "Guardians of the Galaxy Vol. 3",
    year: "2023",
    rating: 8.0,
    genres: ["Sci-Fi", "Adventure"],
    youtubeKey: "u3V5KDHRQvk",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "The Guardians set out to protect Rocket and confront the forces that created him.",
  },
  {
    id: "movie-157336",
    tmdbId: 157336,
    type: "movie",
    title: "Interstellar",
    year: "2014",
    rating: 8.4,
    genres: ["Sci-Fi", "Drama"],
    youtubeKey: "zSWdZVtXT7E",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "A team of explorers travels through a wormhole to find a new home for humanity.",
  },
  {
    id: "movie-27205",
    tmdbId: 27205,
    type: "movie",
    title: "Inception",
    year: "2010",
    rating: 8.4,
    genres: ["Sci-Fi", "Thriller"],
    youtubeKey: "YoHD9XEInc0",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "A thief who steals secrets from dreams is offered a chance to have his past crimes erased.",
  },
  {
    id: "movie-545611",
    tmdbId: 545611,
    type: "movie",
    title: "Everything Everywhere All at Once",
    year: "2022",
    rating: 7.8,
    genres: ["Action", "Comedy"],
    youtubeKey: "wxN1T1uxQ2g",
    trailerName: "Official Trailer",
    official: true,
    overview:
      "An exhausted laundromat owner discovers she must connect with parallel-universe versions of herself.",
  },
];

/** One page of the offline fallback feed, matching the live feed's shape. */
export function fallbackTrailerFeed(
  kind: TrailerKind,
  page = 1
): TrailerFeed {
  const filtered =
    kind === "all"
      ? FALLBACK_TRAILERS
      : FALLBACK_TRAILERS.filter((item) => item.type === kind);
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / TRAILERS_PER_PAGE)
  );
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = (safePage - 1) * TRAILERS_PER_PAGE;

  return {
    items: filtered.slice(start, start + TRAILERS_PER_PAGE).map((item) => ({
      ...item,
      detailHref: undefined,
    })),
    page: safePage,
    totalPages,
    kind,
  };
}
