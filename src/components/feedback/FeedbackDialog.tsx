"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FeedbackForm from "./FeedbackForm";

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

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
        'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("[data-feedback-autofocus]")
        ?.focus();
    }, 40);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgb(0_0_0/0.88)] p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        aria-describedby="feedback-dialog-description"
        className="nm-glass max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl p-6 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Help us improve</p>
            <h2 id="feedback-dialog-title" className="mt-1 text-lg font-semibold">
              Send feedback
            </h2>
            <p
              id="feedback-dialog-description"
              className="mt-1 text-xs leading-relaxed text-zinc-400"
            >
              Tell us what is working, what is missing, or what we should fix next.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback"
            className="-mr-1 shrink-0 p-1 text-zinc-400 transition hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>

        <FeedbackForm autoFocus messageRows={5} className="mt-5" />
      </div>
    </div>,
    document.body
  );
}

export function FeedbackButton({
  className,
  children = "Feedback",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={className}
      >
        {children}
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
