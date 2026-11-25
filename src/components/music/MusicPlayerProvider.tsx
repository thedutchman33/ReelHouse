"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MusicTrack } from "@/lib/music/types";
import { streamUrlForTrack } from "@/lib/music/stream";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// One persistent audio engine for every Reelhouse Music view.
//
// Audius streams play directly from the browser. Jamendo streams are resolved
// by the same-origin stream route because their audio URLs carry a short-lived
// token. The queue, volume, shuffle and repeat state live outside the view
// tree: opening a playlist, artist or search result never interrupts playback.
//
// The time readout is deliberately a separate context. A 4 Hz timeupdate must
// repaint the progress bar and synced lyrics, not every card on the page.
// ---------------------------------------------------------------------------

const VOLUME_KEY = "reelhouse:music:volume";
const SHUFFLE_KEY = "reelhouse:music:shuffle";
const REPEAT_KEY = "reelhouse:music:repeat";

export type RepeatMode = "off" | "all" | "one";

interface PlayerValue {
  queue: MusicTrack[];
  currentTrack: MusicTrack | null;
  currentIndex: number;
  contextLabel: string;
  isPlaying: boolean;
  isLoading: boolean;
  playError: string | null;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  playQueue: (tracks: MusicTrack[], startIndex?: number, label?: string) => void;
  playTrack: (track: MusicTrack, queue?: MusicTrack[], label?: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: MusicTrack, playNext?: boolean) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  restart: () => void;
}

interface ProgressValue {
  currentTime: number;
  duration: number;
}

const PlayerContext = createContext<PlayerValue | null>(null);
const ProgressContext = createContext<ProgressValue | null>(null);

export function useMusicPlayer(): PlayerValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("useMusicPlayer must be used inside MusicPlayerProvider");
  return value;
}

export function usePlayerProgress(): ProgressValue {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("usePlayerProgress must be used inside MusicPlayerProvider");
  return value;
}

function readVolume(): number {
  if (typeof window === "undefined") return 0.8;
  const value = Number(window.localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.8;
}

function readShuffle(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SHUFFLE_KEY) === "1";
}

function readRepeat(): RepeatMode {
  if (typeof window === "undefined") return "off";
  const value = window.localStorage.getItem(REPEAT_KEY);
  return value === "all" || value === "one" ? value : "off";
}

export default function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [contextLabel, setContextLabel] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const queueRef = useRef(queue);
  const indexRef = useRef(currentIndex);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  const currentTrackRef = useRef(currentTrack);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const skipTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef(0);
  const retryTrackIdRef = useRef<string | null>(null);
  const retryProgressStartRef = useRef(0);

  queueRef.current = queue;
  indexRef.current = currentIndex;
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;
  currentTrackRef.current = currentTrack;
  volumeRef.current = volume;
  mutedRef.current = muted;

  const persist = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode / full storage: playback still works for this session.
    }
  }, []);

  const startTrack = useCallback(
    (track: MusicTrack, autoPlay: boolean) => {
      const audio = audioRef.current;
      if (skipTimerRef.current !== null) {
        window.clearTimeout(skipTimerRef.current);
        skipTimerRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptsRef.current = 0;
      retryTrackIdRef.current = track.id;
      retryProgressStartRef.current = 0;
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(track.duration || 0);
      setPlayError(null);
      setIsLoading(autoPlay);
      setIsPlaying(autoPlay);
      if (!audio) return;
      const source = streamUrlForTrack(track);
      if (!source) {
        setPlayError("This track does not have a playable stream.");
        setIsPlaying(false);
        setIsLoading(false);
        return;
      }
      try {
        audio.src = source;
        audio.currentTime = 0;
        audio.load();
        if (autoPlay) {
          const started = audio.play();
          if (started) {
            started.catch(() => {
              setIsPlaying(false);
              setIsLoading(false);
            });
          }
        }
      } catch {
        setPlayError("This track could not be played.");
        setIsPlaying(false);
        setIsLoading(false);
      }
    },
    []
  );

  const playQueue = useCallback(
    (tracks: MusicTrack[], startIndex = 0, label = "") => {
      const clean = tracks.filter((track) => Boolean(track?.id));
      if (clean.length === 0) return;
      const index = Math.max(0, Math.min(startIndex, clean.length - 1));
      setQueue(clean);
      queueRef.current = clean;
      setCurrentIndex(index);
      indexRef.current = index;
      setContextLabel(label);
      startTrack(clean[index], true);
    },
    [startTrack]
  );

  const playTrack = useCallback(
    (track: MusicTrack, nextQueue?: MusicTrack[], label = "") => {
      const targetQueue = nextQueue?.length ? nextQueue : [track];
      const startIndex = Math.max(
        0,
        targetQueue.findIndex((item) => item.id === track.id)
      );
      playQueue(targetQueue, startIndex, label);
    },
    [playQueue]
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackRef.current) return;
    if (audio.paused) {
      // Once a source has errored, calling play() again without reloading it
      // only reproduces the same error. Re-resolve the current track instead.
      if (audio.error) {
        startTrack(currentTrackRef.current, true);
        return;
      }
      setPlayError(null);
      if (audio.ended) audio.currentTime = 0;
      const started = audio.play();
      if (started) {
        started
          .then(() => setIsPlaying(true))
          .catch((cause: unknown) => {
            setIsPlaying(false);
            if (cause instanceof DOMException && cause.name === "AbortError") return;
            setPlayError("This track could not be played.");
          });
      }
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [startTrack]);

  const goNext = useCallback(
    (fromEnd = false) => {
      const list = queueRef.current;
      const index = indexRef.current;
      if (list.length === 0) return;

      if (shuffleRef.current && list.length > 1) {
        let nextIndex = index;
        while (nextIndex === index) {
          nextIndex = Math.floor(Math.random() * list.length);
        }
        setCurrentIndex(nextIndex);
        indexRef.current = nextIndex;
        startTrack(list[nextIndex], true);
        return;
      }

      if (index < list.length - 1) {
        const nextIndex = index + 1;
        setCurrentIndex(nextIndex);
        indexRef.current = nextIndex;
        startTrack(list[nextIndex], true);
        return;
      }

      if (repeatRef.current === "all") {
        setCurrentIndex(0);
        indexRef.current = 0;
        startTrack(list[0], true);
        return;
      }

      if (fromEnd) {
        setIsPlaying(false);
        setIsLoading(false);
      }
    },
    [startTrack]
  );

  const next = useCallback(() => goNext(false), [goNext]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    const list = queueRef.current;
    const index = indexRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    if (index > 0) {
      const previousIndex = index - 1;
      setCurrentIndex(previousIndex);
      indexRef.current = previousIndex;
      startTrack(list[previousIndex], true);
    }
  }, [startTrack]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const bounded = Math.max(0, Math.min(seconds, audio.duration || duration || 0));
    audio.currentTime = bounded;
    setCurrentTime(bounded);
  }, [duration]);

  const setVolume = useCallback(
    (nextVolume: number) => {
      const bounded = Math.max(0, Math.min(1, nextVolume));
      setVolumeState(bounded);
      setMuted(bounded === 0);
      const audio = audioRef.current;
      if (audio) {
        audio.volume = bounded;
        audio.muted = false;
      }
      persist(VOLUME_KEY, String(bounded));
    },
    [persist]
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    const nextMuted = !mutedRef.current;
    setMuted(nextMuted);
    if (audio) audio.muted = nextMuted;
  }, []);

  const toggleShuffle = useCallback(() => {
    const nextValue = !shuffleRef.current;
    setShuffle(nextValue);
    shuffleRef.current = nextValue;
    persist(SHUFFLE_KEY, nextValue ? "1" : "0");
  }, [persist]);

  const cycleRepeat = useCallback(() => {
    const nextValue: RepeatMode =
      repeatRef.current === "off" ? "all" : repeatRef.current === "all" ? "one" : "off";
    setRepeat(nextValue);
    repeatRef.current = nextValue;
    persist(REPEAT_KEY, nextValue);
  }, [persist]);

  const addToQueue = useCallback(
    (track: MusicTrack, playNext = false) => {
      if (!currentTrackRef.current) {
        playQueue([track], 0, "Queue");
        return;
      }
      const list = [...queueRef.current];
      const index = indexRef.current;
      const insertAt = playNext ? index + 1 : list.length;
      list.splice(insertAt, 0, track);
      setQueue(list);
      queueRef.current = list;
      toast(playNext ? "Playing next" : "Added to queue", { tone: "success" });
    },
    [playQueue]
  );

  const removeFromQueue = useCallback((index: number) => {
    const list = [...queueRef.current];
    if (index < 0 || index >= list.length) return;
    if (index === indexRef.current) return;
    list.splice(index, 1);
    const nextIndex = index < indexRef.current ? indexRef.current - 1 : indexRef.current;
    setQueue(list);
    queueRef.current = list;
    setCurrentIndex(nextIndex);
    indexRef.current = nextIndex;
  }, []);

  const clearQueue = useCallback(() => {
    const index = indexRef.current;
    const list = queueRef.current.slice(0, index + 1);
    setQueue(list);
    queueRef.current = list;
  }, []);

  const restart = useCallback(() => {
    seek(0);
  }, [seek]);

  // Hydrate persisted preferences and attach to the audio element once.
  useEffect(() => {
    const savedVolume = readVolume();
    setVolumeState(savedVolume);
    setShuffle(readShuffle());
    setRepeat(readRepeat());
    const audio = audioRef.current;
    if (audio) audio.volume = savedVolume;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime || 0);
      // A retry budget is earned back only after the replacement stream has
      // played healthily for 30 seconds, so a hard failure cannot loop.
      if (
        retryAttemptsRef.current > 0 &&
        retryTrackIdRef.current === currentTrackRef.current?.id
      ) {
        if (retryProgressStartRef.current === 0) {
          retryProgressStartRef.current = audio.currentTime;
        } else if (audio.currentTime - retryProgressStartRef.current >= 30) {
          retryAttemptsRef.current = 0;
        }
      }
    };
    const onMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
      setIsLoading(false);
    };
    const onCanPlay = () => setIsLoading(false);
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => {
      retryProgressStartRef.current = audio.currentTime;
      setPlayError(null);
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      const errorCode = audio.error?.code;
      const track = currentTrackRef.current;
      const retryableSourceError =
        (errorCode === MediaError.MEDIA_ERR_NETWORK ||
          errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) &&
        track !== null &&
        retryTrackIdRef.current === track.id;

      // Mirror a bounded playback-recovery budget. Chrome reports a failed
      // proxy request as SRC_NOT_SUPPORTED as well as a network error, so both
      // get two fresh same-origin attempts before the queue advances.
      if (retryableSourceError && retryAttemptsRef.current < 2) {
        retryAttemptsRef.current += 1;
        const attempt = retryAttemptsRef.current;
        setPlayError(null);
        setIsLoading(true);
        setIsPlaying(true);
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          const currentAudio = audioRef.current;
          const current = currentTrackRef.current;
          if (!currentAudio || !current || current.id !== track.id) return;
          const source = streamUrlForTrack(current);
          if (!source) {
            setIsPlaying(false);
            setIsLoading(false);
            setPlayError("This track does not have a playable stream.");
            return;
          }
          retryProgressStartRef.current = 0;
          currentAudio.src = `${source}&retry=${attempt}`;
          currentAudio.load();
          const started = currentAudio.play();
          if (started) {
            started.catch(() => {
              setIsPlaying(false);
              setIsLoading(false);
            });
          }
        }, 700 * attempt);
        return;
      }

      setIsPlaying(false);
      setIsLoading(false);
      const unsupported = errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;
      setPlayError(
        unsupported
          ? "This track is unavailable on YouTube Music. Try another track."
          : "This track could not be played. Try another track."
      );

      // A broken provider stream should not leave playback stranded on a track
      // that can never load. Skip only when a real next track exists; if this
      // is the end of the queue, keep the error visible so the listener knows
      // why playback stopped.
      const list = queueRef.current;
      const index = indexRef.current;
      const hasNext =
        list.length > 1 &&
        (index < list.length - 1 ||
          repeatRef.current === "all" ||
          shuffleRef.current === true);
      if (!hasNext || skipTimerRef.current !== null) return;

      toast("That track is unavailable. Skipping to the next one.");
      skipTimerRef.current = window.setTimeout(() => {
        skipTimerRef.current = null;
        goNext(false);
      }, 1_200);
    };
    const onEnded = () => {
      const audio = audioRef.current;
      if (repeatRef.current === "one" && audio) {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      goNext(true);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("durationchange", onMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("durationchange", onMetadata);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, [goNext]);

  useEffect(() => {
    return () => {
      if (skipTimerRef.current !== null) {
        window.clearTimeout(skipTimerRef.current);
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  // Keyboard transport, matching the service's space / Ctrl+arrow shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (typing) return;

      if (event.code === "Space" && !(target instanceof HTMLButtonElement)) {
        if (!currentTrackRef.current) return;
        event.preventDefault();
        toggle();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, next, previous]);

  // Media Session gives hardware keys and lock-screen controls real metadata.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!currentTrack) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artistName,
      album: currentTrack.albumTitle ?? "Reelhouse Music",
      artwork: currentTrack.artworkUrl
        ? [{ src: currentTrack.artworkUrl, sizes: "1000x1000", type: "image/jpeg" }]
        : [],
    });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => toggle()],
      ["pause", () => toggle()],
      ["nexttrack", () => next()],
      ["previoustrack", () => previous()],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") seek(details.seekTime);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Older browsers support only a subset of actions.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore unsupported actions
        }
      }
    };
  }, [currentTrack, toggle, next, previous, seek]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const playerValue = useMemo<PlayerValue>(
    () => ({
      queue,
      currentTrack,
      currentIndex,
      contextLabel,
      isPlaying,
      isLoading,
      playError,
      volume,
      muted,
      shuffle,
      repeat,
      playQueue,
      playTrack,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      removeFromQueue,
      clearQueue,
      restart,
    }),
    [
      queue,
      currentTrack,
      currentIndex,
      contextLabel,
      isPlaying,
      isLoading,
      playError,
      volume,
      muted,
      shuffle,
      repeat,
      playQueue,
      playTrack,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      removeFromQueue,
      clearQueue,
      restart,
    ]
  );

  const progressValue = useMemo(
    () => ({ currentTime, duration }),
    [currentTime, duration]
  );

  return (
    <PlayerContext.Provider value={playerValue}>
      <ProgressContext.Provider value={progressValue}>
        {children}
        <audio ref={audioRef} preload="metadata" className="hidden" />
      </ProgressContext.Provider>
    </PlayerContext.Provider>
  );
}
