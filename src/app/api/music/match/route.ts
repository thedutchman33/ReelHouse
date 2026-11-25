import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/music/backend";

// Batch metadata matching for native imports. No Spotify credentials, tokens
// or Web API calls are involved: the backend searches YouTube Music with the
// title/artist/album/duration the user supplied and returns scored candidates.
export const dynamic = "force-dynamic";

interface MatchBodyTrack {
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
}

function cleanTrack(value: unknown): MatchBodyTrack | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string") return null;
  const title = item.title.trim().slice(0, 200);
  if (title.length < 2) return null;
  const artist = typeof item.artist === "string" ? item.artist.trim().slice(0, 200) : "";
  const album =
    typeof item.album === "string" ? item.album.trim().slice(0, 200) : undefined;
  const rawDuration =
    typeof item.durationMs === "number" && Number.isFinite(item.durationMs)
      ? Math.trunc(item.durationMs)
      : 0;
  return {
    title,
    artist,
    album: album || undefined,
    durationMs: Math.max(0, Math.min(3_600_000, rawDuration)),
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON" },
      { status: 400 }
    );
  }
  const rawTracks = (payload as { tracks?: unknown } | null)?.tracks;
  if (!Array.isArray(rawTracks)) {
    return NextResponse.json({ error: "A list of tracks is required" }, { status: 400 });
  }
  const tracks = rawTracks
    .slice(0, 12)
    .map(cleanTrack)
    .filter((track): track is MatchBodyTrack => Boolean(track));
  if (tracks.length === 0) {
    return NextResponse.json(
      { error: "At least one track with a title is required" },
      { status: 400 }
    );
  }

  try {
    const response = await backendFetch("/v1/music/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ tracks }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Track matching is temporarily unavailable" },
        { status: 502 }
      );
    }
    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error(
      "[api:music/match] backend error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Track matching is temporarily unavailable" },
      { status: 502 }
    );
  }
}
