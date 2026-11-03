import { NextResponse } from "next/server";
import { getTrackInfo } from "@/lib/track-info";

// Circuit facts for the season-calendar race sheet (length, race distance,
// laps, lap record, defending winner). Both sources are stable published data,
// so the route caches for a day at the edge.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const round = Number(searchParams.get("round"));
  const meeting = searchParams.get("meeting");
  if (!Number.isFinite(year) || !Number.isFinite(round) || round < 1) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const data = await getTrackInfo(year, round, meeting);
  if (!data) {
    return NextResponse.json({ error: "track_info_unavailable" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
