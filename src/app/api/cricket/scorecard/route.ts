import { NextResponse } from "next/server";
import { attachIccPlayerPhotos } from "@/lib/cricket";
import { fetchBcciScorecard, isBcciGid } from "@/lib/cricket/providers/bcci";
import { fetchIccPlayerPhotos } from "@/lib/cricket/providers/icc-rankings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gid = searchParams.get("gid")?.trim() ?? "";
  if (!isBcciGid(gid)) {
    return NextResponse.json({ error: "bad_match" }, { status: 400 });
  }

  try {
    const [scorecard, photos] = await Promise.all([
      fetchBcciScorecard(gid),
      fetchIccPlayerPhotos().catch(() => new Map<string, string>()),
    ]);
    const enriched = attachIccPlayerPhotos(scorecard, photos);
    const live = enriched.match.status === "live";
    return NextResponse.json(enriched, {
      headers: {
        "Cache-Control": live
          ? "public, s-maxage=15, stale-while-revalidate=30"
          : "public, s-maxage=600, stale-while-revalidate=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "scorecard_unavailable" }, { status: 502 });
  }
}
