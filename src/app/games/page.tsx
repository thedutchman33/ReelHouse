import type { Metadata } from "next";
import GamesHub from "@/components/games/GamesHub";
import { getBrowserGames } from "@/lib/games";

// The source directory regenerates `data/games.json` itself (daily link checks
// included). Re-rendering on the same rhythm is what makes a game added upstream
// appear here without a deploy.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Games",
  description:
    "Playable-in-your-browser games, mirrored game for game from the bitrunlog.com directory and refreshed automatically.",
};

export default async function GamesPage() {
  const feed = await getBrowserGames();

  return (
    <div className="games-accent relative isolate min-h-screen overflow-hidden">
      {/* Ambient arcade wash: a golden bloom plus a faint grid, both masked
          so they sit behind the directory without competing with the art. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_620px_at_74%_-10%,rgba(250,204,21,0.10),transparent_65%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(72%_58%_at_50%_16%,#000_8%,transparent_100%)]" />
      </div>

      <div className="container-rh pb-14 pt-14">
        <header className="relative mb-8">
          <p className="eyebrow flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgb(250_204_21/0.8)]"
            />
            Browser · Auto-synced
          </p>

          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <h1 className="font-display text-4xl font-black uppercase leading-none tracking-wide text-white sm:text-5xl">
              Games
            </h1>
            <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">
              Play in your browser
            </p>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Decompiled, recompiled and reverse-engineered games, plus the wider
            world of web ports — all launchable from a tab.
          </p>
        </header>

        <GamesHub feed={feed} />
      </div>
    </div>
  );
}
