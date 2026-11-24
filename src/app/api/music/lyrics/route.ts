import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/music/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const artist = params.get("artist")?.trim().slice(0, 160) ?? "";
  const track = params.get("track")?.trim().slice(0, 200) ?? "";
  const album = params.get("album")?.trim().slice(0, 200) ?? "";
  const durationRaw = Number(params.get("duration"));
  const duration = Number.isFinite(durationRaw) && durationRaw > 0
    ? String(Math.round(durationRaw))
    : "";

  if (!artist || !track) {
    return NextResponse.json({
      lines: [],
      plain: null,
      instrumental: false,
      source: "none",
    });
  }

  const query = new URLSearchParams({ artist, track });
  if (album) query.set("album", album);
  if (duration) query.set("duration", duration);

  try {
    const upstream = await backendFetch(`/v1/music/lyrics?${query.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({
        lines: [],
        plain: null,
        instrumental: false,
        source: "none",
      });
    }
    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error(
      "[api:music/lyrics] backend error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({
      lines: [],
      plain: null,
      instrumental: false,
      source: "none",
    });
  }
}
