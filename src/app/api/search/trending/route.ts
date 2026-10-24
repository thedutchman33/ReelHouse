import { NextResponse } from "next/server";
import { getTrendingSeed } from "@/lib/tmdb";

// Seed list for the search overlay's idle state (reference: TRENDING results
// shown before the user types). Server-side only — same normalization and
// secret hygiene as /api/search.
export async function GET() {
  try {
    const results = await getTrendingSeed();
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "trending_failed", results: [] }, { status: 502 });
  }
}
