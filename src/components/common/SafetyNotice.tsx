"use client";

import { useEffect, useState } from "react";

// Safety notice (reference pattern): a full-width dismissible banner under the
// navbar. Copy is ReelHouse's own; the dismissal persists locally.
const KEY = "rh-safety-notice-dismissed";

export default function SafetyNotice() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  return (
    <div className="container-rh mb-8">
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-2.5 text-sm text-text/80 backdrop-blur"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-accent">
          <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-text">You&apos;re safe here</span> — Reelhouse
          streams only content it is authorized to distribute. Any “verify / pay /
          install” pop-up is not from us.
        </p>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* best-effort */
            }
          }}
          aria-label="Dismiss notice"
          className="shrink-0 rounded-md p-1 text-muted transition hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
