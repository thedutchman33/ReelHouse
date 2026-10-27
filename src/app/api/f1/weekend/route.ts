import { NextResponse } from "next/server";
import { getF1WeekendRecords } from "@/lib/f1";

// Weekend session records for the /f1 session-records strip: every session of
// one race meeting with its real fastest lap + classification winner. Live
// weekends cache for seconds; finished weekends are immutable and cache long.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meetingKey = Number(searchParams.get("meeting"));
  if (!Number.isFinite(meetingKey) || meetingKey <= 0) {
    return NextResponse.json({ error: "bad_meeting" }, { status: 400 });
  }
  const payload = await getF1WeekendRecords(meetingKey);
  if (!payload) {
    return NextResponse.json({ error: "f1_weekend_unavailable" }, { status: 502 });
  }
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": payload.isLive
        ? "public, s-maxage=20, stale-while-revalidate=45"
        : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
