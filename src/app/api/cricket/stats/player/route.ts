import { NextResponse } from "next/server";
import { getStatsPlayer } from "@/lib/cricket/stats-db";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const value = searchParams.get("index");
  if (!value || !/^\d{1,6}$/.test(value)) {
    return NextResponse.json({ error: "bad_player" }, { status: 400 });
  }
  const player = getStatsPlayer(Number(value));
  if (!player) {
    return NextResponse.json({ error: "unknown_player" }, { status: 404 });
  }
  return NextResponse.json({ player }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
