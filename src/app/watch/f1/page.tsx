import type { Metadata } from "next";
import PlaybackContainer from "@/components/playback/PlaybackContainer";
import { getF1PlaybackPlan, getF1PreconnectOrigin } from "@/lib/f1-playback";
import { placeholderArt } from "@/lib/utils";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// /watch/f1 — the in-site Formula 1 watch page.
//
// Same structure as the movie/TV/anime watch page: the plan comes from the
// server, PlaybackContainer renders the stage, dock and Servers panel, and the
// iframe is owned by whichever F1 server is selected. There is no episode or
// watch-history model for a live channel.
// ---------------------------------------------------------------------------

export const metadata: Metadata = { title: "Formula 1 Live Watch" };

const F1_TITLE = "Formula 1 Live";

export default function WatchF1Page() {
  const plan = getF1PlaybackPlan();
  const preconnect = getF1PreconnectOrigin();

  const media: MediaSummary = {
    id: "f1-live",
    tmdbId: 0,
    type: "f1",
    title: F1_TITLE,
    posterUrl: placeholderArt({ title: F1_TITLE, type: "f1" }),
    backdropUrl: placeholderArt({ title: F1_TITLE, type: "f1", variant: "backdrop" }),
    genres: ["Motorsport"],
    overview:
      "Live Formula 1 coverage. Choose a server below to start watching.",
  };

  return (
    <>
      {/* One preconnect only — the first enabled server. Preconnecting to every
          F1 host would open connections the viewer may never use. */}
      {preconnect && (
        <>
          <link rel="preconnect" href={preconnect} />
          <link rel="dns-prefetch" href={preconnect} />
        </>
      )}
      <PlaybackContainer
        type="f1"
        media={media}
        seasons={[]}
        plan={plan}
        backHref="/f1"
      />
    </>
  );
}
