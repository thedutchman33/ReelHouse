"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SpinnerIcon } from "@/components/player/icons";
import { PASSWORD_HINT, passwordRuleError } from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/client";

// Step 2 of the reset flow: set the new password.
//
// By the time this renders, /auth/callback has already exchanged the emailed
// credential for a session cookie, so the visitor is authenticated as themselves
// and `updateUser` is all that's needed — no custom token system, nothing kept in
// localStorage, and the password never leaves this form except in that one
// request body.
type Stage = "checking" | "ready" | "expired" | "done";

const inputClass =
  "rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirm the recovery session actually arrived. onAuthStateChange covers the
  // case where the browser client is still restoring it a tick later (and the
  // PASSWORD_RECOVERY event, should a link ever reach the client directly).
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setStage("expired");
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setStage((current) =>
        current === "done" ? current : data.session ? "ready" : "expired"
      );
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      setStage((current) => (current === "done" ? current : "ready"));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Accounts are not enabled on this deployment.");
      return;
    }

    if (!password) {
      setError("Enter a new password.");
      return;
    }
    const ruleError = passwordRuleError(password);
    if (ruleError) {
      setError(ruleError);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don’t match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        // Supabase's own wording here is about the password itself ("should be
        // different from the old password"), so it's safe to show.
        setError(error.message);
        return;
      }
      setPassword("");
      setConfirm("");
      setStage("done");
      // The session is now confirmed on the server too; let server components
      // pick up the signed-in state.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (stage === "checking") {
    return (
      <p className="flex items-center gap-2.5 text-sm text-muted">
        <SpinnerIcon size={18} />
        Checking your reset link…
      </p>
    );
  }

  if (stage === "expired") {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          This reset link is invalid, already used, or expired. Reset links are
          single-use and short-lived.
        </p>
        <Link href="/forgot-password" className="btn-primary">
          Request a new link
        </Link>
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm text-text"
        >
          Your password has been updated, and you’re signed in on this device.
        </p>
        <Link href="/" className="btn-primary">
          Continue to Reelhouse
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="new-password" className="text-sm font-medium text-muted">
            New password
          </label>
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-pressed={reveal}
            aria-label={reveal ? "Hide passwords" : "Show passwords"}
            className="text-sm font-medium text-accent hover:underline"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="new-password"
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder={PASSWORD_HINT}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium text-muted">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
          placeholder="Type it again"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-1 disabled:opacity-60">
        {busy ? "Updating…" : "Update password"}
      </button>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
