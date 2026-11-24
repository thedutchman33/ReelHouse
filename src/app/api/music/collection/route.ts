import { NextResponse } from "next/server";
import { getMusicCollection } from "@/lib/music/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });
  }
  const kind = url.searchParams.get("kind") === "album" ? "album" : "playlist";
  try {
    const collection = await getMusicCollection(id, kind);
    return NextResponse.json(collection, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error(
      "[api:music/collection] catalog error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Collection is temporarily unavailable" }, { status: 502 });
  }
}
