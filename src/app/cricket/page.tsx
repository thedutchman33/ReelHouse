import type { Metadata } from "next";
import localFont from "next/font/local";
import CricketDashboard from "@/components/cricket/CricketDashboard";
import SectionLiveStamp from "@/components/live/SectionLiveStamp";
import "./cricket.css";

const cricketText = localFont({
  src: "../fonts/India2023-Bold.ttf",
  weight: "700",
  style: "normal",
  variable: "--font-cricket",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cricket",
  description: "India cricket fixtures, scorecards, rankings and players.",
};

// Static shell — every cricket fact is fetched client-side from the cached
// /api/cricket/* routes and the countdowns tick in the browser.
export const revalidate = 60;

export default function CricketPage() {
  return (
    <div
      className={`cricket-page f1-root relative isolate -mt-[var(--rh-nav-h)] min-h-screen overflow-hidden pt-[var(--rh-nav-h)] ${cricketText.variable}`}
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/cricket/brand/bcci-logo.svg"
          alt=""
          draggable={false}
          className="absolute -right-[8%] top-[8%] w-[min(880px,90vw)] max-w-none select-none opacity-[0.055] [mask-image:radial-gradient(62%_62%_at_50%_45%,#000_30%,transparent_100%)]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_70%_-10%,rgba(29,80,158,0.1),transparent_65%)]" />
      </div>

      <div className="container-rh pb-12 pt-14">
        <header className="relative mb-8">
          <p className="eyebrow flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#3f78d8] shadow-[0_0_6px_rgb(63_120_216/0.8)]" />
            India · International
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 sm:gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/cricket/brand/bcci-logo.svg"
              alt=""
              width={44}
              height={44}
              draggable={false}
              className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12"
            />
            <div className="min-w-0">
              <SectionLiveStamp kind="cricket" />
              <h1 className="font-f1 text-4xl font-bold uppercase leading-none tracking-wide text-[#8fb4ec] sm:text-5xl">
                Cricket
              </h1>
            </div>
          </div>
        </header>
        <CricketDashboard />
      </div>
    </div>
  );
}
