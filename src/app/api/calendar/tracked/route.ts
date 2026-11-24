import { NextResponse } from "next/server";
import { isMonthKey } from "@/lib/calendar";
import { getTrackedShowStatus } from "@/lib/release-calendar";
import { resolveTrackedIds } from "@/lib/tracking-server";

// Episodes for the viewer's followed series. The calendar sends its local ids
// here after mount; signed-in callers can omit them and use their server-side
// follows. Each show's detail request also yields next/last/status, which lets
// the calendar's empty state name the next episode instead of showing a dead
// month.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? "";

  if (!isMonthKey(month)) {
    return NextResponse.json({ error: "bad_month", items: [] }, { status: 400 });
  }

  try {
    const { ids, truncated } = await resolveTrackedIds(params.get("ids"));
    const result = await getTrackedShowStatus(month, ids);
    return NextResponse.json(
      {
        items: result.items,
        nextUp: result.nextUp,
        truncated: truncated || result.truncated,
      },
      {
        headers: {
          // Personalised by the followed ids in the query; keep it out of shared
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
