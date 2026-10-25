import type { Metadata } from "next";
import F1Dashboard from "@/components/f1/F1Dashboard";

export const metadata: Metadata = { title: "Formula 1" };

// Static shell — every F1 fact is fetched client-side from the edge-cached
// /api/f1/* routes, and the countdowns tick in the browser, so the page can
// stay CDN-fast like the browse pages.
export const revalidate = 300;

export default function Formula1Page() {
  return (
    <div className="container-rh py-8">
      <header className="mb-8">
        <p className="eyebrow">Motorsport · Live Data</p>
        <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide text-text sm:text-5xl">
          Formula 1
        </h1>
        <p className="mt-2 text-sm text-muted">
          Race weekends, session countdowns and live driver telemetry — real OpenF1 data.
        </p>
      </header>
      <F1Dashboard />
    </div>
  );
}
