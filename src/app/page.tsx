import Hero from "@/components/hero/Hero";
import MediaRow from "@/components/media/MediaRow";
import ContinueWatching from "@/components/media/ContinueWatching";
import { getHeroItems, getHomeRows, isLiveMetadata } from "@/lib/tmdb";

export default async function HomePage() {
  const [hero, rows] = await Promise.all([getHeroItems(), getHomeRows()]);
  const live = isLiveMetadata();

  return (
    <>
      <Hero items={hero} />

      <div className="relative z-10 -mt-4 space-y-1 pb-10">
        <ContinueWatching />

        {!live && (
          <div className="container-rh">
            <p className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-accent/90">
              You&apos;re viewing the{" "}
              <strong className="font-semibold">built-in sample catalog</strong>. Add a
              free <code className="rounded bg-black/30 px-1">TMDB_API_KEY</code> to{" "}
              <code className="rounded bg-black/30 px-1">.env.local</code> to load live movie &amp; TV data.
            </p>
          </div>
        )}

        {rows.map((row) => (
          <MediaRow key={row.key} row={row} />
        ))}
      </div>
    </>
  );
}
