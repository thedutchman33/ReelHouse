import { NextResponse } from "next/server";
import { getTrendingSeed } from "@/lib/tmdb";

// Seed list for the search overlay's idle state (reference: TRENDING results
// shown before the user types). Server-side only — same normalization and
// secret hygiene as /api/search. Identical for every visitor and slow-moving,
// so the edge serves it instead of each instance re-fetching TMDB.
export async function GET() {
  try {
    const results = await getTrendingSeed();
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch {
    return NextResponse.json({ error: "trending_failed", results: [] }, { status: 502 });
  }
}
