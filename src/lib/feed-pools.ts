import type { MediaType } from "@/types";

// Curated "My Feed" pools — the reference "My Feed" samples all-time curated
// pools (its local cache held one entry per query: "movie|40|en-US|best drama
// movies of all time", "tv|40|en-US|best crime tv series", …) and mixes movies
// AND series from them, steered by the viewer's watch signals. Each pool is the
// TMDB-discover equivalent of one reference query; `genreId` drives the query
// and `genre` is the watch-history genre name the pool matches for affinity.
// Pure data so both the server fetcher and the client row can import it.
export interface FeedPool {
  id: string;
  kind: MediaType;
  genreId?: number;
  /** Watch-history genre name this pool serves (affinity matching). */
  genre?: string;
}

export const FEED_POOLS: FeedPool[] = [
  { id: "drama-m", kind: "movie", genreId: 18, genre: "Drama" },
  { id: "action-m", kind: "movie", genreId: 28, genre: "Action" },
  { id: "comedy-m", kind: "movie", genreId: 35, genre: "Comedy" },
  { id: "horror-m", kind: "movie", genreId: 27, genre: "Horror" },
  { id: "thriller-m", kind: "movie", genreId: 53, genre: "Thriller" },
  { id: "scifi-m", kind: "movie", genreId: 878, genre: "Sci-Fi" },
  { id: "romance-m", kind: "movie", genreId: 10749, genre: "Romance" },
  { id: "animated-m", kind: "movie", genreId: 16, genre: "Animation" },
  { id: "crime-m", kind: "movie", genreId: 80, genre: "Crime" },
  { id: "family-m", kind: "movie", genreId: 10751, genre: "Family" },
  { id: "documentary-m", kind: "movie", genreId: 99, genre: "Documentary" },
  { id: "mystery-m", kind: "movie", genreId: 9648, genre: "Mystery" },
  // "critically acclaimed movies" — no genre filter, just the all-time list.
  { id: "acclaimed-m", kind: "movie" },
  // TMDB TV genre ids/names differ from movie ids beyond the shared basics.
  { id: "drama-tv", kind: "tv", genreId: 18, genre: "Drama" },
  { id: "comedy-tv", kind: "tv", genreId: 35, genre: "Comedy" },
  { id: "crime-tv", kind: "tv", genreId: 80, genre: "Crime" },
  { id: "scifi-tv", kind: "tv", genreId: 10765, genre: "Sci-Fi" },
  { id: "mystery-tv", kind: "tv", genreId: 9648, genre: "Mystery" },
  { id: "action-tv", kind: "tv", genreId: 10759, genre: "Action" },
  { id: "reality-tv", kind: "tv", genreId: 10764, genre: "Reality" },
  { id: "documentary-tv", kind: "tv", genreId: 99, genre: "Documentary" },
  { id: "animated-tv", kind: "tv", genreId: 16, genre: "Animation" },
  // "best korean dramas" — Korean originals, no genre affinity.
  { id: "korean-tv", kind: "tv", genreId: 18 },
];
