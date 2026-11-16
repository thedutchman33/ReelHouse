"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SpinnerIcon } from "@/components/player/icons";
import { PASSWORD_HINT, passwordRuleError } from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LINK_CLASS,
  AUTH_NOTICE_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-ui";

// Step 2 of the reset flow: set the new password.
//
// By the time this renders, /auth/callback has already exchanged the emailed
// credential for a session cookie, so the visitor is authenticated as themselves
// and `updateUser` is all that's needed — no custom token system, nothing kept in
// localStorage, and the password never leaves this form except in that one
// request body.
//
// A session alone is NOT the test though: every signed-in visitor has one, so
// gating on it turned this into a change-my-password screen for anyone holding a
// left-open browser. `recoveryVerified` comes from the HttpOnly marker
// /auth/callback sets only after redeeming a real emailed credential — see
// src/lib/auth.ts, including why this is defence in depth rather than the
// boundary.
type Stage = "checking" | "ready" | "expired" | "done";

const inputClass = AUTH_INPUT_CLASS;

export default function ResetPasswordForm({
  recoveryVerified = false,
}: {
  /**
   * Whether the server saw a valid recovery marker for this request. Defaults to
   * false so a caller that forgets to pass it gets the closed gate, not the open
   * one.
   */
  recoveryVerified?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two things have to hold: the recovery marker (this really is a reset), and a
  // session (there's something to update). onAuthStateChange keeps the original
  // tolerance for a session the browser client is still restoring a tick later,
  // and still honours PASSWORD_RECOVERY on its own, should a link ever reach the
  // client directly with no server round trip to set the marker. Neither branch
  // can un-set `ready` once it holds, so their order doesn't matter.
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
        current === "done" || current === "ready"
          ? current
          : recoveryVerified && data.session
            ? "ready"
            : "expired"
      );
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "PASSWORD_RECOVERY" && !(recoveryVerified && session)) {
        return;
      }
      setStage((current) => (current === "done" ? current : "ready"));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [recoveryVerified]);

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
          className={AUTH_ERROR_CLASS}
        >
          This reset link is invalid, already used, or expired. Reset links are
          single-use and short-lived.
        </p>
        <Link href="/forgot-password" className={AUTH_PRIMARY_BUTTON_CLASS}>
          Request a new link
        </Link>
        <p className="text-center text-xs text-zinc-500">
          <Link href="/login" className={AUTH_LINK_CLASS}>
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
          className={AUTH_NOTICE_CLASS}
        >
          Your password has been updated, and you’re signed in on this device.
        </p>
        <Link href="/" className={AUTH_PRIMARY_BUTTON_CLASS}>
          Continue to Reelhouse
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="new-password"          className="block text-xs text-zinc-400">
            New password
          </label>
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-pressed={reveal}
            aria-label={reveal ? "Hide passwords" : "Show passwords"}
            className={AUTH_LINK_CLASS}
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
        <label htmlFor="confirm-password"          className="block text-xs text-zinc-400">
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
          className={AUTH_ERROR_CLASS}
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className={`mt-1 ${AUTH_PRIMARY_BUTTON_CLASS}`}>
        {busy ? "Updating…" : "Update password"}
      </button>

      <p className="text-center text-xs text-zinc-500">
        <Link href="/login" className={AUTH_LINK_CLASS}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
