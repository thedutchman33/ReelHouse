"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import EpisodeDrawer from "@/components/player/EpisodeDrawer";
import VideoPlayer from "@/components/player/VideoPlayer";
import { BackIcon, EpisodesIcon } from "@/components/player/icons";
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
import type { MediaSummary, MediaType, Season } from "@/types";
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
    season?.episodes.find((x) => x.episodeNumber === e)?.title ?? `Episode ${e}`
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
  const episodes = seasons[si].episodes;
  const ei = episodes.findIndex((x) => x.episodeNumber === e);
  if (ei >= 0 && ei < episodes.length - 1) {
    const n = episodes[ei + 1];
    return { season: n.seasonNumber, episode: n.episodeNumber };
  }
  const next = seasons[si + 1]?.episodes[0];
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
  overview?: string;
  runtime?: number;
  seasons: Season[];
  plan: PlaybackPlan;
  initialSeasonNumber?: number;
  initialEpisodeNumber?: number;
  initialSeconds?: number;
  backHref: string;
}) {
  const hasEpisodes = type === "tv" && seasons.length > 0;

  const [selectedId, setSelectedId] = useState(
    () => selectInitialCandidate(plan.candidates, type)?.provider.id ?? ""
  );
  const [season, setSeason] = useState(initialSeasonNumber ?? 1);
  const [episode, setEpisode] = useState(initialEpisodeNumber ?? 1);
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);
  // Providers that already failed in this chain — never retried automatically,
  // which is what stops fallback from looping.
  const [attempted, setAttempted] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ from: string; to: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
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
    ? { seasonNumber: season, episodeNumber: episode, title: episodeTitle(seasons, season, episode) }
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
    // exists, so it is deliberately not marked here.
    if (surfaceKind === "embed") {
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
      setEpisodesOpen(false);
      if (nextSeason === season && nextEpisode === episode) return;
      setSeason(nextSeason);
      setEpisode(nextEpisode);
      setFailure(null);
      recorderRef.current?.retarget({
        media,
        episode: {
          seasonNumber: nextSeason,
          episodeNumber: nextEpisode,
          title: episodeTitle(seasons, nextSeason, nextEpisode),
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
    const next = nextEpisodeOf(seasons, season, episode);
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

  const selector = (
    <ProviderSelector
      providers={plan.providers}
      selectedId={selectedId}
      onSelect={selectProvider}
    />
  );

  // ---- native surface: the existing custom player, untouched ----
  if (candidate.surface.kind === "native") {
    return (
      <>
        <VideoPlayer
          // Remounting per provider keeps the player's own lifecycle intact
          // (it re-reads saved progress on mount) instead of mutating it.
          key={`native:${selectedId}`}
          type={type}
          media={media}
          overview={overview}
          runtime={runtime}
          seasons={seasons}
          servers={candidate.surface.servers}
          initialSeasonNumber={season}
          initialEpisodeNumber={episode}
          initialSeconds={switched ? undefined : initialSeconds}
          backHref={backHref}
        />
        {plan.providers.length > 0 && (
          <div className="fixed left-1/2 top-3 z-[60] -translate-x-1/2">
            {selector}
          </div>
        )}
        {notice && (
          <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2">
            <FallbackNotice
              fromName={notice.from}
              toName={notice.to}
              onDismiss={() => setNotice(null)}
            />
          </div>
        )}
      </>
    );
  }

  // ---- embed surface: the provider draws its own player ----
  const embedSrc = expandTemplate(candidate.surface.urlTemplate, {
    id: media.tmdbId,
    ...(hasEpisodes ? { season, episode } : {}),
  });

  const contextLabel = hasEpisodes
    ? `${media.title} · S${season}:E${episode}`
    : media.title;

  return (
    <div className="fixed inset-0 z-50 bg-black text-text">
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
          src={embedSrc}
          title={`${provider.displayName} player — ${contextLabel}`}
          reloadKey={reloadKey}
          onProgress={(seconds, duration) =>
            recorderRef.current?.report({ seconds, duration })
          }
          onEnded={handleEnded}
          onFailure={handleFailure}
        />
      )}

      {/* Surrounding chrome only — no playback controls: those are the
          provider's, inside the frame. Stays below EpisodeDrawer's z-40 layer:
          the drawer is modal and its own top row (close, autoplay) sits at these
          same coordinates, so chrome above it would swallow those taps. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 p-3 sm:px-5">
        <div className="pointer-events-auto">
          <BackButton href={backHref} />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate text-sm font-semibold text-text/90">{contextLabel}</p>
          <p className="truncate text-xs text-muted">{provider.displayName}</p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {selector}
          {hasEpisodes && (
            <button
              type="button"
              onClick={() => setEpisodesOpen(true)}
              aria-label="Episodes"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface/90 text-muted shadow-lg backdrop-blur transition hover:text-text"
            >
              <EpisodesIcon size={18} />
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2">
          <FallbackNotice
            fromName={notice.from}
            toName={notice.to}
            onDismiss={() => setNotice(null)}
          />
        </div>
      )}

      {hasEpisodes && (
        <EpisodeDrawer
          open={episodesOpen}
          onClose={() => setEpisodesOpen(false)}
          mediaId={media.id}
          mediaTitle={media.title}
          mediaOverview={overview}
          seasons={seasons}
          currentSeason={season}
          currentEpisode={episode}
          autoplay={autoplay}
          onToggleAutoplay={() => setAutoplay((v) => !v)}
          onSelectEpisode={selectEpisode}
        />
      )}
    </div>
  );
}

function BackButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Back"
      className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/90 text-text shadow-lg backdrop-blur transition hover:bg-surface"
    >
      <BackIcon size={20} />
    </Link>
  );
}
