import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Reelhouse palette — warm film-house dark theme.
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
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: [
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgb(0 0 0 / 0.6)",
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
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
