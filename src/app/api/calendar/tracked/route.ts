import { NextResponse } from "next/server";
import { isMonthKey } from "@/lib/calendar";
import { getTrackedCalendarEpisodes } from "@/lib/release-calendar";

// Episodes for the viewer's tracked series. Tracking lives in localStorage, so
// the calendar sends its ids here after mount; this keeps a followed show's
// dates available even when the public month payload's top-24 episode budget
// does not include it.
export const dynamic = "force-dynamic";

const MAX_TRACKED_IDS = 100;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? "";

  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "bad_month", items: [] }, { status: 400 });
  }

  const ids = [
    ...new Set(
      (params.get("ids") ?? "")
        .split(",")
        .map((value) => Number(value))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ].slice(0, MAX_TRACKED_IDS);

  try {
    const items = await getTrackedCalendarEpisodes(month, ids);
    return NextResponse.json(
      { items },
      {
        headers: {
          // Personalised by the tracked ids in the query; keep it out of shared
          // caches while still allowing a short browser cache.
          "Cache-Control": "private, max-age=300",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "tracked_calendar_failed", items: [] },
      { status: 502 }
    );
  }
}
