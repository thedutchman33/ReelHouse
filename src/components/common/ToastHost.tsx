"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
} from "@/lib/toast";

// Mounted once in the root layout. Portal-rendered so it sits above the
// floating navbar and the Add to list popover on every page.
export default function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="red-accent rh-stagger pointer-events-none fixed inset-x-0 bottom-5 z-[400] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto flex max-w-[min(92vw,30rem)] items-start gap-2.5 rounded-xl border px-4 py-2.5 text-sm shadow-[0_18px_50px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl ${
            item.tone === "success"
              ? "border-accent/35 bg-[rgb(20_22_21/0.96)] text-text"
              : "border-white/12 bg-[rgb(18_19_20/0.96)] text-text"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              item.tone === "success" ? "bg-accent" : "bg-white/45"
            }`}
          />
          <p className="min-w-0 leading-snug">{item.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss"
            className="-mr-1 ml-1 shrink-0 rounded p-0.5 text-white/45 transition hover:text-white"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
