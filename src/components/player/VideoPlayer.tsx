"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  logPlaybackEvent,
  markPlaybackStarted,
  progressKey,
  readProgress,
  saveProgress,
} from "@/lib/library";
import type { EpisodeRef } from "@/lib/library";
import { clamp, formatRuntime, yearOf } from "@/lib/utils";
import type { MediaSummary, MediaType, PlaybackServer, Season, SubtitleTrack } from "@/types";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  FAVORITE_SERVERS_KEY,
  type SettingsTab,
  type SubtitleAppearance,
} from "./constants";
import PlayerOverlay from "./PlayerOverlay";
import PlayerSettings from "./PlayerSettings";
import EpisodeDrawer from "./EpisodeDrawer";
import { activeCue, parseVtt, type Cue } from "./vtt";

const SAVE_INTERVAL_MS = 5000;
// The <video> element fires `timeupdate` roughly four times a second, and every
// tick used to push the new position into React state — re-rendering the whole
// player tree (including the mounted-but-closed settings panel and episode
// drawer) ~4x/second for the entire runtime of a title. Nothing in the UI can
// show more than one change per second: the readout is whole seconds and the
// progress bar moves sub-pixel amounts. `currentTimeRef` still tracks the exact
// position every tick, so persistence, resume and seeking keep full precision.
const TIME_UI_INTERVAL_MS = 1000;
const HIDE_DELAY_MS = 3200;

// Next episode within a season, then rolling into the next season.
function findNext(seasons: Season[], s: number, e: number) {
  const si = seasons.findIndex((x) => x.seasonNumber === s);
  if (si < 0) return null;
  const season = seasons[si];
  const eps = season.episodes ?? [];
  const ei = eps.findIndex((x) => x.episodeNumber === e);
  if (ei >= 0 && ei < eps.length - 1) {
    const n = eps[ei + 1];
    return { seasonNumber: n.seasonNumber, episodeNumber: n.episodeNumber, title: n.title };
  }
  const ns = seasons[si + 1];
  if (ns && ns.episodes?.[0]) {
    const n = ns.episodes[0];
    return { seasonNumber: n.seasonNumber, episodeNumber: n.episodeNumber, title: n.title };
  }
  return null;
}

// Convert an .srt file's contents to WebVTT so the same parser handles both.
function srtToVtt(text: string): string {
  const body = text.replace(/\r\n/g, "\n").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}

export default function VideoPlayer({
  type,
  media,
  overview,
  runtime,
  seasons,
  servers,
  initialSeasonNumber,
  initialEpisodeNumber,
  initialSeconds,
  backHref,
  embedded = false,
  onEpisodeChange,
}: {
  type: MediaType;
  media: MediaSummary;
  overview?: string;
  runtime?: number;
  seasons: Season[];
  servers: PlaybackServer[];
  initialSeasonNumber?: number;
  initialEpisodeNumber?: number;
  initialSeconds?: number;
  backHref: string;
  /** Fired when the player itself moves to another episode (Next / drawer /
      autoplay), so the surrounding page and watch history follow along. */
  onEpisodeChange?: (seasonNumber: number, episodeNumber: number) => void;
  /** Render inside a 16:9 page section (watch-page layout) instead of a
      fullscreen takeover. All controls, settings and overlays are unchanged —
      they are absolutely positioned within this container either way. */
  embedded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  // Wall-clock ms of the last `currentTime` push into React state (see
  // TIME_UI_INTERVAL_MS).
  const lastTimeUi = useRef(0);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const wasPlaying = useRef(false);
  const sourceMounted = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasEpisodes = type === "tv" && seasons.length > 0;

  // ----- selection + playback state -----
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const [season, setSeason] = useState(initialSeasonNumber ?? 1);
  const [episode, setEpisode] = useState(initialEpisodeNumber ?? 1);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ended, setEnded] = useState(false);
  const [errored, setErrored] = useState(false);

  // ----- UI state -----
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("quality");
  const [subtitleView, setSubtitleView] = useState<"list" | "appearance" | "search">("list");
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ----- feature state -----
  const [quality, setQuality] = useState("auto");
  const [speed, setSpeed] = useState(1);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [uploadedTracks, setUploadedTracks] = useState<SubtitleTrack[]>([]);
  const [appearance, setAppearance] = useState<SubtitleAppearance>(DEFAULT_APPEARANCE);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [autoplay, setAutoplay] = useState(true);

  // ----- subtitle cues -----
  const [cues, setCues] = useState<Cue[]>([]);
  const [cueText, setCueText] = useState<string | null>(null);

  // ----- derived -----
  const server = useMemo(
    () => servers.find((s) => s.id === serverId) ?? servers[0],
    [servers, serverId]
  );
  const source = server?.source;
  const subtitleTracks = useMemo<SubtitleTrack[]>(
    () => [...(source?.subtitles ?? []), ...uploadedTracks],
    [source, uploadedTracks]
  );

  const currentEpisodeObj = useMemo(() => {
    if (!hasEpisodes) return null;
    const s = seasons.find((x) => x.seasonNumber === season);
    return s?.episodes?.find((x) => x.episodeNumber === episode) ?? null;
  }, [hasEpisodes, seasons, season, episode]);

  // Progress is keyed by the season/episode PLAYING, not by whether its metadata
  // has arrived. Live series pages ship season metadata only (episodes load from
  // /api/seasons afterwards), so requiring the episode object here left
  // `episodeRef` null on first paint: resume read the wrong key, progress was
  // written without a season/episode, and watch history could never show
  // anything but the item itself. The coordinates are known synchronously; the
  // episode object only improves the label.
  const episodeRef = useMemo<EpisodeRef | null>(() => {
    if (!hasEpisodes) return null;
    return {
      seasonNumber: season,
      episodeNumber: episode,
      title: currentEpisodeObj?.title ?? `Episode ${episode}`,
    };
  }, [hasEpisodes, season, episode, currentEpisodeObj]);

  const next = useMemo(
    () => (hasEpisodes ? findNext(seasons, season, episode) : null),
    [hasEpisodes, seasons, season, episode]
  );

  const runtimeLabel = formatRuntime(currentEpisodeObj?.runtime ?? runtime);
  const badge = media.genres?.[0] ?? (type === "tv" ? "Series" : "Film");
  const metaLine = hasEpisodes
    ? [`Season ${season}`, `Episode ${episode}`, runtimeLabel].filter(Boolean).join(" · ")
    : [yearOf(media.releaseDate), runtimeLabel, media.genres?.[0]].filter(Boolean).join(" · ");
  const episodeTitle = hasEpisodes ? currentEpisodeObj?.title : undefined;
  const description = currentEpisodeObj?.overview ?? overview;

  // ---------------------------------------------------------------------------
  // Progress persistence (preserved from the original player).
  // ---------------------------------------------------------------------------
  // The episode currently on screen, read at the moment of writing. Persistence
  // runs from listeners and effect cleanups, where the episode captured at an
  // older render is no longer the one the media element is showing — writing
  // then put the NEW episode's 0s under the PREVIOUS episode's key, wiping the
  // position just left behind.
  const liveEpisodeRef = useRef<EpisodeRef | null>(episodeRef);
  liveEpisodeRef.current = episodeRef;

  const persist = useCallback(() => {
    const v = videoRef.current;
    // React detaches this ref during unmount, BEFORE the effect cleanup below
    // runs — so reading the element alone silently dropped the "viewer left the
    // page" save and history kept whatever the last throttled save had written.
    // The refs are updated on every timeupdate/seek, so they are the position of
    // record once the element is gone.
    const liveDuration = v && v.duration && !Number.isNaN(v.duration) ? v.duration : 0;
    const duration = liveDuration || durationRef.current;
    if (!duration) return;
    const position = v ? v.currentTime : currentTimeRef.current;
    saveProgress({ media, episode: liveEpisodeRef.current, position, duration });
  }, [media]);

  const logEvent = useCallback(
    (eventType: "play" | "pause" | "ended") => {
      logPlaybackEvent({ media, episode: episodeRef, eventType, position: videoRef.current?.currentTime ?? 0 });
    },
    [media, episodeRef]
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [persist]);

  // ---------------------------------------------------------------------------
  // Mount: full-viewport takeover (lock scroll), restore saved prefs, listeners.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    try {
      const rawApp = window.localStorage.getItem(APPEARANCE_KEY);
      if (rawApp) setAppearance({ ...DEFAULT_APPEARANCE, ...JSON.parse(rawApp) });
      const rawFav = window.localStorage.getItem(FAVORITE_SERVERS_KEY);
      if (rawFav) setFavoriteIds(JSON.parse(rawFav));
    } catch {
      /* ignore malformed prefs */
    }

    const onFs = () => {
      const fsEl =
        document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl));
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  // Reload the media element whenever the resolved source URL changes (server
  // switch), preserving position + play state. Skips the initial mount so the
  // first-load resume logic in onLoadedMetadata runs instead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!sourceMounted.current) {
      sourceMounted.current = true;
      return;
    }
    pendingSeek.current = currentTimeRef.current;
    wasPlaying.current = !v.paused;
    v.load();
  }, [source?.playbackUrl]);

  // Load + parse the selected subtitle track (custom rendering for full control).
  useEffect(() => {
    if (!subtitleUrl) {
      setCues([]);
      setCueText(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(subtitleUrl, { signal: ctrl.signal })
      .then((r) => r.text())
      .then((txt) => setCues(parseVtt(txt)))
      .catch(() => setCues([]));
    return () => ctrl.abort();
  }, [subtitleUrl]);

  // Keep playbackRate in sync with the selected speed.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed]);

  // ---------------------------------------------------------------------------
  // Controls auto-hide
  // ---------------------------------------------------------------------------
  const anyPanelOpen = settingsOpen || episodesOpen;

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsVisible(false);
    }, HIDE_DELAY_MS);
  }, []);

  const bump = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Force controls visible whenever paused or a panel is open.
  useEffect(() => {
    if (anyPanelOpen || !playing) {
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      scheduleHide();
    }
  }, [anyPanelOpen, playing, scheduleHide]);

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setEnded(false);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const dur = v.duration || 0;
    const clamped = clamp(t, 0, dur || t);
    v.currentTime = clamped;
    currentTimeRef.current = clamped;
    // Direct, unthrottled push: scrubbing and keyboard seeks stay instant. This
    // also restarts the throttle window, since the state is now up to date.
    lastTimeUi.current = Date.now();
    setCurrentTime(clamped);
  }, []);

  // Push the exact position into state, bypassing the throttle. Used at the
  // moments playback stops, so the readout can never sit up to a second behind
  // a paused or finished video.
  const flushTimeUi = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    lastTimeUi.current = Date.now();
    setCurrentTime(v.currentTime);
  }, []);

  const rewind = useCallback(() => seekTo((videoRef.current?.currentTime ?? 0) - 10), [seekTo]);
  const forward = useCallback(() => seekTo((videoRef.current?.currentTime ?? 0) + 10), [seekTo]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const doc = document as unknown as {
      fullscreenElement?: Element;
      webkitFullscreenElement?: Element;
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => void;
    };
    const node = el as unknown as {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => void;
    };
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      (node.requestFullscreen ?? node.webkitRequestFullscreen)?.call(el);
    } else {
      (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Media element event handlers
  // ---------------------------------------------------------------------------
  // Resume must not depend on the media element's `loadedmetadata` event alone:
  // the element is server-rendered, and a fast (or same-origin/local) source can
  // finish loading metadata before React attaches the handler, so the event is
  // missed and the title restarts at 0. The same one-shot restore is therefore
  // also attempted once the player is mounted.
  const resumeAttempted = useRef(false);
  const restoreInitialPosition = useCallback(() => {
    const v = videoRef.current;
    if (!v || resumeAttempted.current) return;
    const total = v.duration;
    if (!total || Number.isNaN(total)) return;
    resumeAttempted.current = true;
    // First-load resume: explicit ?t, else saved progress for THIS episode.
    let start = initialSeconds;
    if (start == null) {
      const saved = readProgress(progressKey(media.id, episodeRef));
      if (saved && !saved.completed) start = saved.position;
    }
    // Skip the first few seconds (nothing worth resuming) and the last stretch
    // before the credits. The end guard scales down for very short clips, whose
    // duration can be smaller than a fixed 15s — with the bundled 10s samples
    // the old subtraction was negative, making every sample unresumable.
    const endGuard = Math.min(15, total * 0.2);
    if (start && start > 5 && total - start > endGuard) {
      v.currentTime = start;
      // Keep the position of record in step. A source (re)load restores from
      // currentTimeRef, so leaving it at 0 here silently undid the resume —
      // e.g. when the source effect's second dev-mode run reloads the element.
      currentTimeRef.current = start;
      setCurrentTime(start);
    }
  }, [initialSeconds, media.id, episodeRef]);

  useEffect(() => {
    restoreInitialPosition();
  }, [restoreInitialPosition]);

  const computeBuffered = (v: HTMLVideoElement) => {
    try {
      const t = v.currentTime;
      for (let i = 0; i < v.buffered.length; i++) {
        if (t >= v.buffered.start(i) && t <= v.buffered.end(i)) return v.buffered.end(i);
      }
      return v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
    } catch {
      return 0;
    }
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    durationRef.current = v.duration || 0;
    v.playbackRate = speed;

    // Restore across a source reload (server switch).
    if (pendingSeek.current != null) {
      const target = clamp(pendingSeek.current, 0, v.duration || pendingSeek.current);
      v.currentTime = target;
      pendingSeek.current = null;
      if (wasPlaying.current) v.play().catch(() => {});
      return;
    }

    // First-load resume (explicit ?t, else saved progress for this episode).
    // Shared with the mount-time attempt above, which covers a metadata event
    // that fired before this handler existed.
    restoreInitialPosition();
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    currentTimeRef.current = v.currentTime;

    const now = Date.now();
    // Throttled: the exact position lives in currentTimeRef above, this only
    // drives the readout and the progress bar.
    if (now - lastTimeUi.current >= TIME_UI_INTERVAL_MS) {
      lastTimeUi.current = now;
      setCurrentTime(v.currentTime);
    }
    setBuffered(computeBuffered(v));
    if (cues.length) setCueText(activeCue(cues, v.currentTime, appearance.latency));

    if (now - lastSave.current > SAVE_INTERVAL_MS) {
      lastSave.current = now;
      persist();
    }
  };

  const gotoEpisode = useCallback(
    (s: number, e: number) => {
      if (!hasEpisodes) return;
      if (s === season && e === episode) return;
      // Flush the OUTGOING episode first: the 5s throttle would otherwise drop
      // whatever was watched since the last save, and an episode abandoned in
      // its first seconds would have no record at all.
      persist();
      const seasonObj = seasons.find((x) => x.seasonNumber === s);
      const epObj = seasonObj?.episodes?.find((x) => x.episodeNumber === e);
      // Not requiring epObj: the target season's episodes may still be loading.
      const ref: EpisodeRef = {
        seasonNumber: s,
        episodeNumber: e,
        title: epObj?.title ?? `Episode ${e}`,
      };
      setSeason(s);
      setEpisode(e);
      setEnded(false);
      setEpisodesOpen(false);
      try {
        window.history.replaceState(null, "", `/watch/tv/${media.tmdbId}?s=${s}&e=${e}`);
      } catch {
        /* ignore */
      }
      // Put the new episode in watch history immediately. The element's `play`
      // event is NOT enough: changing episodes mid-playback calls play() on an
      // already-playing element, which fires no event at all — so Next Episode
      // used to leave history (and Continue Watching) on the previous episode.
      markPlaybackStarted({ media, episode: ref });
      const v = videoRef.current;
      if (v) {
        const saved = readProgress(progressKey(media.id, ref));
        const start = saved && !saved.completed ? saved.position : 0;
        try {
          v.currentTime = start;
        } catch {
          /* ignore */
        }
        currentTimeRef.current = start;
        // A new episode starts a fresh save window instead of inheriting the
        // old one, so its first progress write lands within the second.
        lastSave.current = 0;
        setCurrentTime(start);
        v.play().catch(() => {});
      }
      onEpisodeChange?.(s, e);
    },
    [hasEpisodes, season, episode, persist, seasons, media, onEpisodeChange]
  );

  // Episode selection from OUTSIDE the player (the Episodes rail below it on
  // the watch page). The player owns season/episode while it is on screen, so
  // only a NEW pair of initial props moves it: the parent echoing the player's
  // own navigation back as those same props must not re-seek playback.
  const propEpisode = useRef({
    season: initialSeasonNumber ?? 1,
    episode: initialEpisodeNumber ?? 1,
  });
  useEffect(() => {
    const nextPropSeason = initialSeasonNumber ?? 1;
    const nextPropEpisode = initialEpisodeNumber ?? 1;
    const prev = propEpisode.current;
    if (prev.season === nextPropSeason && prev.episode === nextPropEpisode) return;
    propEpisode.current = { season: nextPropSeason, episode: nextPropEpisode };
    gotoEpisode(nextPropSeason, nextPropEpisode);
  }, [initialSeasonNumber, initialEpisodeNumber, gotoEpisode]);

  const onEnded = () => {
    flushTimeUi();
    persist();
    logEvent("ended");
    if (hasEpisodes && autoplay && next) {
      gotoEpisode(next.seasonNumber, next.episodeNumber);
    } else {
      setEnded(true);
      setPlaying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Feature handlers
  // ---------------------------------------------------------------------------
  const selectServer = (id: string) => setServerId(id);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const nextIds = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(FAVORITE_SERVERS_KEY, JSON.stringify(nextIds));
      } catch {
        /* ignore */
      }
      return nextIds;
    });
  };

  const changeAppearance = (patch: Partial<SubtitleAppearance>) =>
    setAppearance((a) => ({ ...a, ...patch }));

  const resetAppearance = () => setAppearance(DEFAULT_APPEARANCE);

  const saveAppearance = () => {
    try {
      window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      /* ignore */
    }
    setAppearanceSaved(true);
    setTimeout(() => setAppearanceSaved(false), 2400);
  };

  const uploadSubtitle = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const vtt = file.name.toLowerCase().endsWith(".srt") ? srtToVtt(raw) : raw;
      const blob = new Blob([vtt], { type: "text/vtt" });
      const url = URL.createObjectURL(blob);
      const track: SubtitleTrack = {
        label: file.name.replace(/\.(vtt|srt)$/i, "") || "Uploaded",
        srcLang: "up",
        url,
      };
      setUploadedTracks((prev) => [...prev, track]);
      setSubtitleUrl(url);
    };
    reader.readAsText(file);
  };

  // A subtitle chosen from OpenSubtitles search arrives already fetched + parsed
  // to a Blob URL (see SubtitleSearch). Add it to the track list and select it.
  const loadFoundSubtitle = (track: SubtitleTrack) => {
    setUploadedTracks((prev) => (prev.some((t) => t.url === track.url) ? prev : [...prev, track]));
    setSubtitleUrl(track.url);
  };

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    if (tab === "subtitles") setSubtitleView("list");
    setEpisodesOpen(false);
    setSettingsOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const v = videoRef.current;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          bump();
          break;
        case "ArrowLeft":
          rewind();
          bump();
          break;
        case "ArrowRight":
          forward();
          bump();
          break;
        case "ArrowUp":
          if (v) v.volume = clamp(v.volume + 0.1, 0, 1);
          break;
        case "ArrowDown":
          if (v) v.volume = clamp(v.volume - 0.1, 0, 1);
          break;
        case "m":
          if (v) v.muted = !v.muted;
          break;
        case "f":
          toggleFullscreen();
          break;
        case "Escape":
          if (settingsOpen) setSettingsOpen(false);
          else if (episodesOpen) setEpisodesOpen(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, rewind, forward, toggleFullscreen, bump, settingsOpen, episodesOpen]);

  const retry = () => {
    setErrored(false);
    const v = videoRef.current;
    if (v) {
      v.load();
      v.play().catch(() => {});
    }
  };

  const subtitleOverlayBottom = controlsVisible ? "7.5rem" : "2rem";

  if (!source) return null;

  return (
    <div
      ref={containerRef}
      className={`select-none bg-black ${
        embedded
          ? "relative aspect-video w-full overflow-hidden"
          : `fixed inset-0 z-50 ${controlsVisible ? "" : "cursor-none"}`
      }`}
      onMouseMove={bump}
      onPointerDown={bump}
    >
      {/* Stage — click toggles play; taps also reveal controls via bump */}
      <div className="absolute inset-0" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={source.playbackUrl}
          className="h-full w-full bg-black object-contain"
          playsInline
          preload="metadata"
          poster={source.poster}
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={() => {
            const d = videoRef.current?.duration || 0;
            durationRef.current = d;
            setDuration(d);
          }}
          onTimeUpdate={onTimeUpdate}
          onProgress={() => {
            const v = videoRef.current;
            if (v) setBuffered(computeBuffered(v));
          }}
          onPlay={() => {
            setPlaying(true);
            // Starting playback is what puts a title in Watch History /
            // Continue Watching — before this, nothing was written until the
            // first throttled timeupdate save.
            markPlaybackStarted({ media, episode: episodeRef });
            logEvent("play");
            bump();
          }}
          onPause={() => {
            setPlaying(false);
            flushTimeUi();
            persist();
            logEvent("pause");
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={onEnded}
          onError={() => setErrored(true)}
        />
      </div>

      {/* Custom subtitle overlay */}
      {cueText && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6 text-center transition-all duration-300"
          style={{ bottom: subtitleOverlayBottom }}
        >
          <span
            className="max-w-3xl whitespace-pre-line rounded px-3 py-1 leading-snug"
            style={{
              fontSize: `${appearance.fontSize}px`,
              color: appearance.color,
              backgroundColor: appearance.blur > 0 ? "rgba(0,0,0,0.35)" : "transparent",
              backdropFilter: appearance.blur > 0 ? `blur(${appearance.blur / 5}px)` : undefined,
              WebkitBackdropFilter: appearance.blur > 0 ? `blur(${appearance.blur / 5}px)` : undefined,
              textShadow: "0 2px 6px rgba(0,0,0,0.9)",
            }}
          >
            {cueText}
          </span>
        </div>
      )}

      {/* Sample-source badge (top-right, clear of the back button) */}
      {source.isSample && controlsVisible && (
        <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
          Licensed sample
        </div>
      )}

      {/* Cinematic chrome */}
      <PlayerOverlay
        visible={controlsVisible}
        backHref={backHref}
        badge={badge}
        title={media.title}
        metaLine={metaLine}
        episodeTitle={episodeTitle}
        description={description}
        playing={playing}
        buffering={buffering}
        onPlayPause={togglePlay}
        onRewind={rewind}
        onForward={forward}
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        onSeek={seekTo}
        onScrubStart={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
        }}
        onScrubEnd={bump}
        hasEpisodes={hasEpisodes}
        canNext={Boolean(next)}
        isFullscreen={isFullscreen}
        hideBack={embedded}
        subtitlesOn={subtitleUrl !== null}
        serversActive={settingsOpen && settingsTab === "servers"}
        onNext={() => next && gotoEpisode(next.seasonNumber, next.episodeNumber)}
        onEpisodes={() => {
          setSettingsOpen(false);
          setEpisodesOpen(true);
        }}
        onSubtitles={() => openSettings("subtitles")}
        onSettings={() => openSettings("quality")}
        onSource={() => openSettings("servers")}
        onFullscreen={toggleFullscreen}
      />

      {/* Right-side settings panel */}
      <PlayerSettings
        open={settingsOpen}
        tab={settingsTab}
        onTab={(t) => {
          setSettingsTab(t);
          if (t === "subtitles") setSubtitleView("list");
        }}
        onClose={() => setSettingsOpen(false)}
        quality={quality}
        onQuality={setQuality}
        speed={speed}
        onSpeed={setSpeed}
        servers={servers}
        selectedServerId={server.id}
        favoriteIds={favoriteIds}
        onSelectServer={selectServer}
        onToggleFavorite={toggleFavorite}
        subtitleTracks={subtitleTracks}
        selectedSubtitle={subtitleUrl}
        onSelectSubtitle={setSubtitleUrl}
        onUploadSubtitle={uploadSubtitle}
        subtitleView={subtitleView}
        onSubtitleView={setSubtitleView}
        subtitleSearch={{
          type,
          tmdbId: media.tmdbId,
          title: media.title,
          season: hasEpisodes ? season : undefined,
          episode: hasEpisodes ? episode : undefined,
        }}
        onLoadFoundSubtitle={loadFoundSubtitle}
        appearance={appearance}
        onAppearanceChange={changeAppearance}
        onAppearanceReset={resetAppearance}
        onAppearanceSave={saveAppearance}
        appearanceSaved={appearanceSaved}
      />

      {/* Episodes drawer (TV only) */}
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
          onSelectEpisode={gotoEpisode}
        />
      )}

      {/* Ended / up-next */}
      {ended && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 p-6 text-center">
          <div>
            {next ? (
              <>
                <p className="text-xs uppercase tracking-widest text-muted">Up next</p>
                <p className="mt-1 text-lg font-semibold text-text">
                  S{next.seasonNumber} · E{next.episodeNumber} — {next.title}
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => gotoEpisode(next.seasonNumber, next.episodeNumber)}
                    className="btn-primary"
                  >
                    Play next episode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnded(false);
                      seekTo(0);
                      videoRef.current?.play().catch(() => {});
                    }}
                    className="btn-ghost"
                  >
                    Replay
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-text">You&apos;re all caught up</p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEnded(false);
                      seekTo(0);
                      videoRef.current?.play().catch(() => {});
                    }}
                    className="btn-primary"
                  >
                    Replay
                  </button>
                  <Link href={backHref} className="btn-ghost">
                    Back to details
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error / retry */}
      {errored && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/85 p-6 text-center">
          <div className="max-w-sm">
            <p className="text-lg font-semibold text-text">Playback couldn&apos;t start</p>
            <p className="mt-2 text-sm text-muted">
              This source may be temporarily unavailable. Try again, or pick another source.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <button type="button" onClick={retry} className="btn-primary">
                Retry
              </button>
              <button
                type="button"
                onClick={() => openSettings("servers")}
                className="btn-ghost"
              >
                Change source
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
