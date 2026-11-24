import { NextResponse } from "next/server";
import { backendJson } from "@/lib/music/backend";
import type { MusicSearchResults } from "@/lib/music/types";

export const dynamic = "force-dynamic";

// Real YouTube Music artwork only. This replaces the old MusicBrainz/Cover Art
// fallback: when the catalog has no image the existing UI shows its neutral
// placeholder instead of unrelated artwork.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const artist = params.get("artist")?.trim().slice(0, 160) ?? "";
  const album = params.get("album")?.trim().slice(0, 160) ?? "";
  if (artist.length < 2 || album.length < 2) {
    return NextResponse.json({ error: "artist and album are required" }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ q: `${artist} ${album}`, limit: "5", offset: "0" });
    const data = await backendJson<MusicSearchResults>(
      `/v1/music/search?${query.toString()}`,
      { revalidate: 86_400 }
    );
    const artwork = data.albums.find((item) => item.artworkUrl)?.artworkUrl
      ?? data.tracks.find((item) => item.artworkUrl)?.artworkUrl;
    if (!artwork || !/^https:\/\//.test(artwork)) {
      return NextResponse.json({ url: null }, { status: 404 });
    }
    return NextResponse.json(
      { url: artwork },
      { headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=604800" } }
    );
  } catch (error) {
    console.error(
      "[api:music/artwork] backend error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Artwork lookup unavailable" }, { status: 502 });
  }
}
