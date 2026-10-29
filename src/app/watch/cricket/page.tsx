import type { Metadata } from "next";
import PlaybackContainer from "@/components/playback/PlaybackContainer";
import { getCricketPlaybackPlan } from "@/lib/cricket-playback";
import { placeholderArt } from "@/lib/utils";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// /watch/cricket — the in-site cricket watch page.
//
// Same structure as /watch/f1: the plan comes from the server, PlaybackContainer
// renders the stage, dock and Servers panel, and the iframe is owned by whichever
// cricket server is selected. There is no episode or watch-history model for a
// live channel.
//
// Unlike F1, the server list comes from CRICKET_SERVER_N_* in .env.local, so the
// page is rendered per request rather than snapshotted at build time. Each
// candidate points at the same-origin /api/cricket/embed sanitizer, never at the
// source page directly; that is what removes the Telegram dialog for every
// visitor. No preconnect is emitted: the browser talks to this origin, and the
// server is the one that talks to the source.
// ---------------------------------------------------------------------------

export const metadata: Metadata = { title: "Cricket Live Watch" };

export const dynamic = "force-dynamic";

const CRICKET_TITLE = "Cricket Live";

export default function WatchCricketPage() {
  const plan = getCricketPlaybackPlan();

  const media: MediaSummary = {
    id: "cricket-live",
    tmdbId: 0,
    type: "cricket",
    title: CRICKET_TITLE,
    posterUrl: placeholderArt({ title: CRICKET_TITLE, type: "cricket" }),
    backdropUrl: placeholderArt({
      title: CRICKET_TITLE,
      type: "cricket",
      variant: "backdrop",
    }),
    genres: ["Cricket"],
    overview:
      "Live cricket coverage. Choose a server below to start watching.",
  };

  return (
    <PlaybackContainer
      type="cricket"
      media={media}
      seasons={[]}
      plan={plan}
      backHref="/cricket"
    />
  );
}
