import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/music/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Sign in to load your music profile" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const refresh = params.get("refresh") === "1" ? "?refresh=1" : "";
  try {
    const upstream = await backendFetch(`/v1/music/profile${refresh}`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[api:music/profile] backend error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Music profile is unavailable" }, { status: 502 });
  }
}
