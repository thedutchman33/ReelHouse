"use client";

// Global error boundary (Next 16 `global-error` convention; ref
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md#global-error).
//
// This is the LAST-RESORT boundary: it catches errors thrown by the ROOT
// layout itself, which the segment-level src/app/error.tsx cannot cover. When
// active it REPLACES the root layout, which has two consequences the Next docs
// call out and this file honors:
//   1. it must render its own <html> and <body>, and
//   2. global styles / Tailwind classes are NOT loaded here, so every style is
//      inline (kept on-brand via the Reelhouse color tokens below).
// It uses the same recovery contract as src/app/error.tsx — a `reset()` action
// plus a console monitoring hook — for consistency across the two boundaries.

import { useEffect } from "react";

// Reelhouse brand tokens (mirrors the CSS variables in globals.css, which are
// unavailable in this document). Space-separated RGB to match the source.
const C = {
  bg: "rgb(16 14 12)",
  surface: "rgb(26 22 19)",
  border: "rgb(50 42 36)",
  text: "rgb(245 241 236)",
  muted: "rgb(168 155 143)",
  accent: "rgb(232 163 61)",
  accentInk: "rgb(34 23 4)",
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook for real error monitoring (mirrors src/app/error.tsx). Console for now.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          backgroundColor: C.bg,
          color: C.text,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <title>Something went wrong · Reelhouse</title>

        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: C.accent,
            }}
          >
            Reelhouse
          </p>

          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>
            Something went wrong
          </h1>

          <p style={{ marginTop: "0.5rem", lineHeight: 1.5, color: C.muted }}>
            A critical error interrupted the app. You can try again, or reload the
            home page.
          </p>

          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                border: "none",
                borderRadius: "9999px",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                backgroundColor: C.accent,
                color: C.accentInk,
              }}
            >
              Try again
            </button>

            <a
              href="/"
              style={{
                borderRadius: "9999px",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
                border: `1px solid ${C.border}`,
                backgroundColor: C.surface,
                color: C.text,
              }}
            >
              Back to Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
