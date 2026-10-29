import { NextResponse } from "next/server";
import { getCricketDashboard } from "@/lib/cricket";

// One gender's live dashboard: BCCI fixtures, results and players. The client
// refreshes this while the page is visible; BCCI's own live cache is 30 seconds,
// and the composed payload is edge-cached briefly. ICC tables are a separate
// route so their slower source never delays the countdown or match centre.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gender = searchParams.get("gender") === "women" ? "women" : "men";

  try {
    const data = await getCricketDashboard(gender);
    if (data.fixtures.length === 0 && data.results.length === 0 && data.players.length === 0) {
      return NextResponse.json(
        { error: "cricket_data_unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=90",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "cricket_data_unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
