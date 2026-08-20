import { NextResponse } from "next/server";
import { getPlaybackSource } from "@/lib/providers";
import type { MediaType } from "@/types";

// ---------------------------------------------------------------------------
// GET /api/playback?type=movie&id=90001
// GET /api/playback?type=tv&id=90101&season=1&episode=1
//
// Resolves an *authorized* playback source through the provider abstraction.
// The watch page resolves sources server-side directly; this endpoint exists so
// a client can refresh an expiring source (Phase 2: signed URLs / token TTLs)
// without a full navigation. Provider credentials never leave the server.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = Number(searchParams.get("id"));
  const seasonRaw = searchParams.get("season");
  const episodeRaw = searchParams.get("episode");

  if ((type !== "movie" && type !== "tv") || !Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });
  }

  try {
    const source = await getPlaybackSource(
      type as MediaType,
      id,
      seasonRaw ? Number(seasonRaw) : undefined,
      episodeRaw ? Number(episodeRaw) : undefined
    );
    return NextResponse.json(source, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "No authorized source available" }, { status: 502 });
  }
}
