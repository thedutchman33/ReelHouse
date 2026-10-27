import { NextResponse } from "next/server";
import { getCircuitGeometry } from "@/lib/circuit";

// Real circuit geometry (track center-line + corners) for the 3D map.
// MultiViewer's circuit API is immutable per circuit+year, so it caches for
// a day at the edge and in-process.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const key = searchParams.get("key");
  if (!url || !/^https:\/\/api\.multiviewer\.app\/api\/v1\/circuits\/\d+\/\d+/.test(url) || !key) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const data = await getCircuitGeometry(url, key);
  if (!data) {
    return NextResponse.json({ error: "geometry_unavailable" }, { status: 502 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
