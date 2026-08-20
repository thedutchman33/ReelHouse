"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// ---------------------------------------------------------------------------
// Browser Supabase client (singleton).
//
// Used by client components to read the current session and subscribe to auth
// state changes. Only ever holds the public anon key — every table is guarded
// by row-level security, so this cannot read another user's rows.
//
// Returns null when Supabase is not configured; callers then behave anonymously.
// ---------------------------------------------------------------------------

let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) {
    cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cached;
}
