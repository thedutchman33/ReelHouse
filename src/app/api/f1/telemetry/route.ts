import { NextResponse } from "next/server";
import { getF1Telemetry } from "@/lib/f1";

// Telemetry for one F1 session + up to 4 drivers (OpenF1 car_data / laps /
// session_result). During a live session the response must move with the
// clock, so it is cached for seconds at the edge; finished sessions cache
// longer. Drivers default to the current top 3.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionKey = Number(searchParams.get("session"));
  if (!Number.isFinite(sessionKey) || sessionKey <= 0) {
    return NextResponse.json({ error: "bad_session" }, { status: 400 });
  }
  const drivers = (searchParams.get("drivers") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice(0, 4);

  const payload = await getF1Telemetry(sessionKey, drivers);
  if (!payload) {
    return NextResponse.json({ error: "f1_telemetry_unavailable" }, { status: 502 });
  }
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": payload.isLive
        ? "public, s-maxage=10, stale-while-revalidate=20"
        : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
