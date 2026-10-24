import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Playback help for Reelhouse — servers, buffering, and safety.",
};

// Real answers for real behavior (the Servers panel's "FAQ →" destination).
const ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Playback isn't loading. What do I do?",
    a: (
      <>
        Open the <strong>Servers</strong> panel under the player and pick another server — every
        server is an independent source for the same title. If all servers fail, the title may
        be temporarily unavailable from every configured provider.
      </>
    ),
  },
  {
    q: "What does the Mbps number mean?",
    a: (
      <>
        It is a live throughput measurement from your connection to Reelhouse&apos;s image/data
        CDN, taken while this page loaded. <strong>Test</strong> re-runs the measurement. Low
        numbers usually explain buffering.
      </>
    ),
  },
  {
    q: "What does the re-check button do?",
    a: <>It re-evaluates every configured provider&apos;s availability for the title you are watching.</>,
  },
  {
    q: "Why do I see ads or pop-ups?",
    a: (
      <>
        External servers embed their own players and may show their own ads. Reelhouse never
        asks you to pay, verify, or install anything — any pop-up that does is not from us.
        Close it and switch servers.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="container-rh max-w-3xl py-10">
      <p className="eyebrow">Help</p>
      <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide sm:text-5xl">
        FAQ
      </h1>

      <div className="mt-8 space-y-3">
        {ITEMS.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-white/10 bg-surface/70 px-5 py-4"
          >
            <summary className="cursor-pointer list-none text-[15px] font-semibold text-foreground marker:content-none">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 text-muted transition-transform group-open:rotate-180"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>

      <Link href="/" className="btn-ghost mt-8">
        Back to browsing
      </Link>
    </div>
  );
}
