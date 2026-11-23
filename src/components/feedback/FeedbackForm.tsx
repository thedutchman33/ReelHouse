"use client";

import { useId, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 80;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;

const FIELD_CLASS =
  "mt-2 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

function CheckIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function FeedbackForm({
  autoFocus = false,
  messageRows = 4,
  className = "",
}: {
  autoFocus?: boolean;
  messageRows?: number;
  className?: string;
}) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const emailId = `${uid}-email`;
  const messageId = `${uid}-message`;
  const hintId = `${uid}-hint`;
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function clearStatus() {
    if (error) setError(null);
    if (success) setSuccess(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();

    if (!cleanMessage) {
      setSuccess(null);
      setError("Please enter a feedback message.");
      messageRef.current?.focus();
      return;
    }
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) {
      setSuccess(null);
      setError("Please enter a valid email address.");
      return;
    }
    if (cleanName.length > MAX_NAME) {
      setSuccess(null);
      setError(`Name must be ${MAX_NAME} characters or fewer.`);
      return;
    }
    if (cleanEmail.length > MAX_EMAIL) {
      setSuccess(null);
      setError(`Email must be ${MAX_EMAIL} characters or fewer.`);
      return;
    }
    if (cleanMessage.length > MAX_MESSAGE) {
      setSuccess(null);
      setError(`Feedback must be ${MAX_MESSAGE} characters or fewer.`);
      return;
    }

    setError(null);
    setSuccess(null);
    busyRef.current = true;
    setSubmitting(true);

    try {
      const supabase = getBrowserSupabase();
      if (!supabase) {
        setError("Feedback isn't available right now. Please try again later.");
        return;
      }

      const { error: insertError } = await supabase.from("feedback").insert({
        name: cleanName || null,
        email: cleanEmail || null,
        message: cleanMessage,
      });

      if (insertError) {
        console.error("Feedback submission failed:", insertError);
        setError("We couldn't submit your feedback. Please try again.");
        return;
      }

      setName("");
      setEmail("");
      setMessage("");
      setSuccess("Thank you! Your feedback has been submitted successfully.");
    } catch (submissionError) {
      console.error("Feedback submission failed:", submissionError);
      setError("We couldn't submit your feedback. Please check your connection and try again.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className={className}
      aria-busy={submitting}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={nameId} className={LABEL_CLASS}>
          Name <span className="font-normal normal-case tracking-normal text-muted/70">(optional)</span>
          <input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            maxLength={MAX_NAME}
            value={name}
            disabled={submitting}
            onChange={(event) => {
              setName(event.target.value);
              clearStatus();
            }}
            placeholder="Your name"
            className={FIELD_CLASS}
          />
        </label>

        <label htmlFor={emailId} className={LABEL_CLASS}>
          Email <span className="font-normal normal-case tracking-normal text-muted/70">(optional)</span>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={MAX_EMAIL}
            value={email}
            disabled={submitting}
            onChange={(event) => {
              setEmail(event.target.value);
              clearStatus();
            }}
            placeholder="you@example.com"
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <label htmlFor={messageId} className={`${LABEL_CLASS} mt-4 block`}>
        Feedback <span className="font-normal normal-case tracking-normal text-primary">(required)</span>
        <textarea
          ref={messageRef}
          id={messageId}
          name="message"
          rows={messageRows}
          maxLength={MAX_MESSAGE}
          required
          value={message}
          disabled={submitting}
          onChange={(event) => {
            setMessage(event.target.value);
            clearStatus();
          }}
          placeholder="Tell us what is working, what is missing, or what we should fix next."
          aria-describedby={hintId}
          data-feedback-autofocus={autoFocus ? "true" : undefined}
          className={`${FIELD_CLASS} resize-y leading-relaxed`}
        />
      </label>

      <div
        id={hintId}
        className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted/70"
      >
        <span>Email is only used if we need to follow up.</span>
        <span>
          {message.length}/{MAX_MESSAGE}
        </span>
      </div>

      {success && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-accent"
        >
          <CheckIcon />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-xs leading-relaxed text-rose-300"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            />
          )}
          {submitting ? "Sending feedback…" : "Send Feedback"}
        </button>
      </div>
    </form>
  );
}
