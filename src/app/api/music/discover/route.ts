import { NextResponse } from "next/server";
import { getMusicHome } from "@/lib/music/catalog";

// The home payload is composed from two live providers. It must be resolved at
// request time; a build-time static snapshot would freeze one provider's view
// and miss the other entirely. Provider responses still use the Next data
// cache, and the route advertises a CDN cache window below.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getMusicHome();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error(
      "[api:music/discover] catalog error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Music discovery is temporarily unavailable" },
      { status: 502 }
    );
  }
}
