"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { MediaSummary, MediaType } from "@/types";

// ---------------------------------------------------------------------------
// Reelhouse personal library (V1: localStorage).
//
// Watchlist, watch history, continue-watching and playback progress all live
// here. The API is deliberately storage-agnostic so Phase 2 can swap the
// backing store for Supabase/PostgreSQL (PRD data model) without changing any
// component — components only ever call these hooks/functions.
// ---------------------------------------------------------------------------

const KEY = "reelhouse:v1";
const COMPLETE_RATIO = 0.92;

export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export interface ProgressEntry {
  key: string;
  media: MediaSummary;
  episode: EpisodeRef | null;
  position: number;
  duration: number;
  updatedAt: number;
  completed: boolean;
}

interface LibraryState {
  watchlist: MediaSummary[];
  progress: Record<string, ProgressEntry>;
}

const EMPTY: LibraryState = { watchlist: [], progress: {} };

let cache: LibraryState = EMPTY;
let loaded = false;
// True only when a Supabase user is signed in (set by the sync layer below).
// When false, this module behaves EXACTLY like Phase 1 (localStorage only).
let serverEnabled = false;
const listeners = new Set<() => void>();

function load(): void {
  if (typeof window === "undefined") {
    cache = EMPTY;
    return;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<LibraryState>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  loaded = true;
}

function ensureLoaded(): void {
  if (!loaded) load();
}

function commit(next: LibraryState): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* quota / private mode — keep in-memory copy */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  ensureLoaded();
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      load();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): LibraryState {
  ensureLoaded();
  return cache;
}

function getServerSnapshot(): LibraryState {
  return EMPTY;
}

// ------------------------------- mutations ---------------------------------

export function progressKey(mediaId: string, episode?: EpisodeRef | null): string {
  return episode ? `${mediaId}:s${episode.seasonNumber}e${episode.episodeNumber}` : mediaId;
}

export function toggleWatchlist(item: MediaSummary): void {
  ensureLoaded();
  const exists = cache.watchlist.some((w) => w.id === item.id);
  const watchlist = exists
    ? cache.watchlist.filter((w) => w.id !== item.id)
    : [item, ...cache.watchlist];
  commit({ ...cache, watchlist });
  if (serverEnabled) void pushWatchlist(exists ? "remove" : "add", item);
}

export function saveProgress(input: {
  media: MediaSummary;
  episode?: EpisodeRef | null;
  position: number;
  duration: number;
}): void {
  ensureLoaded();
  const { media, episode = null, duration } = input;
  if (!duration || duration <= 0) return;
  const position = Math.max(0, Math.min(input.position, duration));
  const key = progressKey(media.id, episode);
  const entry: ProgressEntry = {
    key,
    media,
    episode,
    position,
    duration,
    updatedAt: Date.now(),
    completed: position / duration >= COMPLETE_RATIO,
  };
  commit({ ...cache, progress: { ...cache.progress, [key]: entry } });
  if (serverEnabled) void pushProgress(entry);
}

/**
 * Record that playback STARTED for a title/episode, before any position or
 * duration is known.
 *
 * Every playback surface calls this, which is what makes watch history
 * provider-independent: the built-in player calls it on its first `play`, and the
 * playback container calls it when an external provider's player takes over. An
 * embed provider only ever reports a position if it documents progress events, so
 * without this nothing would create the entry at all (see
 * `createProgressRecorder`, which is deliberately inert for such providers).
 *
 * Deliberately conservative: an existing entry keeps its position, duration and
 * `completed` flag and only has `updatedAt` bumped. So this can never create a
 * duplicate (provider switching, episode re-selection, remounts), never rewind a
 * saved position, and never resurrects a finished title.
 */
export function markPlaybackStarted(input: {
  media: MediaSummary;
  episode?: EpisodeRef | null;
}): void {
  ensureLoaded();
  const { media, episode = null } = input;
  const key = progressKey(media.id, episode);
  const existing = cache.progress[key];
  const entry: ProgressEntry = existing
    ? { ...existing, updatedAt: Date.now() }
    : {
        key,
        media,
        episode,
        position: 0,
        // Not known yet. Every percentage consumer treats 0 as "unknown", and a
        // real duration lands as soon as the surface can report one.
        duration: 0,
        updatedAt: Date.now(),
        completed: false,
      };
  commit({ ...cache, progress: { ...cache.progress, [key]: entry } });
  if (serverEnabled) void pushProgress(entry);
}

export function removeProgress(key: string): void {
  ensureLoaded();
  const entry = cache.progress[key];
  if (!entry) return;
  const progress = { ...cache.progress };
  delete progress[key];
  commit({ ...cache, progress });
  if (serverEnabled) void deleteProgressRemote(entry);
}

export function clearHistory(): void {
  ensureLoaded();
  commit({ ...cache, progress: {} });
  if (serverEnabled) void clearHistoryRemote();
}

export function readProgress(key: string): ProgressEntry | undefined {
  ensureLoaded();
  return cache.progress[key];
}

// ------------------------------ server sync --------------------------------
// Phase 2: when a Supabase user is signed in, localStorage becomes a fast local
// mirror and every mutation is ALSO pushed to the server (best effort). On sign
// in we hydrate from the server, merging any anonymous local data up (a one-time
// migration). Signed out or unconfigured, none of this runs — the store behaves
// exactly like Phase 1. All network calls are best-effort: on failure the local
// state is still correct and reconciles on the next hydrate.

// Records which Supabase user the local mirror belongs to, so we never push one
// user's leftover local data into another user's account on a shared browser.
const OWNER_KEY = "reelhouse:owner";

function getOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function setOwner(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(OWNER_KEY, id);
    else window.localStorage.removeItem(OWNER_KEY);
  } catch {
    /* ignore */
  }
}

async function pushWatchlist(
  action: "add" | "remove",
  item: MediaSummary
): Promise<void> {
  try {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, item }),
    });
  } catch {
    /* offline — reconciled on next hydrate */
  }
}

async function pushProgress(entry: ProgressEntry): Promise<void> {
  try {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry }),
    });
  } catch {
    /* best effort */
  }
}

async function deleteProgressRemote(entry: ProgressEntry): Promise<void> {
  try {
    const params = new URLSearchParams({ media_id: entry.media.id });
    if (entry.episode) {
      params.set("season", String(entry.episode.seasonNumber));
      params.set("episode", String(entry.episode.episodeNumber));
    }
    await fetch(`/api/history?${params.toString()}`, { method: "DELETE" });
  } catch {
    /* best effort */
  }
}

async function clearHistoryRemote(): Promise<void> {
  try {
    await fetch("/api/history", { method: "DELETE" });
  } catch {
    /* best effort */
  }
}

/** Append-only playback analytics (playback_events). No-op when signed out. */
export function logPlaybackEvent(input: {
  media: MediaSummary;
  episode?: EpisodeRef | null;
  eventType: "play" | "pause" | "ended" | "seek" | "progress";
  position: number;
}): void {
  if (!serverEnabled) return;
  const { media, episode = null, eventType, position } = input;
  fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_id: media.id,
      season: episode?.seasonNumber ?? null,
      episode: episode?.episodeNumber ?? null,
      event_type: eventType,
      position: Math.round(position),
    }),
  }).catch(() => {
    /* analytics are best-effort */
  });
}

async function fetchServerState(): Promise<LibraryState | null> {
  try {
    const [wRes, hRes] = await Promise.all([
      fetch("/api/watchlist", { headers: { Accept: "application/json" } }),
      fetch("/api/history", { headers: { Accept: "application/json" } }),
    ]);
    // 401 => not actually signed in on the server; caller reverts to local.
    if (wRes.status === 401 || hRes.status === 401) return null;
    if (!wRes.ok || !hRes.ok) return EMPTY;
    const wJson = (await wRes.json()) as { items?: MediaSummary[] };
    const hJson = (await hRes.json()) as { entries?: ProgressEntry[] };
    const progress: Record<string, ProgressEntry> = {};
    for (const e of hJson.entries ?? []) progress[e.key] = e;
    return { watchlist: wJson.items ?? [], progress };
  } catch {
    return EMPTY;
  }
}

/** Result of reconciling a local library against the server's. */
export interface MergeResult {
  /** Merged watchlist: server items first, then local-only items (union by id). */
  watchlist: MediaSummary[];
  /** Merged progress: newest `updatedAt` wins per key. */
  progress: Record<string, ProgressEntry>;
  /** Local watchlist items not on the server — to push up (migration). */
  localOnlyWatch: MediaSummary[];
  /** Local progress entries newer than the server's — to push up. */
  localNewer: ProgressEntry[];
}

/**
 * Pure reconciliation of a local library against the server's — the core of the
 * one-time sign-in migration, extracted so it can be unit-tested without a
 * browser or network. Watchlist is a union by id (server first); progress keeps
 * the newest `updatedAt` per key. When `localIsOurs` is false (the local mirror
 * belongs to a different user on a shared browser), local data is ignored
 * entirely and the server's state is used as-is. Returns the merged state plus
 * the local-only / local-newer entries the caller must push up.
 */
export function mergeLibrary(
  local: LibraryState,
  server: LibraryState,
  { localIsOurs }: { localIsOurs: boolean }
): MergeResult {
  const effectiveLocal = localIsOurs ? local : EMPTY;

  // Watchlist: server items first, then local-only items (union by id).
  const serverIds = new Set(server.watchlist.map((m) => m.id));
  const localOnlyWatch = effectiveLocal.watchlist.filter((m) => !serverIds.has(m.id));
  const watchlist = [...server.watchlist, ...localOnlyWatch];

  // Progress: newest updatedAt wins per key.
  const progress: Record<string, ProgressEntry> = { ...server.progress };
  const localNewer: ProgressEntry[] = [];
  for (const [key, entry] of Object.entries(effectiveLocal.progress)) {
    const remote = server.progress[key];
    if (!remote || entry.updatedAt > remote.updatedAt) {
      progress[key] = entry;
      localNewer.push(entry);
    }
  }

  return { watchlist, progress, localOnlyWatch, localNewer };
}

/**
 * Enable server sync for `userId` and reconcile local ↔ server. Merges the
 * anonymous local library up on first sign-in; on a shared browser where the
 * local mirror belongs to a different user, the local data is ignored (never
 * pushed) and replaced by the server's.
 */
export async function syncOnSignIn(userId: string): Promise<void> {
  serverEnabled = true;
  ensureLoaded();

  const server = await fetchServerState();
  if (!server) {
    // Server says not signed in — fall back to local behavior.
    serverEnabled = false;
    return;
  }

  const owner = getOwner();
  const localIsOurs = owner === null || owner === userId;
  const { watchlist, progress, localOnlyWatch, localNewer } = mergeLibrary(
    cache,
    server,
    { localIsOurs }
  );

  commit({ watchlist, progress });
  setOwner(userId);

  // One-time migration + offline catch-up: push local-only / local-newer up.
  localOnlyWatch.forEach((m) => void pushWatchlist("add", m));
  localNewer.forEach((e) => void pushProgress(e));
}

/** Disable server sync and clear the local mirror (data stays on the server). */
export function syncOnSignOut(): void {
  serverEnabled = false;
  setOwner(null);
  commit(EMPTY);
}

// --------------------------------- hooks -----------------------------------

function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useWatchlist(): MediaSummary[] {
  return useLibrary().watchlist;
}

export function useIsInWatchlist(id: string): boolean {
  const { watchlist } = useLibrary();
  return useMemo(() => watchlist.some((w) => w.id === id), [watchlist, id]);
}

export function useContinueWatching(): ProgressEntry[] {
  const { progress } = useLibrary();
  return useMemo(
    () =>
      // Anything started and not finished, newest first. An entry only exists
      // because playback actually started, so there is nothing else to gate on —
      // a minimum-position threshold here used to hide titles the viewer had
      // genuinely started (and every title playing on a provider that reports no
      // position at all).
      Object.values(progress)
        .filter((p) => !p.completed)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [progress]
  );
}

export function useHistory(): ProgressEntry[] {
  const { progress } = useLibrary();
  return useMemo(
    () => Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt),
    [progress]
  );
}

export function useProgressEntry(
  mediaId: string,
  episode?: EpisodeRef | null
): ProgressEntry | undefined {
  const { progress } = useLibrary();
  const key = progressKey(mediaId, episode);
  return progress[key];
}

/** Most recent progress entry for a title (any episode) — powers Resume. */
export function useLatestProgressFor(mediaId: string): ProgressEntry | undefined {
  const { progress } = useLibrary();
  return useMemo(
    () =>
      Object.values(progress)
        .filter((p) => p.media.id === mediaId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [progress, mediaId]
  );
}

/** Stable callback bundle for imperative use inside components. */
export function useLibraryActions() {
  return useMemo(
    () => ({ toggleWatchlist, saveProgress, removeProgress, clearHistory }),
    []
  );
}

export type { MediaSummary, MediaType };
