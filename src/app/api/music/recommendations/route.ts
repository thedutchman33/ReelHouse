import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/music/backend";
import { searchMusic } from "@/lib/music/catalog";
import {
  rankRecommendations,
  type MusicTasteArtist,
  type MusicTasteGenre,
  type MusicTasteProfile,
} from "@/lib/music/recommendations";
import type { MusicTrack } from "@/lib/music/types";

interface RecommendationBody {
  genres?: unknown;
  artists?: unknown;
  excludeIds?: unknown;
  limit?: unknown;
}

function stringList(value: unknown, max: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, maxLength))
        .filter(Boolean)
    )
  ).slice(0, max);
}

function artistList(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const result: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as { id?: unknown; name?: unknown };
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 120) : "";
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 180) : "";
    if (!name) continue;
    const key = id || name.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, name });
    if (result.length >= 4) break;
  }
  return result;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    try {
      const upstream = await backendFetch("/v1/music/recommendations", {
        headers: { Authorization: authorization, Accept: "application/json" },
        cache: "no-store",
      });
      if (upstream.ok) {
        const profile = (await upstream.json()) as {
          sections?: { tracks?: MusicTrack[] }[];
        };
        const seen = new Set<string>();
        const tracks = (profile.sections ?? [])
          .flatMap((section) => section.tracks ?? [])
          .filter((track) => {
            if (!track?.id || seen.has(track.id)) return false;
            seen.add(track.id);
            return true;
          })
          .slice(0, 30);
        if (tracks.length > 0) {
          return NextResponse.json(
            { tracks, sections: profile.sections ?? [] },
            { headers: { "Cache-Control": "private, no-store" } }
          );
        }
      }
    } catch {
      // Fall through to the non-personalized local recommendation ranker.
    }
  }

  let body: RecommendationBody;
  try {
    body = (await request.json()) as RecommendationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const genreNames = stringList(body.genres, 5, 60);
  const artistSeeds = artistList(body.artists);
  const excludeIds = stringList(body.excludeIds, 180, 200);
  const requestedLimit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(30, Math.trunc(body.limit)))
      : 20;

  if (genreNames.length === 0 && artistSeeds.length === 0) {
    return NextResponse.json(
      { tracks: [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const genres: MusicTasteGenre[] = genreNames.map((label, index) => ({
    key: label.toLocaleLowerCase("en-US"),
    label,
    weight: Math.max(2, 6 - index),
  }));
  const artists: MusicTasteArtist[] = artistSeeds.map((artist, index) => ({
    ...artist,
    weight: Math.max(2, 5 - index),
  }));
  const profile: MusicTasteProfile = {
    favoriteGenres: genreNames,
    genres,
    artists,
    seedIds: excludeIds,
    hasSignals: true,
  };

  // Three genre queries plus one followed artist gives both providers enough
  // real candidates while staying well inside their free rate limits.
  const queries = [
    ...genreNames.slice(0, 3),
    ...artistSeeds.slice(0, 1).map((artist) => artist.name),
  ];

  const pages = await Promise.allSettled(
    queries.map((query) => searchMusic(query, { limit: 8 }))
  );

  const candidateMap = new Map<string, MusicTrack>();
  for (const page of pages) {
    if (page.status !== "fulfilled") continue;
    for (const track of page.value.tracks) {
      if (!candidateMap.has(track.id)) candidateMap.set(track.id, track);
    }
  }

  const tracks = rankRecommendations(
    Array.from(candidateMap.values()),
    profile,
    requestedLimit
  );

  return NextResponse.json(
    { tracks },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
