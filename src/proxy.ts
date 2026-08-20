import { type NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// A well-formed detail URL is exactly /movie/<id> or /tv/<id> — one id segment,
// optional trailing slash. TMDB ids are positive integers, so a valid id is
// simply one-or-more digits.
const DETAIL_ROUTE = /^\/(?:movie|tv)\/([^/]+)\/?$/;
const NUMERIC_ID = /^\d+$/;

// ---------------------------------------------------------------------------
// Session-refresh proxy (Next.js 16 "proxy" convention — formerly `middleware`).
//
// When Supabase is configured, refresh the session cookie on each navigation so
// an expiring access token is renewed. When it is NOT configured, this is a
// pure passthrough — and crucially, the @supabase/ssr code is only pulled in via
// dynamic import inside that branch, so local mode never loads it into the Edge
// sandbox (which forbids the dynamic code-gen some of its transitive deps use).
// Result: with no env, the app behaves exactly like Phase 1.
//
// Detail-route 404 guard (runs first, in both modes):
// Each detail page has a loading.tsx, so its response body starts streaming as
// HTTP 200 before the page's own notFound() can run — turning an invalid id into
// a "soft 404" (200 + noindex) instead of a real 404. Per the Next.js guide
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// loading.md#status-codes: "ensure the resource exists before the response body
// is streamed … run this check in proxy to rewrite missing slugs to a not-found
// route"), we do the cheap synchronous shape check here — NO network fetch — and
// rewrite malformed ids (e.g. /movie/abc) to the app's not-found UI with a real
// 404 status. A numeric-but-missing id (e.g. /movie/99999999) is intentionally
// left to the page, where it remains a soft 404.
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const detail = request.nextUrl.pathname.match(DETAIL_ROUTE);
  if (detail && !NUMERIC_ID.test(detail[1])) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), {
      status: 404,
    });
  }

  if (!isSupabaseConfigured()) return NextResponse.next();
  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets, Next internals, the favicon, and
    // our bundled media clips (which never need a session).
    "/((?!_next/static|_next/image|favicon.svg|media/).*)",
  ],
};
