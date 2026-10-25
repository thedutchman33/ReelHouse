import { NextResponse } from "next/server";
import { searchMedia } from "@/lib/tmdb";
import { anilistSearch } from "@/lib/anilist";
import type { MediaSummary, MediaType } from "@/types";

// Server-side search endpoint. The metadata source (and any API key) stays on
// the server — the browser only ever sees normalized results (PRD: "Search
// must not expose API secrets to the client").
//
// Two modes:
// - Unscoped (the navbar overlay): anime from AniList, movies/series from
//   TMDB, anime-first. TMDB's own Japanese-animation entries are dropped when
//   AniList answers, so a title like "Naruto Shippūden" appears exactly once —
//   as anime, not as a series duplicate.
// - Scoped (page-level search bars pass ?type=): results are restricted to
//   that page's catalog — movie → films only, tv → series only (TMDB
//   /search/movie, /search/tv), anime → AniList only.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) return NextResponse.json({ query, results: [] });

  const raw = searchParams.get("type");
  const scoped: MediaType | null =
    raw === "movie" || raw === "tv" || raw === "anime" ? raw : null;

  // Search results are public metadata and identical for every visitor, so the
  // response is edge-cacheable — without this, every serverless instance pays
  // the full TMDB+AniList round-trip per unique query (~0.7s measured cold).
  const cacheHeaders = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

  try {
    if (scoped) {
      const results = await searchMedia(query, { type: scoped }).catch(
        () => [] as MediaSummary[]
      );
      return NextResponse.json({ query, results }, { headers: cacheHeaders });
    }

    const [anime, tmdb] = await Promise.all([
      anilistSearch(query, 8).catch(() => [] as MediaSummary[]),
      searchMedia(query).catch(() => [] as MediaSummary[]),
    ]);

    // Drop TMDB entries that ARE anime (Animation genre) when the AniList
    // search already returned a same-title anime — the live-action One Piece
    // series must survive while the animated series dupe does not. Non-TV
    // entries (movies) always pass; TMDB movie ids are separate from the
    // anime card links anyway.
    const animeTitles = new Set(
      anime.map((a) => a.title.toLowerCase().replace(/[^a-z0-9]/g, ""))
    );
    const tmdbFiltered = tmdb.filter((t) => {
      if (t.type !== "tv") return true;
      const tv = t as MediaSummary & { genreIds?: number[] };
      const isAnime = (tv.genreIds ?? []).includes(16);
      if (!isAnime) return true;
      const key = t.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      return !animeTitles.has(key);
    });

    return NextResponse.json({ query, results: [...anime, ...tmdbFiltered] }, { headers: cacheHeaders });
  } catch {
    return NextResponse.json({ query, error: "search_failed", results: [] }, { status: 502 });
  }
}
