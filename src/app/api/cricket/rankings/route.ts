import { NextResponse } from "next/server";
import { getCricketRankings } from "@/lib/cricket";

// ICC tables move weekly; the provider keeps a six-hour in-process cache and
// the route can sit at the edge for the same window.
export const revalidate = 600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gender = searchParams.get("gender") === "women" ? "women" : "men";

  try {
    const rankings = await getCricketRankings(gender);
    if (rankings.length === 0) {
      return NextResponse.json(
        { error: "rankings_unavailable", gender, rankings: [] },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { gender, rankings },
      {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=21600",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "rankings_unavailable", gender, rankings: [] },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
