import { NextResponse } from "next/server";
import {
  isDownloadConfigured,
  isSearchConfigured,
  searchSubtitles,
  OpenSubtitlesError,
} from "@/lib/opensubtitles";

// ---------------------------------------------------------------------------
// GET /api/subtitles/search?type=movie&tmdbId=1003596
// GET /api/subtitles/search?type=tv&tmdbId=1396&season=1&episode=1&languages=en
//
// Searches OpenSubtitles for the currently playing title/episode. Requires only
// the OpenSubtitles API key (server-side). Never exposes credentials.
//
// Responses (always JSON; the client switches on `status`):
//   { status: "ok",             canDownload, results: [...] }
//   { status: "not_configured", canDownload: false, results: [] }   // no API key
//   { status: "error",          code, message }
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const tmdbId = Number(searchParams.get("tmdbId") ?? searchParams.get("id"));
  const seasonRaw = searchParams.get("season");
  const episodeRaw = searchParams.get("episode");
  const query = searchParams.get("query") ?? undefined;
  const languages = searchParams.get("languages") ?? undefined;

  if ((type !== "movie" && type !== "tv") || !Number.isFinite(tmdbId)) {
    return NextResponse.json(
      { status: "error", code: "bad_request", message: "Invalid type or TMDB id." },
      { status: 400 }
    );
  }

  // No API key → tell the client to show setup guidance rather than an error.
  if (!isSearchConfigured()) {
    return NextResponse.json(
      { status: "not_configured", canDownload: false, results: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const results = await searchSubtitles({
      type,
      tmdbId,
      season: seasonRaw ? Number(seasonRaw) : undefined,
      episode: episodeRaw ? Number(episodeRaw) : undefined,
      query: query?.trim() || undefined,
      languages: languages?.trim() || undefined,
    });
    return NextResponse.json(
      { status: "ok", canDownload: isDownloadConfigured(), results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const err = e instanceof OpenSubtitlesError ? e : null;
    const code = err?.code ?? "upstream";
    const message = err?.message ?? "Subtitle search failed.";
    const httpStatus = code === "auth" ? 502 : code === "network" ? 502 : 502;
    return NextResponse.json({ status: "error", code, message }, { status: httpStatus });
  }
}
