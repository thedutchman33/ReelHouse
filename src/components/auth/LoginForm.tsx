"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type AuthMode,
  PASSWORD_HINT,
  authModeQuery,
  confirmPasswordError,
  passwordRuleError,
  signInErrorMessage,
  signUpErrorMessage,
} from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/client";

// Which input a message belongs to, so the offending field can carry
// `aria-invalid` and point at the message with `aria-describedby` instead of the
// message only existing as a detached paragraph. "credentials" marks both email
// and password, which is exactly what a rejected sign-in means: one of the two is
// wrong and the server won't say which. "form" is for anything no single field
// caused.
type ErrorTarget = "email" | "password" | "confirm" | "credentials" | "form";

const inputClass =
  "rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20";

// Referenced by aria-describedby, so both need stable ids.
const ERROR_ID = "auth-error";
const RULE_ID = "password-rule";

export default function LoginForm({
  initialMode = "signin",
}: {
  // Comes from `?mode=` on the server, so a link straight to sign-up renders as
  // sign-up rather than flashing the sign-in form first.
  initialMode?: AuthMode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    target: ErrorTarget;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signup = mode === "signup";
  const emailInvalid = error?.target === "email" || error?.target === "credentials";
  const passwordInvalid =
    error?.target === "password" || error?.target === "credentials";
  const confirmInvalid = error?.target === "confirm";

  function fail(target: ErrorTarget, message: string) {
    setError({ target, message });
  }

  // Switching mode gives the new view its URL without navigating: replaceState
  // keeps this form mounted — a half-typed email survives the switch — while the
  // address bar and Next's router both follow along. It replaces rather than
  // pushes so the toggle doesn't stack history entries that Back has to unwind.
  function applyMode(next: AuthMode) {
    setMode(next);
    if (typeof window === "undefined") return;
    const { pathname, search } = window.location;
    window.history.replaceState(
      null,
      "",
      `${pathname}${authModeQuery(search, next)}`
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const supabase = getBrowserSupabase();
    if (!supabase) {
      fail("form", "Accounts are not enabled on this deployment.");
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      // Same sentence as always; the target just points at the first empty one so
      // the message is attached to a field rather than floating.
      fail(cleanEmail ? "password" : "email", "Email and password are both required.");
      return;
    }
    if (signup) {
      // Shared with the password-reset screen, so both state the same rule.
      const ruleError = passwordRuleError(password);
      if (ruleError) {
        fail("password", ruleError);
        return;
      }
      const mismatch = confirmPasswordError(password, confirm);
      if (mismatch) {
        fail("confirm", mismatch);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          // Never the raw message: Supabase distinguishes a wrong password from
          // an unconfirmed address, and only an address with an account can get
          // the second answer.
          fail("credentials", signInErrorMessage(error));
          return;
        }
        // The browser client has written the session cookie; refresh server
        // components so the signed-in state takes effect, then go home.
        router.push("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (error) {
          // Never the raw message: with email confirmation off, Supabase says
          // "User already registered" for a known address.
          fail("form", signUpErrorMessage(error));
          return;
        }
        if (data.session) {
          // Email confirmation is off — we're signed in immediately.
          router.push("/");
          router.refresh();
        } else {
          // Confirmation required.
          setNotice(
            "Account created. Check your email to confirm, then sign in."
          );
          applyMode("signin");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailInvalid}
          aria-describedby={emailInvalid ? ERROR_ID : undefined}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password" className="text-sm font-medium text-muted">
            Password
          </label>
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-pressed={reveal}
            aria-label={`${reveal ? "Hide" : "Show"} password${signup ? "s" : ""}`}
            className="text-sm font-medium text-accent hover:underline"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="password"
          type={reveal ? "text" : "password"}
          autoComplete={signup ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={passwordInvalid}
          aria-describedby={
            [signup ? RULE_ID : null, passwordInvalid ? ERROR_ID : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className={inputClass}
          placeholder="••••••••"
        />
        {signup ? (
          // Persistent, not a placeholder: the rule has to stay readable while
          // the field is being filled in, which is when it matters.
          <p id={RULE_ID} className="text-xs text-muted">
            {PASSWORD_HINT}
          </p>
        ) : (
          <Link
            href="/forgot-password"
            className="self-end text-sm font-medium text-accent hover:underline"
          >
            Forgot password?
          </Link>
        )}
      </div>

      {signup && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="confirm-password"
            className="text-sm font-medium text-muted"
          >
            Confirm password
          </label>
          <input
            id="confirm-password"
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={confirmInvalid}
            aria-describedby={confirmInvalid ? ERROR_ID : undefined}
            className={inputClass}
            placeholder="Type it again"
          />
        </div>
      )}

      {error && (
        <p
          id={ERROR_ID}
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-sm text-danger"
        >
          {error.message}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm text-text">
          {notice}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-1 disabled:opacity-60">
        {busy ? "Working…" : signup ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-muted">
        {signup ? "Already have an account?" : "New to Reelhouse?"}{" "}
        <button
          type="button"
          onClick={() => {
            applyMode(signup ? "signin" : "signup");
            setError(null);
            setNotice(null);
            setConfirm("");
          }}
          className="font-medium text-accent hover:underline"
        >
          {signup ? "Sign in" : "Create one"}
        </button>
      </p>
    </form>
  );
}
