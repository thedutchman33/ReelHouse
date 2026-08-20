import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeRedirectPath } from "@/lib/auth";
import { buildRedirectUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Supabase email-link callback.
//
// Links Supabase mails out (password recovery today, any confirmation later)
// land here. This handler trades the one-time credential in the query string for
// a session cookie, then forwards the visitor to `next`.
//
// Two link shapes are handled, because which one arrives depends on the
// project's email template:
//
//   ?code=…                      The PKCE default. Both Supabase clients in this
//                                project run flowType "pkce", and @supabase/ssr
//                                keeps the PKCE verifier in a cookie — which is
//                                why the exchange can happen here, server-side,
//                                instead of in the browser.
//
//   ?token_hash=…&type=recovery  The template variant ({{ .TokenHash }}). It
//                                needs no verifier, so it is also the only shape
//                                that works when the link is opened on a
//                                different device than the one that asked for it.
//
// It reuses the existing request-scoped client from @/lib/supabase/server, so
// there is exactly one auth client and one session mechanism in the app. Nothing
// secret is logged, and no token is stored anywhere but the session cookie the
// Supabase client writes.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // A dead link belongs back on the page that can mint a new one. Only a fixed
  // code travels in the URL — never Supabase's raw error text, never anything
  // the visitor typed.
  //
  // The base origin comes from `buildRedirectUrl`, not from `request.url`: in a
  // Route Handler that URL carries the server's own bind address (localhost:3000
  // inside an Amplify Lambda), not the public origin. See src/lib/site-url.ts.
  const failed = () => {
    const target = next.startsWith("/reset-password")
      ? "/forgot-password"
      : "/login";
    const url = buildRedirectUrl(target, request);
    url.searchParams.set("error", "link_invalid");
    return NextResponse.redirect(url);
  };

  // Supabase reports a refused link (expired, already used) with its own error
  // params instead of a credential.
  if (searchParams.has("error") || searchParams.has("error_description")) {
    return failed();
  }

  const supabase = await createClient();
  if (!supabase) return failed();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed();
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) return failed();
  } else {
    return failed();
  }

  return NextResponse.redirect(buildRedirectUrl(next, request));
}
