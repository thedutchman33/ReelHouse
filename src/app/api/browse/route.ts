import { NextResponse } from "next/server";
import { parseBrowseFilters } from "@/lib/browse";
import { getBrowseResults } from "@/lib/tmdb";

// Browse results API — powers the static Movies / TV Shows / Browse shells.
// The pages themselves are prerendered (no server data dependency), and this
// route delivers the grid JSON client-side. Popular filter combinations are
// edge-cached by Vercel via s-maxage, which is what makes repeat filter picks
// feel instant.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = parseBrowseFilters(Object.fromEntries(searchParams.entries()));

  try {
    const page = await getBrowseResults(filters);
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      { items: [], page: 1, totalPages: 0, error: "browse_failed" },
      { status: 502 }
    );
  }
}
