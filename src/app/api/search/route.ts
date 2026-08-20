import { NextResponse } from "next/server";
import { searchMedia } from "@/lib/tmdb";

// Server-side search endpoint. The metadata source (and any API key) stays on
// the server — the browser only ever sees normalized results (PRD: "Search
// must not expose API secrets to the client").
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) return NextResponse.json({ query, results: [] });

  try {
    const results = await searchMedia(query);
    return NextResponse.json({ query, results });
  } catch {
    return NextResponse.json({ query, error: "search_failed", results: [] }, { status: 502 });
  }
}
