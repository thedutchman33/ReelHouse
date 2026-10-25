import Hero from "@/components/hero/Hero";
import MediaRow from "@/components/media/MediaRow";
import ContinueWatching from "@/components/media/ContinueWatching";
import MyFeedRow from "@/components/media/MyFeedRow";
import ProvidersRow from "@/components/providers/ProvidersRow";
import SafetyNotice from "@/components/common/SafetyNotice";
import { getHeroItems, getHomeRows, getWatchProviders, isLiveMetadata } from "@/lib/tmdb";
import type { MediaRow as RowType } from "@/types";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 300;

// Editorial eyebrow label per row (reference section pattern: small uppercase
// tracked label over a condensed display heading). Labels only — all content
// comes from the real catalog.
const ROW_EYEBROWS: Record<string, string> = {
  trending: "Most Watched",
  top10: "Ranked Today",
  topIndia: "India Rankings",
  bollywood: "From India",
  doomsday: "Marvel Watch Order",
  anime: "Japanese Animation",
  new: "Just Arrived",
  acclaimed: "Highest Rated",
  scifi: "Genre Spotlight",
  action: "Genre Spotlight",
  thriller: "Genre Spotlight",
  feelgood: "Genre Spotlight",
};

export default async function HomePage() {
  // Wide net so every wordmark-backed family makes the rail (the rail dedupes
  // variants itself); ordering is applied inside ProvidersRow.
  const [hero, rows, providers] = await Promise.all([
    getHeroItems(),
    getHomeRows(),
    getWatchProviders("US"),
  ]);
  const live = isLiveMetadata();

  // The provider block sits between Continue Watching and My Feed (operator
  // preference), with the safety notice attached beneath it like the reference.
  // The "editors" row renders inside the Discover block at the end.
  const editorsRow = rows.find((r) => r.key === "editors");
  const mainRows = rows.filter((r) => r.key !== "editors");

  return (
    <>
      {/* The hero slides beneath the floating navbar (reference pattern) and
          the content below starts after a tall gap, like the reference. */}
      <div className="-mt-[var(--rh-nav-h)]">
        <Hero items={hero} />
      </div>

      <div className="relative z-10 mt-16 pb-10 sm:mt-20">
        <ContinueWatching />

        <ProvidersRow providers={providers} />

        <SafetyNotice />

        <MyFeedRow />

        {!live && (
          <div className="container-rh mb-8">
            <p className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-accent/90">
              You&apos;re viewing the{" "}
              <strong className="font-semibold">built-in sample catalog</strong>. Add a
              free <code className="rounded bg-black/30 px-1">TMDB_API_KEY</code> to{" "}
              <code className="rounded bg-black/30 px-1">.env.local</code> to load live movie &amp; TV data.
            </p>
          </div>
        )}

        {mainRows.map((row: RowType) => (
          <MediaRow key={row.key} row={row} eyebrow={ROW_EYEBROWS[row.key]} />
        ))}

        {editorsRow && (
          <section aria-label="Discover" className="mt-4">
            <div className="container-rh">
              <p className="eyebrow">Discover</p>
              <div className="mt-1 flex items-center gap-4">
                <h2 className="font-display text-3xl uppercase tracking-wide text-text sm:text-4xl">
                  Movies
                </h2>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </div>
            <div className="mt-4">
              <MediaRow row={editorsRow} eyebrow="Editor's Choices" />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
