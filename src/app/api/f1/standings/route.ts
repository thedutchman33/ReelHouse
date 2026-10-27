import { NextResponse } from "next/server";
import { getSeasonPayload, getSeasons } from "@/lib/standings";

// Championship data changes only after a race, so the route caches hard at the
// edge. The data layer keeps a short in-process cache for the season itself
// (Jolpica pages are 100 rows, so one season is a handful of requests).
export const revalidate = 600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("season"));
  const currentYear = new Date().getUTCFullYear();
  const season =
    Number.isFinite(requested) && requested >= 1950 && requested <= currentYear + 1
      ? requested
      : currentYear;

  try {
    // The season list is only the selector's options; a failure there must not
    // hide a perfectly good championship table.
    const [payload, seasons] = await Promise.all([
      getSeasonPayload(season),
      getSeasons().catch(() => [] as number[]),
    ]);
    return NextResponse.json(
      { season, seasons, payload },
      {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Standings unavailable", season },
      { status: 502 }
    );
  }
}
