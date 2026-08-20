"use client";

import { useMemo, useState } from "react";
import type { Season } from "@/types";
import { progressKey, readProgress } from "@/lib/library";
import { placeholderArt } from "@/lib/utils";
import { CheckIcon, ChevronRightIcon, CloseIcon, SearchIcon } from "./icons";

function AutoplayToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Autoplay next episode"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        on ? "bg-accent" : "bg-surface-2"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// Episodes drawer: season selector, search, autoplay, and a scrollable list of
// episode cards with thumbnails, currently-watching indicator, and progress.
export default function EpisodeDrawer({
  open,
  onClose,
  mediaId,
  mediaTitle,
  mediaOverview,
  seasons,
  currentSeason,
  currentEpisode,
  autoplay,
  onToggleAutoplay,
  onSelectEpisode,
}: {
  open: boolean;
  onClose: () => void;
  mediaId: string;
  mediaTitle: string;
  mediaOverview?: string;
  seasons: Season[];
  currentSeason: number;
  currentEpisode: number;
  autoplay: boolean;
  onToggleAutoplay: () => void;
  onSelectEpisode: (season: number, episode: number) => void;
}) {
  const [viewedSeason, setViewedSeason] = useState(currentSeason);
  const [seasonMenu, setSeasonMenu] = useState(false);
  const [query, setQuery] = useState("");

  const season = useMemo(
    () => seasons.find((s) => s.seasonNumber === viewedSeason) ?? seasons[0],
    [seasons, viewedSeason]
  );

  const episodes = useMemo(() => {
    const list = season?.episodes ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        String(e.episodeNumber).includes(q) ||
        (e.overview ?? "").toLowerCase().includes(q)
    );
  }, [season, query]);

  // Progress ratio (0–1) for an episode, from locally-saved playback progress.
  const ratioFor = (seasonNumber: number, episodeNumber: number, title: string): number => {
    const entry = readProgress(progressKey(mediaId, { seasonNumber, episodeNumber, title }));
    if (!entry || !entry.duration) return entry?.completed ? 1 : 0;
    if (entry.completed) return 1;
    return Math.max(0, Math.min(1, entry.position / entry.duration));
  };

  const remainingLabel = (runtime: number | undefined, ratio: number): string => {
    if (!runtime || runtime <= 0) return "";
    if (ratio >= 0.999) return "Watched";
    const left = Math.max(1, Math.round(runtime * (1 - ratio)));
    return ratio > 0 ? `${left}m left` : `${runtime}m`;
  };

  return (
    <div className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-label="Episodes"
        className={`absolute right-0 top-0 flex h-full w-full max-w-[28rem] flex-col border-l border-border bg-surface/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out sm:rounded-l-2xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Controls row */}
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSeasonMenu((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink"
              aria-haspopup="listbox"
              aria-expanded={seasonMenu}
            >
              {season ? `Season ${season.seasonNumber}` : "Season"}
              <ChevronRightIcon size={16} className={`transition ${seasonMenu ? "rotate-90" : ""}`} />
            </button>
            {seasonMenu && (
              <ul
                role="listbox"
                className="absolute left-0 top-full z-10 mt-1 max-h-64 w-44 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl no-scrollbar"
              >
                {seasons.map((s) => (
                  <li key={s.seasonNumber}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={s.seasonNumber === viewedSeason}
                      onClick={() => {
                        setViewedSeason(s.seasonNumber);
                        setSeasonMenu(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-2 ${
                        s.seasonNumber === viewedSeason ? "text-accent" : "text-text"
                      }`}
                    >
                      {s.name || `Season ${s.seasonNumber}`}
                      {s.seasonNumber === viewedSeason && <CheckIcon size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface-2/50 px-3 py-1.5">
            <SearchIcon size={16} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
            />
          </label>

          <div className="flex shrink-0 items-center gap-1.5" title="Autoplay next episode">
            <AutoplayToggle on={autoplay} onToggle={onToggleAutoplay} />
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close episodes"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2/70 text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Season header */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-text">
              {season?.name || `Season ${season?.seasonNumber ?? ""}`}
            </h3>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              • {season?.episodeCount ?? season?.episodes.length ?? 0} Episodes
            </span>
          </div>
          {mediaOverview && (
            <p className="mt-1 line-clamp-2 text-xs text-muted">{mediaOverview}</p>
          )}
        </div>

        {/* Episode list */}
        <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar p-3">
          {episodes.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted">No episodes match “{query}”.</p>
          )}
          {episodes.map((ep) => {
            const isCurrent = ep.seasonNumber === currentSeason && ep.episodeNumber === currentEpisode;
            const ratio = ratioFor(ep.seasonNumber, ep.episodeNumber, ep.title);
            const thumb =
              ep.stillUrl || placeholderArt({ title: ep.title, type: "tv", variant: "backdrop" });
            return (
              <button
                key={ep.id}
                type="button"
                onClick={() => onSelectEpisode(ep.seasonNumber, ep.episodeNumber)}
                className={`flex w-full gap-3 rounded-xl border p-2 text-left transition ${
                  isCurrent
                    ? "border-accent/70 bg-accent/10 ring-1 ring-accent/40"
                    : "border-border bg-surface-2/40 hover:bg-surface-2"
                }`}
              >
                <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface sm:w-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {isCurrent && (
                    <span className="absolute left-1 top-1 rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-ink">
                      Watching
                    </span>
                  )}
                  {ratio > 0 && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                      <span className="block h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-text">
                      {ep.episodeNumber}. {ep.title}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {remainingLabel(ep.runtime, ratio) || (ep.airDate ?? "")}
                  </p>
                  {ep.overview && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{ep.overview}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
