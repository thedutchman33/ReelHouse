"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PASSWORD_HINT, passwordRuleError } from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Accounts are not enabled on this deployment.");
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Email and password are both required.");
      return;
    }
    if (mode === "signup") {
      // Shared with the password-reset screen, so both state the same rule.
      const ruleError = passwordRuleError(password);
      if (ruleError) {
        setError(ruleError);
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
          setError(error.message);
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
          setError(error.message);
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
          setMode("signin");
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
          className="rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          placeholder={mode === "signup" ? PASSWORD_HINT : "••••••••"}
        />
        {mode === "signin" && (
          <Link
            href="/forgot-password"
            className="self-end text-sm font-medium text-accent hover:underline"
          >
            Forgot password?
          </Link>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm text-text">
          {notice}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-1 disabled:opacity-60">
        {busy
          ? "Working…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "signin" ? "New to Reelhouse?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="font-medium text-accent hover:underline"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
