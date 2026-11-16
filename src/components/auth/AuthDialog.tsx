"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleIcon } from "@/components/account/icons";
import {
  PASSWORD_HINT,
  confirmPasswordError,
  passwordRuleError,
  signInErrorMessage,
  signUpErrorMessage,
} from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LINK_CLASS,
  AUTH_NOTICE_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-ui";
import ForgotPasswordForm from "./ForgotPasswordForm";

export type AuthTab = "login" | "signup";

/** Survives the Google OAuth redirect so the account menu can open on return. */
export const ACCOUNT_MENU_RETURN_KEY = "reelhouse:open-account-menu";

const revealButtonClass =
  "absolute inset-y-0 right-2 my-auto h-8 rounded-md px-2 text-[11px] font-medium text-zinc-400 transition hover:text-white";

export default function AuthDialog({
  open,
  initialTab,
  next,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  initialTab: AuthTab;
  next: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const configured = isSupabaseConfigured();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const signup = tab === "signup";

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setError(null);
    setNotice(null);
    setForgot(false);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLInputElement>("input[data-autofocus]")
        ?.focus();
    }, 40);
    return () => window.clearTimeout(focusTimer);
  }, [open, tab, forgot]);

  if (!open) return null;

  function callbackUrl(): string {
    const origin = window.location.origin;
    return `${origin}/auth/callback?next=${encodeURIComponent(next.startsWith("/") ? next : "/settings")}`;
  }

  function switchMode(nextTab: AuthTab) {
    setTab(nextTab);
    setForgot(false);
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setError(null);
    setNotice(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Email and password are both required.");
      return;
    }
    if (signup) {
      const ruleError = passwordRuleError(password);
      if (ruleError) {
        setError(ruleError);
        return;
      }
      const mismatch = confirmPasswordError(password, confirm);
      if (mismatch) {
        setError(mismatch);
        return;
      }
    }

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Accounts aren't enabled on this deployment.");
      return;
    }

    setBusy(true);
    try {
      if (signup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (signUpError) {
          setError(signUpErrorMessage(signUpError));
          return;
        }
        if (data.session) {
          onSignedIn();
          return;
        }
        setNotice(
          "Account created. Check your email to confirm it, then log in with your password."
        );
        setTab("login");
        setPassword("");
        setConfirm("");
        setShowPassword(false);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          setError(signInErrorMessage(signInError));
          return;
        }
        onSignedIn();
      }
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Accounts aren't enabled on this deployment.");
      return;
    }
    // The OAuth round-trip reloads the page, so the "open the account menu"
    // intent has to live outside React state until /auth/callback returns.
    try {
      window.sessionStorage.setItem(ACCOUNT_MENU_RETURN_KEY, "1");
    } catch {
      /* private mode / storage disabled */
    }
    setBusy(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) {
        try {
          window.sessionStorage.removeItem(ACCOUNT_MENU_RETURN_KEY);
        } catch {
          /* ignore */
        }
        setError(
          `Google ${signup ? "sign-up" : "sign-in"} isn't configured for this deployment.`
        );
      }
    } catch {
      try {
        window.sessionStorage.removeItem(ACCOUNT_MENU_RETURN_KEY);
      } catch {
        /* ignore */
      }
      setError(
        `Google ${signup ? "sign-up" : "sign-in"} isn't configured for this deployment.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgb(0_0_0/0.88)] p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        className="nm-glass max-h-[calc(100svh-2rem)] w-full max-w-sm overflow-y-auto rounded-[16px] p-6 text-zinc-100 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 id="auth-dialog-title" className="text-lg font-semibold">
              {forgot
                ? "Reset your password"
                : signup
                  ? "Create your account"
                  : "Log in to Reelhouse"}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {forgot
                ? "Enter the email address on your account and we’ll send you a link to choose a new password."
                : signup
                  ? "Create an account with Google or your email and a password."
                  : "Welcome back. Continue with Google or your email and password."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 px-2 text-xl leading-none text-zinc-400 transition hover:text-white"
          >
            ×
          </button>
        </div>

        {!forgot && (
        <div
          role="tablist"
          aria-label="Account action"
          className="nm-inset mb-4 flex gap-1 rounded-lg p-1 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!signup}
            disabled={busy}
            onClick={() => switchMode("login")}
            className={`nm-tab flex-1 rounded-md py-1.5 font-semibold ${
              !signup ? "nm-raise text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={signup}
            disabled={busy}
            onClick={() => switchMode("signup")}
            className={`nm-tab flex-1 rounded-md py-1.5 font-semibold ${
              signup ? "nm-raise text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            Sign up
          </button>
        </div>
        )}

        {!forgot && (
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="mb-3 inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/15 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-60"
        >
          <GoogleIcon size={17} />
          {signup ? "Sign up with Google" : "Log in with Google"}
        </button>
        )}

        {!forgot && (
        <div className="mb-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            or use email
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        )}

        {forgot ? (
          <ForgotPasswordForm onBack={() => setForgot(false)} />
        ) : (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="auth-email" className="block text-xs text-zinc-400">
            Email
          </label>
          <input
            id="auth-email"
            data-autofocus
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={AUTH_INPUT_CLASS}
          />

          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="auth-password" className="block text-xs text-zinc-400">
              Password
            </label>
            {!signup && (
              <button
                type="button"
                onClick={() => {
                  setForgot(true);
                  setError(null);
                  setNotice(null);
                }}
                className={AUTH_LINK_CLASS}
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className={`${AUTH_INPUT_CLASS} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className={revealButtonClass}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {signup && (
            <p className="text-[11px] leading-snug text-zinc-500">{PASSWORD_HINT}</p>
          )}

          {signup && (
            <>
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs text-zinc-400"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="auth-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Type it again"
                  className={`${AUTH_INPUT_CLASS} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                  className={revealButtonClass}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className={AUTH_PRIMARY_BUTTON_CLASS}
          >
            {busy
              ? signup
                ? "Creating account…"
                : "Logging in…"
              : signup
                ? "Create account"
                : "Log in"}
          </button>
        </form>
        )}

        {!forgot && !configured && (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            Accounts aren&apos;t enabled on this deployment, so the form can&apos;t
            complete a sign-in here.
          </p>
        )}
        {!forgot && error && (
          <p role="alert" className={`mt-3 ${AUTH_ERROR_CLASS}`}>
            {error}
          </p>
        )}
        {!forgot && notice && !error && (
          <p role="status" className={`mt-3 ${AUTH_NOTICE_CLASS}`}>
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
