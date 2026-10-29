import { NextResponse } from "next/server";
import { getActiveTeamNames, getTeamH2H } from "@/lib/cricket/stats-db";
import type { Gender } from "@/lib/cricket/types";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a")?.trim() ?? "";
  const b = searchParams.get("b")?.trim() ?? "";
  const gender: Gender = a.endsWith(" Women") ? "women" : "men";
  const names = getActiveTeamNames(gender);
  if (!names.includes(a) || !names.includes(b) || a === b) {
    return NextResponse.json({ error: "bad_teams" }, { status: 400 });
  }
  return NextResponse.json(getTeamH2H(a, b), {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
