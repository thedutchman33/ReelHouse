import { NextResponse } from "next/server";
import { getPlayerH2H } from "@/lib/cricket/stats-db";

export const revalidate = 3600;

function index(value: string | null): number | null {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  return Number(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batter = index(searchParams.get("batter"));
  const bowler = index(searchParams.get("bowler"));
  if (batter == null || bowler == null) {
    return NextResponse.json({ error: "bad_players" }, { status: 400 });
  }
  if (batter === bowler) {
    return NextResponse.json({ error: "same_player" }, { status: 400 });
  }
  const payload = getPlayerH2H(batter, bowler);
  if (!payload) {
    return NextResponse.json({ error: "unknown_player" }, { status: 404 });
  }
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
