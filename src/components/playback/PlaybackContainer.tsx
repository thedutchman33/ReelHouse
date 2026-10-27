"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import VideoPlayer from "@/components/player/VideoPlayer";
import { BackIcon } from "@/components/player/icons";
import PosterImage from "@/components/media/PosterImage";
import WatchDock from "@/components/playback/WatchDock";
import ServerPanel from "@/components/playback/ServerPanel";
import WatchDetails from "@/components/playback/WatchDetails";
import WatchEpisodes from "@/components/playback/WatchEpisodes";
import { RecommendationsSection, TrailerSection } from "@/components/playback/WatchExtras";
import { formatRuntime } from "@/lib/utils";
import type { EpisodeRef } from "@/lib/library";
import { markPlaybackStarted } from "@/lib/library";
import {
  expandTemplate,
  findCandidate,
  selectFallbackCandidate,
  selectInitialCandidate,
  switchableCandidates,
} from "@/lib/playback/manager";
import {
  createProgressRecorder,
  shouldRecordProgress,
  type ProgressRecorder,
} from "@/lib/playback/progress";
import type { PlaybackFailure, PlaybackPlan } from "@/lib/playback/types";
import type { Episode, Media, MediaSummary, MediaType, Season } from "@/types";
import EmbedSurface from "./EmbedSurface";
import {
  FallbackNotice,
  PlaybackError,
  PlaybackUnavailable,
} from "./PlaybackStates";
import ProviderSelector from "./ProviderSelector";

// ---------------------------------------------------------------------------
// Playback container — the surrounding playback experience.
//
// This owns everything that is NOT a provider's player: which provider is on
// screen, the provider selector, loading/error/fallback states, the movie/TV
// context, and progress. Selection itself is delegated to the Provider Manager
// (src/lib/playback/manager.ts), so the rules are unit-tested rather than
// scattered through this component.
//
// Two surfaces:
//   native — renders Reelhouse's own VideoPlayer, completely unchanged. This is
//            the built-in base surface, selected when no external provider is
//            configured, so playback behaves exactly as it always has.
//   embed  — frames a provider's own player (EmbedSurface). Reelhouse adds no
//            playback controls of its own on this surface.
//
// Provider-independence: the title, season, episode and saved position live here
// and in the library store — never inside a provider — so switching provider
// changes only who renders the picture.
// ---------------------------------------------------------------------------

function episodeTitle(seasons: Season[], s: number, e: number): string {
  const season = seasons.find((x) => x.seasonNumber === s);
  return (
    season?.episodes?.find((x) => x.episodeNumber === e)?.title ?? `Episode ${e}`
  );
}

/** Next episode within a season, rolling into the next season. */
function nextEpisodeOf(
  seasons: Season[],
  s: number,
  e: number
): { season: number; episode: number } | null {
  const si = seasons.findIndex((x) => x.seasonNumber === s);
  if (si < 0) return null;
  const episodes = seasons[si].episodes ?? [];
  const ei = episodes.findIndex((x) => x.episodeNumber === e);
  if (ei >= 0 && ei < episodes.length - 1) {
    const n = episodes[ei + 1];
    return { season: n.seasonNumber, episode: n.episodeNumber };
  }
  // Rolling into the next season needs that season's episodes loaded; when
  // they aren't (lazy seasons), autoplay simply stops at the finale.
  const next = seasons[si + 1]?.episodes?.[0];
  return next ? { season: next.seasonNumber, episode: next.episodeNumber } : null;
}

/**
 * Current season/episode from the URL.
 *
 * The custom player rewrites `?s`/`?e` as the viewer moves through a series
 * (history.replaceState), so the URL — not this component's initial props — is
 * the truth when switching away from the native surface. Reading it keeps the
 * episode intact across a provider switch without touching any player file.
 */
function episodeFromUrl(fallback: { season: number; episode: number }): {
  season: number;
  episode: number;
} {
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const s = Number(params.get("s"));
  const e = Number(params.get("e"));
  return {
    season: Number.isFinite(s) && s > 0 ? s : fallback.season,
    episode: Number.isFinite(e) && e > 0 ? e : fallback.episode,
  };
}

export default function PlaybackContainer({
  type,
  media,
  detail = null,
  overview,
  runtime,
  seasons,
  plan,
  initialSeasonNumber,
  initialEpisodeNumber,
  initialSeconds,
  backHref,
}: {
  type: MediaType;
  media: MediaSummary;
  /** Full detail record (cast, tagline, recommendations) for the info section
      below the player. Optional so playback keeps working without it. */
  detail?: Media | null;
  overview?: string;
  runtime?: number;
  seasons: Season[];
  plan: PlaybackPlan;
  initialSeasonNumber?: number;
  initialEpisodeNumber?: number;
  initialSeconds?: number;
  backHref: string;
}) {
  // Anime carries a single synthesized "Episodes" season — episode-aware too.
  const hasEpisodes = type !== "movie" && seasons.length > 0;

  // Seasons arrive as metadata; episodes load per season (cached here) so a
  // 22-season show doesn't ship every episode in the page payload. Inline
  // episodes from the bundled catalog seed the cache directly.
  const [episodesBySeason, setEpisodesBySeason] = useState<
    Record<number, Episode[]>
  >(() =>
    Object.fromEntries(
      seasons.filter((sn) => sn.episodes).map((sn) => [sn.seasonNumber, sn.episodes!])
    )
  );
  const loadSeasonEpisodes = useCallback(
    async (sn: number): Promise<Episode[]> => {
      const cached = episodesBySeason[sn];
      if (cached) return cached;
      try {
        const res = await fetch(`/api/seasons/${media.tmdbId}/${sn}`);
        const data = (await res.json()) as { episodes?: Episode[] };
        const eps = data.episodes ?? [];
        setEpisodesBySeason((prev) => ({ ...prev, [sn]: eps }));
        return eps;
      } catch {
        return [];
      }
    },
    [episodesBySeason, media.tmdbId]
  );
  const seasonsWithEpisodes: Season[] = useMemo(
    () =>
      seasons.map((sn) => ({
        ...sn,
        episodes: episodesBySeason[sn.seasonNumber] ?? sn.episodes ?? [],
      })),
    [seasons, episodesBySeason]
  );

  const [selectedId, setSelectedId] = useState(
    () => selectInitialCandidate(plan.candidates, type)?.provider.id ?? ""
  );
  const [season, setSeason] = useState(initialSeasonNumber ?? 1);
  const [episode, setEpisode] = useState(initialEpisodeNumber ?? 1);

  // The season currently playing must always be loaded (episode titles,
  // autoplay-next, the episodes rail).
  useEffect(() => {
    if (!hasEpisodes) return;
    if (!seasons.some((sn) => sn.seasonNumber === season)) return;
    if (!episodesBySeason[season]) void loadSeasonEpisodes(season);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, hasEpisodes]);
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);
  // Providers that already failed in this chain — never retried automatically,
  // which is what stops fallback from looping.
  const [attempted, setAttempted] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ from: string; to: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Stage element for the dock's Fullscreen control.
  const stageRef = useRef<HTMLDivElement>(null);
  const toggleStageFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }, []);
  // "Switch server" actions (amber row + dock More menu): scroll the servers
  // panel into view AND run the reference's border-attention pulse — a light
  // streak laps the panel border twice while the panel flashes a soft ring.
  // The class is removed once the animation settles so the next click can
  // restart it (matches the reference's add/remove timing).
  const focusServerPanel = useCallback(() => {
    const el = document.getElementById("server-list");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el) {
      el.classList.remove("ax-server-attention");
      void el.offsetWidth; // reflow so a rapid re-click restarts the run
      el.classList.add("ax-server-attention");
      window.setTimeout(() => el.classList.remove("ax-server-attention"), 2400);
    }
  }, []);
  const [autoplay, setAutoplay] = useState(true);
  // Theater mode: player stage expands past its 1180px column to the full
  // content width (reference watch-page "Theater" control).
  const [theater, setTheater] = useState(false);
  // A `?t=` deep link applies to the first mount only; after a provider switch the
  // saved position (which the switch must not reset) takes over.
  const [switched, setSwitched] = useState(false);

  const candidate = useMemo(
    () => findCandidate(plan.candidates, type, selectedId),
    [plan.candidates, type, selectedId]
  );
  const provider = candidate?.provider ?? null;

  // ------------------------------- progress --------------------------------
  // One sink, keyed by media/episode, for every embed provider. The native
  // surface keeps persisting progress inside the existing player (unchanged), so
  // it is intentionally NOT recorded twice here.
  const episodeRef: EpisodeRef | null = hasEpisodes
    ? { seasonNumber: season, episodeNumber: episode, title: episodeTitle(seasonsWithEpisodes, season, episode) }
    : null;

  const recorderRef = useRef<ProgressRecorder | null>(null);
  const surfaceKind = candidate?.surface.kind ?? null;
  const recordEnabled =
    candidate?.surface.kind === "embed" && provider
      ? shouldRecordProgress(provider)
      : false;

  useEffect(() => {
    // Handing the title to an external provider's player is the one thing
    // Reelhouse knows for certain about an embed surface: the provider owns the
    // controls, and only a provider with DOCUMENTED progress events ever reports
    // a position (recordEnabled). Recording the start here is what keeps watch
    // history provider-independent — no provider event is assumed or invented.
    // The built-in player marks its own start on `play`, where a real play event
    // exists, so it is deliberately not marked here. F1 is a live embed with no
    // title/episode history to record — writing it would pollute Continue
    // Watching with a channel that can never be resumed.
    if (surfaceKind === "embed" && type !== "f1") {
      markPlaybackStarted({ media, episode: episodeRef });
    }
    const recorder = createProgressRecorder({
      target: { media, episode: episodeRef },
      enabled: recordEnabled,
    });
    recorderRef.current = recorder;
    // Leaving the surface (switch, episode change, unmount) writes the last
    // known position before the recorder goes away.
    return () => {
      recorder.flush();
      recorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    media,
    recordEnabled,
    surfaceKind,
    episodeRef?.seasonNumber,
    episodeRef?.episodeNumber,
    episodeRef?.title,
  ]);

  // ------------------------------- selection -------------------------------

  const selectProvider = useCallback(
    (nextId: string) => {
      if (nextId === selectedId) return;
      // The native player owns episode navigation while it is on screen; recover
      // where the viewer actually is before handing over.
      if (hasEpisodes) {
        const current = episodeFromUrl({ season, episode });
        setSeason(current.season);
        setEpisode(current.episode);
      }
      recorderRef.current?.flush();
      setSelectedId(nextId);
      setSwitched(true);
      setFailure(null);
      setNotice(null);
      // A deliberate choice starts a fresh chain.
      setAttempted([]);
    },
    [selectedId, hasEpisodes, season, episode]
  );

  const handleFailure = useCallback(
    (next: PlaybackFailure) => {
      // Ignore anything from a surface that is no longer on screen.
      if (next.providerId !== selectedId) return;
      const from = provider;
      const fallback = selectFallbackCandidate(
        plan.candidates,
        type,
        next.providerId,
        attempted
      );
      if (fallback && from) {
        // Permitted only because the failing provider reports its own failures —
        // the manager enforces that, and the viewer is still told.
        setAttempted((prev) => [...prev, next.providerId]);
        setSelectedId(fallback.provider.id);
        setSwitched(true);
        setFailure(null);
        setNotice({ from: from.displayName, to: fallback.provider.displayName });
        return;
      }
      setFailure(next);
    },
    [selectedId, provider, plan.candidates, type, attempted]
  );

  /** Next provider for the manual "switch" action in the error state. */
  const manualAlternative = useMemo(() => {
    const switchable = switchableCandidates(plan.candidates, type);
    return switchable.find((c) => c.provider.id !== selectedId) ?? null;
  }, [plan.candidates, type, selectedId]);

  const selectEpisode = useCallback(
    (nextSeason: number, nextEpisode: number) => {
      if (nextSeason === season && nextEpisode === episode) return;
      setSeason(nextSeason);
      setEpisode(nextEpisode);
      setFailure(null);
      recorderRef.current?.retarget({
        media,
        episode: {
          seasonNumber: nextSeason,
          episodeNumber: nextEpisode,
          title: episodeTitle(seasonsWithEpisodes, nextSeason, nextEpisode),
        },
      });
      // Mirror what the custom player does, so the URL stays the shared source of
      // truth for the current episode across a provider switch.
      window.history.replaceState(
        null,
        "",
        `/watch/tv/${media.tmdbId}?s=${nextSeason}&e=${nextEpisode}`
      );
    },
    [season, episode, media, seasons]
  );

  /** An embed provider reported the item finished. */
  const handleEnded = useCallback(() => {
    recorderRef.current?.ended();
    if (!autoplay || !hasEpisodes) return;
    const next = nextEpisodeOf(seasonsWithEpisodes, season, episode);
    if (next) selectEpisode(next.season, next.episode);
  }, [autoplay, hasEpisodes, seasons, season, episode, selectEpisode]);

  // -------------------------------- render ---------------------------------

  if (!candidate || !provider) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-text">
        <PlaybackUnavailable mediaType={type} />
        <div className="absolute left-3 top-3 sm:left-5">
          <BackButton href={backHref} />
        </div>
      </div>
    );
  }

  const selector =
    plan.providers.length > 0 ? (
      <ProviderSelector
        providers={plan.providers}
        selectedId={selectedId}
        onSelect={selectProvider}
      />
    ) : null;

  const nativeSurface =
    candidate.surface.kind === "native" ? candidate.surface : null;
  const embedSurface =
    candidate.surface.kind === "embed" ? candidate.surface : null;
  const isNative = nativeSurface !== null;
  const contextLabel = hasEpisodes
    ? `${media.title} · S${season}:E${episode}`
    : media.title;

  const noticeNode = notice ? (
    <div className="fixed left-1/2 top-16 z-[70] -translate-x-1/2">
      <FallbackNotice
        fromName={notice.from}
        toName={notice.to}
        onDismiss={() => setNotice(null)}
      />
    </div>
  ) : null;

  // ---- shared watch-page layout (reference replica, REA-verified) ----
  // Expanded embed URL per provider id — feeds the ServerPanel's live
  // reachability probe (each provider's origin gets a no-cors ping).
  // Anime chains: the season being played aggregates its own AniList entry,
  // so {anilistId} templates address that entry (vidy.st's path is per-entry
  // and episode-numbered within it).
  const playingSeason = detail?.seasons?.find((s) => s.seasonNumber === season);
  const playAnilistId = playingSeason?.anilistId ?? media.tmdbId;
  const playTmdbId =
    playingSeason?.resolvedTmdbId ?? detail?.resolvedTmdbId ?? media.tmdbId;
  const embedUrls: Record<string, string> = {};
  for (const c of plan.candidates) {
    if (c.surface.kind === "embed") {
      embedUrls[c.provider.id] = expandTemplate(c.surface.urlTemplate, {
        id: type === "anime" ? playAnilistId : media.tmdbId,
        tmdbId: playTmdbId,
        ...(hasEpisodes
          ? { season, episode }
          : type === "anime"
            ? // Anime movie: the player path is episode-numbered — the movie
              // is its own episode 1.
              { episode: 1 }
            : {}),
      });
    }
  }

  return (
    <div className="relative min-h-screen bg-bg text-text -mt-[var(--rh-nav-h)]">
      {/* Fixed, blurred backdrop wash (reference: fixed scaled backdrop img) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <PosterImage
          src={media.backdropUrl}
          title={media.title}
          type={media.type}
          variant="backdrop"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.35),rgba(0,0,0,0.85)_55%,#000_100%)]" />
      </div>

      {/* Floating back chip (reference geometry: left-3 top-1, sm:left-6 sm:top-4) */}
      <div className="fixed left-3 top-1 z-[60] sm:left-6 sm:top-4">
        <BackButton href={backHref} />
      </div>

      <div className="relative z-10 mx-auto max-w-[1700px] px-4 pt-16 sm:pt-6 md:px-8">
        {/* Player column: glow mask + stage + dock + switch row */}
        <div className="relative px-1">
          {/* Glow behind the stage (reference: radial mask + blur-64 backdrop) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{
              maskImage:
                "radial-gradient(60% 56%, rgb(0, 0, 0) 28%, rgba(0, 0, 0, 0.5) 58%, rgba(0, 0, 0, 0) 82%)",
              WebkitMaskImage:
                "radial-gradient(60% 56%, rgb(0, 0, 0) 28%, rgba(0, 0, 0, 0.5) 58%, rgba(0, 0, 0, 0) 82%)",
            }}
          >
            <PosterImage
              src={media.backdropUrl}
              title={media.title}
              type={media.type}
              variant="backdrop"
              className="h-full w-full scale-125 object-cover blur-[64px]"
            />
          </div>

          <div className="relative flex flex-col items-center px-2 pb-0 pt-10 sm:pt-14 md:px-8 md:pt-20">
            {/* Stage (reference: max-w-1180, aspect-video, rounded top only) */}
            <div
              ref={stageRef}
              className={`relative aspect-video w-full overflow-hidden rounded-2xl rounded-b-none border border-b-0 border-white/[0.09] bg-black shadow-[0_60px_160px_-24px_rgba(0,0,0,0.98),0_28px_70px_-12px_rgba(0,0,0,0.85)] ${
                theater ? "" : "max-w-[1180px]"
              }`}
            >
              {isNative ? (
                <VideoPlayer
                  // Remounting per provider keeps the player's own lifecycle intact
                  // (it re-reads saved progress on mount) instead of mutating it.
                  key={`native:${selectedId}`}
                  embedded
                  type={type}
                  media={media}
                  overview={overview}
                  runtime={runtime}
                  seasons={seasons}
                  servers={nativeSurface.servers}
                  initialSeasonNumber={season}
                  initialEpisodeNumber={episode}
                  initialSeconds={switched ? undefined : initialSeconds}
                  backHref={backHref}
                />
              ) : (
                <>
                  {failure ? (
                    <PlaybackError
                      providerName={provider.displayName}
                      detail={failure.detail}
                      onRetry={() => {
                        setFailure(null);
                        setReloadKey((k) => k + 1);
                      }}
                      onSwitch={
                        manualAlternative
                          ? () => selectProvider(manualAlternative.provider.id)
                          : undefined
                      }
                      nextProviderName={manualAlternative?.provider.displayName}
                    />
                  ) : (
                    <EmbedSurface
                      provider={provider}
                      src={expandTemplate(
                        (embedSurface as { urlTemplate: string }).urlTemplate,
                        {
                          id: type === "anime" ? playAnilistId : media.tmdbId,
                          tmdbId: playTmdbId,
                          ...(hasEpisodes
                            ? { season, episode }
                            : type === "anime"
                              ? { episode: 1 }
                              : {}),
                        }
                      )}
                      title={`${provider.displayName} player — ${contextLabel}`}
                      reloadKey={reloadKey}
                      onProgress={(seconds, duration) =>
                        recorderRef.current?.report({ seconds, duration })
                      }
                      onEnded={handleEnded}
                      onFailure={handleFailure}
                    />
                  )}
                </>
              )}
            </div>

            {/* Control dock joined under the stage (reference anatomy) */}
            <div className={`relative z-[2] w-full ${theater ? "" : "max-w-[1180px]"}`}>
              <WatchDock
                media={media}
                theater={theater}
                season={season}
                episode={episode}
                onToggleTheater={() => setTheater((v) => !v)}
                onFullscreen={toggleStageFullscreen}
                onNotPlaying={focusServerPanel}
              />
              {/* "Not playing? Switch server" — its own right-aligned row under
                  the dock (reference: mt-3 justify-end, amber). */}
              <div className="mt-3 flex w-full items-center justify-end px-1">
                <button
                  type="button"
                  onClick={focusServerPanel}
                  className="group inline-flex items-center gap-2 text-[12px] text-amber-400/75 transition-colors hover:text-amber-300"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" x2="12" y1="8" y2="12" />
                    <line x1="12" x2="12.01" y1="16" y2="16" />
                  </svg>
                  <span>
                    Not playing?{" "}
                    {/* Reference: the link text itself is the brighter amber
                        (amber-300), constant — only the underline is hover-only. */}
                    <span className="font-semibold text-amber-300 underline-offset-2 group-hover:underline">
                      Switch server
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {noticeNode}

        {/* Servers panel (reference: full container width, mt-3 px-1) */}
        <div className="mt-3 px-1 pb-16">
          {plan.providers.length > 0 && (
            <ServerPanel
              providers={plan.providers}
              selectedId={selectedId}
              onSelect={selectProvider}
              embedUrls={embedUrls}
              // F1 carries many servers — wrap them onto multiple rows instead
              // of hiding most behind a horizontal rail. Its speed test is
              // deferred so the 100 KB measurement never competes with the
              // stream at startup; the Test button still works.
              wrap={type === "f1"}
              autoTestSpeed={type !== "f1"}
            />
          )}

          {/* Episodes (TV only, reference position: directly below the
              servers panel) */}
          {hasEpisodes && (
            <WatchEpisodes
              seasons={seasonsWithEpisodes}
              season={season}
              episode={episode}
              onSelectEpisode={selectEpisode}
              media={media}
              loadSeasonEpisodes={loadSeasonEpisodes}
            />
          )}

          {/* Details card (reference: mt-3 px-1, full width glass) */}
          {detail && (
            <div className="mt-3">
              <WatchDetails
                detail={detail}
                seasonInfo={hasEpisodes ? `S${season} · E${episode}` : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* Trailer + recommendations (reference: second container, py-10) */}
      {detail && (
        <div className="relative z-10 mx-auto max-w-[1700px] px-4 py-10 md:px-8">
          {detail.trailerKey && (
            <TrailerSection trailerKey={detail.trailerKey} trailerName={detail.trailerName} />
          )}
          <RecommendationsSection title={detail.title} items={detail.recommendations ?? []} />
        </div>
      )}

      {/* TV watch page: the reference has no episode drawer/button — episode
          selection happens from the series detail page, and the native player
          keeps its own next-episode flow when it is the surface. */}
    </div>
  );
}

function BackButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Back"
      className="group inline-flex cursor-pointer select-none items-center gap-2 rounded-[11px] border border-white/[0.09] bg-[hsl(150_3%_12%)] py-2.5 pl-2.5 pr-3.5 text-[13px] font-semibold text-foreground shadow-[0_10px_28px_-10px_rgba(0,0,0,0.9)] transition-colors hover:bg-[hsl(150_3%_16%)] sm:py-2"
    >
      <BackIcon size={18} className="text-[hsl(150_3%_62%)] transition-transform duration-200 group-hover:-translate-x-0.5" />
      Back
    </Link>
  );
}
