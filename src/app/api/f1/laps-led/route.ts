import { NextResponse } from "next/server";
import { getLapsLed } from "@/lib/laps-led";

// Laps led only change when a race is classified, so the route caches like the
// standings route. The data layer keeps its own short per-driver cache because
// one request per completed round goes to Jolpica — several seconds on a cold
// driver, instant afterwards.
export const revalidate = 600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season"));
  const driverId = (url.searchParams.get("driver") ?? "").trim();
  const currentYear = new Date().getUTCFullYear();

  // The caller already holds the season's completed rounds (the stats tab is
  // rendered from that payload), so it passes them in: one fewer season fetch.
  const rounds = [
    ...new Set(
      (url.searchParams.get("rounds") ?? "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isInteger(n) && n > 0 && n < 100)
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, 40);

  if (!Number.isFinite(season) || season < 1950 || season > currentYear + 1 || !driverId) {
    return NextResponse.json({ error: "season and driver are required" }, { status: 400 });
  }

  try {
    const laps = await getLapsLed(season, driverId, rounds);
    return NextResponse.json(laps, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laps led unavailable", season, driverId },
      { status: 502 }
    );
  }
}
