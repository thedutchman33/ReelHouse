import { NextResponse } from "next/server";
import { getMusicArtist } from "@/lib/music/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
  }
  try {
    const data = await getMusicArtist(id);
    if (!data) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error(
      "[api:music/artist] catalog error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Artist is temporarily unavailable" }, { status: 502 });
  }
}
