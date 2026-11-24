import { NextResponse } from "next/server";
import { searchMusic } from "@/lib/music/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ tracks: [], artists: [], albums: [], playlists: [] });
  }

  const limitRaw = Number(params.get("limit"));
  const offsetRaw = Number(params.get("offset") ?? params.get("jamendoOffset"));
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(30, Math.trunc(limitRaw)))
    : 10;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.min(200, Math.trunc(offsetRaw)))
    : 0;

  try {
    const data = await searchMusic(query, { limit, offset });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(
      "[api:music/search] catalog error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Search is temporarily unavailable" }, { status: 502 });
  }
}
