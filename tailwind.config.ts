import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Reelhouse palette — streaming-dark theme with an emerald accent
        // (design language reverse-engineered from the reference site).
        // Values are CSS variables defined in src/app/globals.css so the
        // whole system can be re-themed from one place.
        bg: "rgb(var(--rh-bg) / <alpha-value>)",
        surface: "rgb(var(--rh-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--rh-surface-2) / <alpha-value>)",
        border: "rgb(var(--rh-border) / <alpha-value>)",
        text: "rgb(var(--rh-text) / <alpha-value>)",
        muted: "rgb(var(--rh-muted) / <alpha-value>)",
        accent: "rgb(var(--rh-accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--rh-accent-strong) / <alpha-value>)",
        "accent-ink": "rgb(var(--rh-accent-ink) / <alpha-value>)",
        danger: "rgb(var(--rh-danger) / <alpha-value>)",
      },
      fontFamily: {
        // Wired to next/font CSS variables set in src/app/layout.tsx.
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Condensed display face for hero titles and section headings.
        display: [
          "var(--font-bebas)",
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        // Official Formula 1 text family (self-hosted on the /f1 page).
        f1: [
          "var(--font-f1)",
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 4px 12px rgba(0, 0, 0, 0.32)",
        glow: "0 0 0 1px rgb(var(--rh-accent) / 0.35), 0 12px 40px -12px rgb(var(--rh-accent) / 0.35)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 0.4s ease-out both",
        "route-fade": "route-fade 0.25s ease-out both",
        "fade-in": "fade-in 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
