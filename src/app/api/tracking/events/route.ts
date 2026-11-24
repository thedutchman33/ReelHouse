import { NextResponse } from "next/server";
import { dbErrorResponse, getSessionContext } from "@/lib/supabase/server";
import type { TrackingEventType } from "@/lib/library";

// Append-only tracking analytics. Signed out this is a no-op (401), which the
// client ignores — adoption is measured for accounts, not anonymous traffic.
export const dynamic = "force-dynamic";

const EVENTS = new Set<TrackingEventType>([
  "track",
  "untrack",
  "preference",
  "notification_click",
  "notification_open",
]);

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: {
    event_type?: string;
    media_id?: string | null;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.event_type || !EVENTS.has(body.event_type as TrackingEventType)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  const { error } = await ctx.supabase.from("tracking_events").insert({
    user_id: ctx.user.id,
    media_id: body.media_id ?? null,
    event_type: body.event_type,
    metadata:
      body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  });

  if (error) return dbErrorResponse("tracking-events", error);
  return NextResponse.json({ ok: true });
}
