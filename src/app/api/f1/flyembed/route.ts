import { NextResponse } from "next/server";
import { resolveFlyEmbedUrl } from "@/lib/flyembed";

// ---------------------------------------------------------------------------
// GET /api/f1/flyembed
//
// Same-origin iframe target for the "FlyEmbed Auto" F1 server. Resolves the
// current F1 event in FlyEmbed's feed and redirects to its embed page; falls
// back to the local placeholder when the feed has no F1 event.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const target = await resolveFlyEmbedUrl();
  return NextResponse.redirect(new URL(target, request.url), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
