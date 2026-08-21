import { NextResponse } from "next/server";
import {
  downloadSubtitleVtt,
  isDownloadConfigured,
  OpenSubtitlesError,
} from "@/lib/opensubtitles";
import { clientKeyFrom, createRateLimiter } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/subtitles/download?fileId=123456
//
// Resolves a selected OpenSubtitles file to WebVTT text, server-side. Requires a
// configured OpenSubtitles account (username + password → bearer token) and
// counts against that account's daily download quota. Credentials never leave
// the server; the client only ever receives the finished VTT text.
//
// Responses (always JSON; the client switches on `status`):
//   { status: "ok",             vtt, fileName, remaining? }
//   { status: "not_configured", message }   // no account configured
//   { status: "quota",          message }    // daily limit reached
//   { status: "error",          code, message }
//
// This is the expensive one: unauthenticated, and every success consumes one of
// a finite number of downloads the OpenSubtitles account gets per day. It is
// therefore limited harder than search. Single-instance, best-effort — see
// src/lib/rate-limit.ts for exactly what that does and does not protect.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

// Module scope on purpose: the counters have to outlive individual requests.
// A person picking subtitles clicks a handful of times; 10/min is far above
// that and far below anything that could drain the daily quota.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function GET(request: Request) {
  // Note the deliberate distinction from the `quota` branch below, which is
  // also a 429: that one means OpenSubtitles refused us for the rest of the
  // day, this one means one caller is going too fast. Reported as
  // `code: "rate_limited"` under the route's existing error shape, which the
  // player already renders via its generic message branch.
  const gate = limiter.check(clientKeyFrom(request.headers), Date.now());
  if (!gate.allowed) {
    return NextResponse.json(
      {
        status: "error",
        code: "rate_limited",
        message: "Too many subtitle downloads. Wait a moment, then try again.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(gate.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const fileId = Number(searchParams.get("fileId"));

  if (!Number.isFinite(fileId) || fileId <= 0) {
    return NextResponse.json(
      { status: "error", code: "bad_request", message: "Invalid subtitle file id." },
      { status: 400 }
    );
  }

  if (!isDownloadConfigured()) {
    return NextResponse.json(
      {
        status: "not_configured",
        message:
          "Loading a subtitle into the player needs an OpenSubtitles account (username + password) configured on the server.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await downloadSubtitleVtt(fileId);
    return NextResponse.json(
      { status: "ok", ...result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const err = e instanceof OpenSubtitlesError ? e : null;
    const code = err?.code ?? "upstream";
    const message = err?.message ?? "Couldn't load the subtitle.";
    if (code === "not_configured") {
      return NextResponse.json({ status: "not_configured", message }, { status: 503 });
    }
    if (code === "quota") {
      return NextResponse.json({ status: "quota", message }, { status: 429 });
    }
    return NextResponse.json({ status: "error", code, message }, { status: 502 });
  }
}
