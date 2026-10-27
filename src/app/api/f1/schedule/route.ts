import { NextResponse } from "next/server";
import { getF1Schedule } from "@/lib/f1";

// F1 season model for the /f1 page: race weekends, their sessions, the next
// round and the next session anywhere on the calendar. Accepts ?year= for the
// session centre's year dropdown (OpenF1 covers 2023 onward); defaults to the
// current year.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = Number(searchParams.get("year"));
  const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : undefined;
  const schedule = await getF1Schedule(year);
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
