import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Session-cookie refresh, factored out of src/middleware.ts so that the heavy
// @supabase/ssr import is loaded (via dynamic import) ONLY when Supabase is
// configured. In local mode this module is never evaluated — which matters in
// the Edge middleware sandbox, where @supabase/supabase-js's transitive code
// would otherwise trip "code generation from strings disallowed" at load.
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Must be the first call after client creation (Supabase SSR guidance): it
  // refreshes an expiring token and writes the new cookie onto `response`.
  await supabase.auth.getUser();

  return response;
}
