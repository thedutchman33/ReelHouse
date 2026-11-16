"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isExpiredAuthLink } from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import AuthDialog, { ACCOUNT_MENU_RETURN_KEY, type AuthTab } from "./AuthDialog";

// ---------------------------------------------------------------------------
// Shared account/session state.
//
// The navbar, settings page and auth modal all read one session and one auth
// dialog. Keeping that in a single client provider means opening the dialog
// from the navbar, the settings "Sign in" row, or the signed-in account panel
// always produces the same flow.
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  configured: boolean;
  openAuth: (tab?: AuthTab, next?: string) => void;
  closeAuth: () => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Increments once after a completed sign-in so the account menu can open. */
  accountMenuSignal: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function displayNameFor(user: User | null): string {
  const metadata = user?.user_metadata ?? {};
  const candidate = metadata.username ?? metadata.full_name ?? metadata.name;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return user?.email?.split("@")[0] ?? "Account";
}

export function avatarUrlFor(user: User | null): string | null {
  const candidate = user?.user_metadata?.avatar_url;
  return typeof candidate === "string" && /^https?:\/\//i.test(candidate)
    ? candidate
    : null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!configured);
  const [dialog, setDialog] = useState<{ tab: AuthTab; next: string } | null>(null);
  const [accountMenuSignal, setAccountMenuSignal] = useState(0);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }

    // A Google sign-in leaves the page; this flag tells the returning mount to
    // open the account menu once the session has been restored.
    const openMenuOnReturn = (() => {
      try {
        const pending =
          window.sessionStorage.getItem(ACCOUNT_MENU_RETURN_KEY) === "1";
        if (pending) window.sessionStorage.removeItem(ACCOUNT_MENU_RETURN_KEY);
        return pending;
      } catch {
        return false;
      }
    })();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setReady(true);
      if (data.user && openMenuOnReturn) {
        setAccountMenuSignal((value) => value + 1);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [configured]);

  const refreshUser = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    setUser(data.user ?? null);
  }, []);

  const openAuth = useCallback((tab: AuthTab = "login", next?: string) => {
    setDialog({
      tab,
      next:
        next ??
        (typeof window === "undefined"
          ? "/settings"
          : `${window.location.pathname}${window.location.search}`),
    });
  }, []);

  const closeAuth = useCallback(() => setDialog(null), []);

  // Old /login links now land here through the redirect in next.config.mjs.
  // Open the dialog, then strip the handoff param so closing it leaves a clean URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth !== "login" && auth !== "signup") return;
    params.delete("auth");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
    );
    openAuth(auth, window.location.pathname || "/");
  }, [openAuth]);

  // Supabase reports an expired emailed link on the project's Site URL, often
  // the homepage, with the error in both the query string and the hash. Server
  // routes never see the fragment, so forward both shapes to the page that can
  // request a fresh link and explain what happened.
  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/") {
      return;
    }
    if (!isExpiredAuthLink(window.location.search, window.location.hash)) return;

    window.history.replaceState(null, "", "/");
    router.replace("/forgot-password?error=link_invalid");
  }, [router]);

  const signOut = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }, [router]);

  const onSignedIn = useCallback(() => {
    setDialog(null);
    setAccountMenuSignal((value) => value + 1);
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      ready,
      configured,
      openAuth,
      closeAuth,
      signOut,
      refreshUser,
      accountMenuSignal,
    }),
    [user, ready, configured, openAuth, closeAuth, signOut, refreshUser, accountMenuSignal]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog
        open={dialog !== null}
        initialTab={dialog?.tab ?? "login"}
        next={dialog?.next ?? "/settings"}
        onClose={closeAuth}
        onSignedIn={onSignedIn}
      />
    </AuthContext.Provider>
  );
}
