import { NextResponse } from "next/server";
import { getSessionContext, dbErrorResponse } from "@/lib/supabase/server";
import type { TrackedEntry } from "@/lib/library";
import type { TrackingNotify } from "@/lib/tracking";
import type { MediaSummary } from "@/types";

// RLS-scoped series tracking. Same shape and auth contract as the watchlist
// route: every row is guarded by auth.uid() = user_id, and 401 tells the client
// to stay on its localStorage path.
export const dynamic = "force-dynamic";

const UNAUTH = NextResponse.json({ error: "Not signed in" }, { status: 401 });

function validNotify(value: unknown): TrackingNotify {
  return value === "premieres" || value === "off" ? value : "all";
}

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  const { data, error } = await ctx.supabase
    .from("tracked")
    .select("media_snapshot, notify, tracked_at")
    .order("tracked_at", { ascending: false });

  if (error) return dbErrorResponse("tracking", error);

  const entries = (data ?? [])
    .map((row): TrackedEntry | null => {
      const media = row.media_snapshot as MediaSummary;
      if (!media?.id) return null;
      return {
        media,
        notify: validNotify(row.notify),
        trackedAt: new Date(row.tracked_at).getTime(),
      };
    })
    .filter((entry): entry is TrackedEntry => entry !== null);

  return NextResponse.json(
    { entries },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  let body: {
    action?: "track" | "untrack";
    entry?: TrackedEntry;
    media_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "track") {
    const entry = body.entry;
    if (!entry?.media?.id) {
      return NextResponse.json({ error: "Missing entry" }, { status: 400 });
    }
    const { error } = await ctx.supabase.from("tracked").upsert(
      {
        user_id: ctx.user.id,
        media_id: entry.media.id,
        media_snapshot: entry.media,
        notify: validNotify(entry.notify),
        tracked_at: new Date(entry.trackedAt || Date.now()).toISOString(),
      },
      { onConflict: "user_id,media_id" }
    );
    if (error) return dbErrorResponse("tracking", error);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "untrack") {
    const mediaId = body.entry?.media.id ?? body.media_id;
    if (!mediaId) {
      return NextResponse.json({ error: "Missing media id" }, { status: 400 });
    }
    const { error } = await ctx.supabase
      .from("tracked")
      .delete()
      .eq("user_id", ctx.user.id)
      .eq("media_id", mediaId);
    if (error) return dbErrorResponse("tracking", error);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE() {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  const { error } = await ctx.supabase
    .from("tracked")
    .delete()
    .eq("user_id", ctx.user.id);
  if (error) return dbErrorResponse("tracking", error);
  return NextResponse.json({ ok: true });
}
