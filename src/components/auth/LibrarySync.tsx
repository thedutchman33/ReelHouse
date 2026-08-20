"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { syncOnSignIn, syncOnSignOut } from "@/lib/library";

// Bridges Supabase auth state to the library store. Renders nothing. Mounted
// once in the root layout. No-op when Supabase is unconfigured, so the app runs
// exactly like Phase 1.
export default function LibrarySync() {
  const syncedUser = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    // onAuthStateChange emits INITIAL_SESSION on mount (current session),
    // SIGNED_IN / SIGNED_OUT on changes, and TOKEN_REFRESHED periodically.
    // Dedupe by user id so a token refresh doesn't re-run the sync.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      if (uid) {
        if (syncedUser.current !== uid) {
          syncedUser.current = uid;
          void syncOnSignIn(uid);
        }
      } else if (syncedUser.current !== null) {
        syncedUser.current = null;
        syncOnSignOut();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
