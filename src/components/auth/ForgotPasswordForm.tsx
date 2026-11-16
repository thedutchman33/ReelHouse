"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LINK_CLASS,
  AUTH_NOTICE_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "./auth-ui";

// Step 1 of the reset flow: ask Supabase to mail a recovery link.
//
// Enumeration safety is the whole point of the success panel below: Supabase
// answers `resetPasswordForEmail` the same way whether or not an account exists,
// and so does this form. Nothing here branches on "the address is known", and the
// only errors surfaced are ones that say nothing about the account (transport
// failure, send-rate limit).
export default function ForgotPasswordForm({
  linkExpired = false,
  onBack,
}: {
  linkExpired?: boolean;
  onBack?: () => void;
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
      <div className="flex flex-col gap-3">
        <p role="status" className={AUTH_NOTICE_CLASS}>
          If <span className="font-medium text-zinc-100">{sentTo}</span> has a
          Reelhouse account, a reset link is on its way. The link expires shortly,
          so use it soon.
        </p>
        <p className="text-xs leading-relaxed text-zinc-500">
          Nothing in your inbox? Check the spam folder, or{" "}
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
            className={AUTH_LINK_CLASS}
          >
            try another address
          </button>
          .
        </p>
        {onBack ? (
          <button type="button" onClick={onBack} className={AUTH_LINK_CLASS}>
            Back to sign in
          </button>
        ) : (
          <Link href="/login" className={AUTH_LINK_CLASS}>
            Back to sign in
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {linkExpired && !error && (
        <p role="alert" className={AUTH_ERROR_CLASS}>
          That reset link is invalid or has expired. Request a new one below.
        </p>
      )}

      <label htmlFor="email" className="block text-xs text-zinc-400">
        Email
      </label>
      <input
        id="email"
        data-autofocus
        type="email"
        autoComplete="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={AUTH_INPUT_CLASS}
        placeholder="you@example.com"
      />

      {error && (
        <p role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={AUTH_PRIMARY_BUTTON_CLASS}
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-xs text-zinc-500">
        Remembered it?{" "}
        {onBack ? (
          <button type="button" onClick={onBack} className={AUTH_LINK_CLASS}>
            Back to sign in
          </button>
        ) : (
          <Link href="/login" className={AUTH_LINK_CLASS}>
            Back to sign in
          </Link>
        )}
      </p>
    </form>
  );
}
