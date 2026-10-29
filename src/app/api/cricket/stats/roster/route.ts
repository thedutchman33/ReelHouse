import { NextResponse } from "next/server";
import type { Gender } from "@/lib/cricket/types";
import { getStatsRoster } from "@/lib/cricket/stats-db";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gender: Gender = searchParams.get("gender") === "women" ? "women" : "men";
  try {
    const roster = getStatsRoster(gender);
    if (!roster.teams.length) {
      return NextResponse.json(
        { error: "roster_unavailable", gender },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(roster, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json(
      { error: "roster_unavailable", gender },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
