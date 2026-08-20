import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// ---------------------------------------------------------------------------
// Server-side Supabase client, bound to the current request's cookies.
//
// Use inside Server Components, Route Handlers, and Server Actions. Returns
// null when Supabase is not configured, so every caller can fall back to the
// anonymous (localStorage) path — the app never hard-depends on a backend.
//
// `import "server-only"` keeps this module (and any service credentials it may
// later read) out of client bundles.
// ---------------------------------------------------------------------------

export async function createClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component, where the cookie store is
          // read-only. The middleware refreshes the session cookie instead, so
          // this is safe to ignore.
        }
      },
    },
  });
}

/** The signed-in user for this request, or null (unconfigured or logged out). */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Convenience for Route Handlers: the request-scoped client together with its
 * authenticated user, or null when unconfigured OR not signed in. Routes return
 * 401 on null so the client falls back to its local (localStorage) path.
 */
export async function getSessionContext(): Promise<{
  supabase: SupabaseClient;
  user: User;
} | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

/**
 * Standard 500 for an unexpected Supabase/database error in a Route Handler.
 * Logs the detail server-side for diagnostics, but returns a GENERIC body to the
 * client: raw PostgREST/Postgres messages can name tables, columns, or
 * constraints, and there is no reason to expose that. (Not a secret leak — no
 * key/token/password is ever in these — just unnecessary internal detail.)
 * Clients treat these routes as status-only, so the generic body is invisible.
 */
export function dbErrorResponse(
  scope: string,
  error: { message: string }
): NextResponse {
  console.error(`[api:${scope}] database error:`, error.message);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}
