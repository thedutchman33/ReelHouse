import { NextResponse } from "next/server";
import { getSeasonEpisodes } from "@/lib/tmdb";

// One season's episodes — the lazy half of the season model. Detail and watch
// pages fetch this on season change, so a 22-season show ships its page as
// metadata and loads only the season being viewed. Episode lists are
// immutable once aired, so the response caches hard at the edge.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tvId: string; season: string }> }
) {
  const { tvId, season } = await params;
  const id = Number(tvId);
  const seasonNumber = Number(season);
  if (!Number.isInteger(id) || !Number.isInteger(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const episodes = await getSeasonEpisodes(id, seasonNumber);
    return NextResponse.json(
      { seasonNumber, episodes },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch {
    return NextResponse.json({ error: "season_failed" }, { status: 502 });
  }
}
