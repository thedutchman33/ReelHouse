"use client";

import { useLiveWindows } from "@/components/live/use-live-windows";
import { windowIsLive } from "@/lib/live-windows";

// The page-header counterpart of the navbar's LIVE stamp. It uses the same
// shared watch window as the section's Watch Live button, so the header, the
// navbar and the home hero all unlock and lock together.
export default function SectionLiveStamp({ kind }: { kind: "f1" | "cricket" }) {
  const { feed, now } = useLiveWindows();
  const live = Boolean(now && feed[kind] && windowIsLive(feed[kind]!, now));
  if (!live) return null;

  return (
    <span
      role="status"
      className="live-blink mb-1.5 flex w-fit items-center gap-1.5 text-[10px] font-black uppercase leading-none tracking-[0.22em] text-[#ff3b30]"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff3b30] shadow-[0_0_6px_rgb(255_59_48/0.85)]" />
      Live
      <span className="sr-only"> now</span>
    </span>
  );
}
