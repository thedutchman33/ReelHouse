import { NextResponse } from "next/server";
import { getF1Results } from "@/lib/f1";

// Session centre: every driver's every lap of one F1 session, plus the
// classification. Live sessions cache for seconds at the edge; finished
// sessions are immutable and cache long.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionKey = Number(searchParams.get("session"));
  if (!Number.isFinite(sessionKey) || sessionKey <= 0) {
    return NextResponse.json({ error: "bad_session" }, { status: 400 });
  }
  const payload = await getF1Results(sessionKey);
  if (!payload) {
    return NextResponse.json({ error: "f1_results_unavailable" }, { status: 502 });
  }
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": payload.isLive
        ? "public, s-maxage=15, stale-while-revalidate=30"
        : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
