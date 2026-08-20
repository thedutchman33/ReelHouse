import { NextResponse } from "next/server";
import { getSessionContext, dbErrorResponse } from "@/lib/supabase/server";
import type { EpisodeRef, ProgressEntry } from "@/lib/library";
import type { MediaSummary } from "@/types";

// RLS-scoped watch history / playback progress (one row per user+media+episode).
// Maps `watch_history` rows to the ProgressEntry shape the client library uses.
export const dynamic = "force-dynamic";

const UNAUTH = NextResponse.json({ error: "Not signed in" }, { status: 401 });

function keyFor(mediaId: string, episode: EpisodeRef | null): string {
  return episode
    ? `${mediaId}:s${episode.seasonNumber}e${episode.episodeNumber}`
    : mediaId;
}

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  const { data, error } = await ctx.supabase
    .from("watch_history")
    .select(
      "media_snapshot, episode_snapshot, position_seconds, duration_seconds, completed, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return dbErrorResponse("history", error);
  }

  const entries: ProgressEntry[] = (data ?? [])
    .map((row): ProgressEntry | null => {
      const media = row.media_snapshot as MediaSummary;
      if (!media || !media.id) return null;
      const episode = (row.episode_snapshot as EpisodeRef | null) ?? null;
      return {
        key: keyFor(media.id, episode),
        media,
        episode,
        position: row.position_seconds ?? 0,
        duration: row.duration_seconds ?? 0,
        updatedAt: new Date(row.updated_at).getTime(),
        completed: Boolean(row.completed),
      };
    })
    .filter((e): e is ProgressEntry => e !== null);

  return NextResponse.json(
    { entries },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  let body: { entry?: ProgressEntry };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entry = body.entry;
  // `duration` is 0 until the playback surface can report one (an embed provider
  // reports a position only if it documents progress events), so a "started"
  // entry is valid and stored with a NULL duration — `duration_seconds` is
  // nullable and GET maps NULL back to 0, which round-trips exactly.
  if (
    !entry?.media?.id ||
    !Number.isFinite(entry.duration) ||
    entry.duration < 0 ||
    !Number.isFinite(entry.position) ||
    entry.position < 0
  ) {
    return NextResponse.json({ error: "Invalid entry" }, { status: 400 });
  }

  const { error } = await ctx.supabase.from("watch_history").upsert(
    {
      user_id: ctx.user.id,
      media_id: entry.media.id,
      season_number: entry.episode?.seasonNumber ?? null,
      episode_number: entry.episode?.episodeNumber ?? null,
      media_snapshot: entry.media,
      episode_snapshot: entry.episode ?? null,
      position_seconds: entry.position,
      duration_seconds: entry.duration > 0 ? entry.duration : null,
      completed: entry.completed,
      updated_at: new Date(entry.updatedAt).toISOString(),
    },
    { onConflict: "user_id,media_id,episode_key" }
  );

  if (error) {
    return dbErrorResponse("history", error);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return UNAUTH;

  const url = new URL(request.url);
  const mediaId = url.searchParams.get("media_id");

  // No media id → clear the caller's entire history.
  if (!mediaId) {
    const { error } = await ctx.supabase
      .from("watch_history")
      .delete()
      .eq("user_id", ctx.user.id);
    if (error) {
      return dbErrorResponse("history", error);
    }
    return NextResponse.json({ ok: true });
  }

  // Otherwise remove the single (media, episode) row. Empty season/episode
  // means a movie → match the NULL rows precisely.
  const season = url.searchParams.get("season");
  const episode = url.searchParams.get("episode");

  let query = ctx.supabase
    .from("watch_history")
    .delete()
    .eq("user_id", ctx.user.id)
    .eq("media_id", mediaId);

  query =
    season != null && season !== ""
      ? query.eq("season_number", Number(season))
      : query.is("season_number", null);
  query =
    episode != null && episode !== ""
      ? query.eq("episode_number", Number(episode))
      : query.is("episode_number", null);

  const { error } = await query;
  if (error) {
    return dbErrorResponse("history", error);
  }
  return NextResponse.json({ ok: true });
}
