import { NextResponse } from "next/server";
import { getF1Schedule } from "@/lib/f1";
import { getCricketDashboard } from "@/lib/cricket";
import { cricketLiveWindow, f1LiveWindow, type LiveFeed } from "@/lib/live-windows";

// The navbar's LIVE badge and the home hero's live posters both read this. It is
// deliberately small: just the next F1 session and the featured cricket match,
// with their Watch Live windows. The full schedule/dashboard payloads stay on
// their own pages.
//
// Both sources are optional: a failed one simply reports null, and the client
// keeps whatever it had while the next poll retries.
export async function GET() {
  const now = Date.now();
  const [schedule, cricket] = await Promise.allSettled([
    getF1Schedule(),
    getCricketDashboard("men"),
  ]);

  const feed: LiveFeed = {
    f1:
      schedule.status === "fulfilled" && schedule.value
        ? f1LiveWindow(schedule.value, now)
        : null,
    cricket:
      cricket.status === "fulfilled" ? cricketLiveWindow(cricket.value, now) : null,
  };

  return NextResponse.json(feed, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=90" },
  });
}
