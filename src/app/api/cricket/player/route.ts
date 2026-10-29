import { NextResponse } from "next/server";
import { fetchBcciPlayerFacts, isBcciGid } from "@/lib/cricket/providers/bcci";
import {
  fetchBcciPlayerStats,
  isBcciPlayerId,
} from "@/lib/cricket/providers/bcci-player-stats";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gid = searchParams.get("gid")?.trim() ?? "";
  const slug = searchParams.get("slug")?.trim() ?? "";
  const playerIdParam = searchParams.get("playerId")?.trim() ?? "";
  const hasProfile = isBcciGid(gid) && /^[a-z0-9-]{2,80}$/i.test(slug);
  const hasStats = isBcciPlayerId(playerIdParam);

  if (!hasProfile && !hasStats) {
    return NextResponse.json({ error: "bad_player" }, { status: 400 });
  }

  const playerId = hasStats ? Number(playerIdParam) : null;
  const [facts, stats] = await Promise.all([
    hasProfile ? fetchBcciPlayerFacts(gid, slug) : Promise.resolve(null),
    playerId ? fetchBcciPlayerStats(playerId) : Promise.resolve(null),
  ]);

  return NextResponse.json(
    { gid, playerId, facts, stats },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
