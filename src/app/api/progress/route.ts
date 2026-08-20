import { NextResponse } from "next/server";
import { getSessionContext, dbErrorResponse } from "@/lib/supabase/server";

// Append-only playback analytics (PRD §4 `playback_events`). Fire-and-forget
// from the player; RLS lets a user insert/read only their own events. Never
// updated. Silent 401 for anonymous users — analytics simply aren't recorded.
export const dynamic = "force-dynamic";

const EVENT_TYPES = ["play", "pause", "ended", "seek", "progress"] as const;
type EventType = (typeof EVENT_TYPES)[number];

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: {
    media_id?: string;
    season?: number | null;
    episode?: number | null;
    event_type?: EventType;
    position?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body.media_id ||
    !body.event_type ||
    !EVENT_TYPES.includes(body.event_type)
  ) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const { error } = await ctx.supabase.from("playback_events").insert({
    user_id: ctx.user.id,
    media_id: body.media_id,
    season_number: body.season ?? null,
    episode_number: body.episode ?? null,
    event_type: body.event_type,
    position_seconds: body.position ?? null,
  });

  if (error) {
    return dbErrorResponse("playback", error);
  }
  return NextResponse.json({ ok: true });
}
