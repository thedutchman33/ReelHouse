"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/client";

// Step 1 of the reset flow: ask Supabase to mail a recovery link.
//
// Enumeration safety is the whole point of the success panel below: Supabase
// answers `resetPasswordForEmail` the same way whether or not an account exists,
// and so does this form. Nothing here branches on "the address is known", and the
// only errors surfaced are ones that say nothing about the account (transport
// failure, send-rate limit).
export default function ForgotPasswordForm({
  linkExpired = false,
}: {
  linkExpired?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Accounts are not enabled on this deployment.");
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Enter the email address on your account.");
      return;
    }

    setBusy(true);
    try {
      // The mailed link goes to our callback route, which turns it into a
      // session and forwards to /reset-password. Origin comes from the browser,
      // so dev and production each get their own correct URL — the Supabase
      // dashboard's redirect allow-list is what authorises them.
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/reset-password");

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectTo.toString(),
      });

      if (error) {
        setError(
          error.status === 429
            ? "Too many requests. Wait a minute, then try again."
            : "We couldn’t send the email just now. Check the address and try again."
        );
        return;
      }
      setSentTo(cleanEmail);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm text-text"
        >
          If <span className="font-medium">{sentTo}</span> has a Reelhouse
          account, a reset link is on its way. The link expires shortly, so use
          it soon.
        </p>
        <p className="text-sm text-muted">
          Nothing in your inbox? Check the spam folder, or{" "}
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
            className="font-medium text-accent hover:underline"
          >
            try another address
          </button>
          .
        </p>
        <Link href="/login" className="btn-ghost mt-1">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {linkExpired && !error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-sm text-danger"
        >
          That reset link is invalid or has expired. Request a new one below.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          placeholder="you@example.com"
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
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
