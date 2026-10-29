import type { Metadata } from "next";
import localFont from "next/font/local";
import F1Dashboard from "@/components/f1/F1Dashboard";
import SectionLiveStamp from "@/components/live/SectionLiveStamp";

// The OFFICIAL Formula 1 typefaces — sourced from formula1.com's own public
// fonts stylesheet (www.formula1.com/s/fonts.css) and self-hosted here.
// `--font-f1` is the only family: Regular + Italic for copy, Bold/Black for
// headings and numerals. (The ultra-expanded Wide face is NOT used.)
const f1Text = localFont({
  src: [
    { path: "../fonts/Formula1-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Formula1-Italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/Formula1-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Formula1-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-f1",
  display: "swap",
});

export const metadata: Metadata = { title: "Formula 1" };

// Static shell — every F1 fact is fetched client-side from the edge-cached
// /api/f1/* routes, and the countdowns tick in the browser, so the page can
// stay CDN-fast like the browse pages.
export const revalidate = 300;

export default function Formula1Page() {
  return (
    <div className={`f1-root relative isolate container-rh pt-14 pb-8 ${f1Text.variable}`}>
      {/* Official F1 mark as a page watermark: white via filter, faded to a
          whisper and soft-masked so it never competes with the data. Fixed so
          it sits behind the cards while the long dashboard scrolls. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/f1/brand/f1-logo.svg"
          alt=""
          draggable={false}
          className="absolute -right-[12%] top-[6%] w-[min(1340px,118vw)] max-w-none select-none opacity-[0.065] [filter:brightness(0)_invert(1)] [mask-image:radial-gradient(62%_62%_at_50%_45%,#000_32%,transparent_100%)]"
        />
      </div>

      <header className="relative mb-8">
        <p className="eyebrow">Motorsport · Live Data</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 sm:gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/f1/brand/f1-logo.svg"
            alt="Formula 1 logo"
            width={120}
            height={30}
            draggable={false}
            className="h-9 w-auto shrink-0 sm:h-11"
          />
          <div className="min-w-0">
            <SectionLiveStamp kind="f1" />
            <h1 className="font-f1 text-4xl font-bold uppercase leading-none tracking-wide text-[#e10600] sm:text-5xl">
              Formula 1
            </h1>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">
          Race weekends, session countdowns and live driver telemetry — real OpenF1 data.
        </p>
      </header>
      <F1Dashboard />
    </div>
  );
}
