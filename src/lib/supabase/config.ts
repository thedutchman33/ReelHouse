// Public Supabase configuration.
//
// These NEXT_PUBLIC_ values are intentionally shipped to the browser and are
// safe to publish — the anon key can only do what row-level security allows.
// Server-only secrets (e.g. the service-role key) are read elsewhere and never
// exposed here. Mirrors the mock-vs-live toggle in lib/tmdb.ts.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

/**
 * True when Supabase auth + persistence are configured. When false the app runs
 * in "local mode": anonymous, with the library persisted in localStorage.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
