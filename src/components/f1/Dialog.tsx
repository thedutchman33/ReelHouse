"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import localFont from "next/font/local";

// The dialog is portaled out of `.f1-root`, so it carries the F1 typefaces
// itself (same files the page loads; the browser reuses the cached font).
const modalF1Font = localFont({
  src: [
    { path: "../../app/fonts/Formula1-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../app/fonts/Formula1-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../app/fonts/Formula1-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-f1",
  display: "swap",
});

/** The F1 page's sheet: dark f1-card panel, ESC / backdrop close, focus trap. */
export default function F1Dialog({
  open,
  onClose,
  labelledBy,
  eyebrow,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  eyebrow?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const closeCb = useRef(onClose);
  closeCb.current = onClose;
  const fallbackId = useId();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCb.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
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

    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previous;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className={`${modalF1Font.variable} fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:px-6 sm:pb-6 sm:pt-24`}
      style={{ fontFamily: "var(--font-f1), var(--font-inter), ui-sans-serif, system-ui, sans-serif" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || fallbackId}
        className={`f1-card max-h-[88vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl sm:max-h-[calc(100vh-8rem)] sm:rounded-2xl ${
          size === "sm" ? "sm:max-w-md" : size === "md" ? "sm:max-w-xl" : "sm:max-w-3xl"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#111116]/95 px-4 py-3 backdrop-blur">
          <span className="font-f1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
            {eyebrow}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/30 text-white/60 transition hover:border-white/30 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
