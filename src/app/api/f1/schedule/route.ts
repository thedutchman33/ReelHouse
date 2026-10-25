import { NextResponse } from "next/server";
import { getF1Schedule } from "@/lib/f1";

// F1 season model for the /f1 page: race weekends, their sessions, the next
// round and the next session anywhere on the calendar. All OpenF1 facts,
// edge-cached briefly so live-weekend state stays current without hammering
// the upstream API.
export async function GET() {
  const schedule = await getF1Schedule();
  if (!schedule) {
    return NextResponse.json(
      { error: "f1_schedule_unavailable", rounds: [] },
      { status: 502 }
    );
  }
  return NextResponse.json(schedule, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
