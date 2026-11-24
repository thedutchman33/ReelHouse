import type { Metadata } from "next";
import WhatsNewView from "@/components/whats-new/WhatsNewView";

export const metadata: Metadata = {
  title: "What's New",
  description:
    "What's new in Reelhouse: in-feed trailers, Moctale community verdicts, one library across Hollywood, Bollywood and anime, live F1 and cricket, release tracking, flexible playback and browser games.",
};

export default function WhatsNewPage() {
  return (
    <div className="red-accent relative isolate min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(900px_500px_at_30%_-10%,rgba(255,255,255,0.04),transparent_60%)]"
      />
      <WhatsNewView />
    </div>
  );
}
