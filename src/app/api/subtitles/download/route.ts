import { NextResponse } from "next/server";
import {
  downloadSubtitleVtt,
  isDownloadConfigured,
  OpenSubtitlesError,
} from "@/lib/opensubtitles";

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
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
