import { NextResponse } from "next/server";
import { backendJson } from "@/lib/music/backend";

// Live YouTube Music search suggestions, proxied so the browser never holds a
// backend credential. Suggestions are real catalog queries, not synthesized
// variants of the user's text.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const data = await backendJson<{ suggestions?: unknown }>(
      `/v1/music/suggestions?q=${encodeURIComponent(query)}`,
      { revalidate: 120 }
    );
    const suggestions = Array.isArray(data.suggestions)
      ? data.suggestions
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return NextResponse.json(
      { suggestions },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    // Suggestions are additive; the search itself still works.
    return NextResponse.json({ suggestions: [] });
  }
}
