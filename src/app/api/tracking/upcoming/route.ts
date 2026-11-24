import { NextResponse } from "next/server";
import { isMonthKey, monthKey } from "@/lib/calendar";
import { getTrackedShowStatus } from "@/lib/release-calendar";
import { resolveTrackedIds } from "@/lib/tracking-server";

// Enriched schedule for the viewer's followed shows: status, next/last episode
// and the episodes airing in the requested month. The Following timeline and
// the notification surfaces both use it. Anonymous callers pass their local
// ids; signed-in callers may omit them and use their server-side follows.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const monthParam = params.get("month");
  const month = isMonthKey(monthParam) ? monthParam : monthKey();

  try {
    const { ids, truncated } = await resolveTrackedIds(params.get("ids"));
    const result = await getTrackedShowStatus(month, ids);
    return NextResponse.json(
      { month, ...result, truncated: truncated || result.truncated },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "tracking_upcoming_failed", month, shows: [], items: [] },
      { status: 502 }
    );
  }
}
