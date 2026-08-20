import { NextResponse } from "next/server";
import { getSessionContext, dbErrorResponse } from "@/lib/supabase/server";
import type { MediaSummary } from "@/types";

// RLS-scoped watchlist. Every row is guarded by `auth.uid() = user_id`, so this
// route can only ever read or mutate the caller's own rows. Returns 401 when
// there is no signed-in user (or Supabase is unconfigured) — the client then
// stays on its localStorage path.
export const dynamic = "force-dynamic";

const UNAUTH = NextResponse.json({ error: "Not signed in" }, { status: 401 });

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  const { data, error } = await ctx.supabase
    .from("watchlist")
    .select("media_snapshot, added_at")
    .order("added_at", { ascending: false });

  if (error) {
    return dbErrorResponse("watchlist", error);
  }

  const items = (data ?? [])
    .map((row) => row.media_snapshot as MediaSummary)
    .filter((m): m is MediaSummary => Boolean(m && m.id));

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  let body: { action?: "add" | "remove"; item?: MediaSummary; media_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, item } = body;

  if (action === "add") {
    if (!item?.id) {
      return NextResponse.json({ error: "Missing item" }, { status: 400 });
    }
    const { error } = await ctx.supabase.from("watchlist").upsert(
      {
        user_id: ctx.user.id,
        media_id: item.id,
        media_snapshot: item,
      },
      { onConflict: "user_id,media_id" }
    );
    if (error) {
      return dbErrorResponse("watchlist", error);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    const id = item?.id ?? body.media_id;
    if (!id) {
      return NextResponse.json({ error: "Missing media id" }, { status: 400 });
    }
    const { error } = await ctx.supabase
      .from("watchlist")
      .delete()
      .eq("user_id", ctx.user.id)
      .eq("media_id", id);
    if (error) {
      return dbErrorResponse("watchlist", error);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
