// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markPlaybackStarted,
  progressKey,
  saveProgress,
  syncOnSignIn,
  syncOnSignOut,
  useContinueWatching,
  useHistory,
  type ProgressEntry,
} from "@/lib/library";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// Watch history / Continue Watching regression suite.
//
// The bug this pins down: nothing wrote a history entry when playback STARTED.
// The only writers were the built-in player's throttled progress save and the
// embed progress recorder — and the recorder is deliberately inert for a provider
// without documented progress events, so such a title was never recorded at all.
// A title started and stopped before finishing therefore went missing from Watch
// History / Continue Watching.
//
// jsdom (not the default `node` env) because the store is localStorage-backed and
// the two read paths are hooks.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const movie: MediaSummary = {
  id: "movie-550",
  tmdbId: 550,
  type: "movie",
  title: "Ashfall",
  genres: ["Drama"],
};

const show: MediaSummary = {
  id: "tv-1399",
  tmdbId: 1399,
  type: "tv",
  title: "Northwind",
  genres: ["Drama"],
};

const s2e5 = { seasonNumber: 2, episodeNumber: 5, title: "The Long Room" };

/** Render a hook once and return the value it saw. */
async function readHook<T>(hook: () => T): Promise<T> {
  let captured!: T;
  function Probe() {
    captured = hook();
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe));
  });
  const value = captured;
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return value;
}

const history = () => readHook(useHistory);
const continueWatching = () => readHook(useContinueWatching);

function stored(): Record<string, ProgressEntry> {
  const raw = window.localStorage.getItem("reelhouse:v1");
  return raw ? (JSON.parse(raw) as { progress: Record<string, ProgressEntry> }).progress : {};
}

beforeEach(() => {
  // Public API only: this resets `serverEnabled` and the in-memory mirror, so no
  // module-registry surgery is needed for isolation.
  syncOnSignOut();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("markPlaybackStarted — a started title is in the library immediately", () => {
  it("records a movie on start, keeps it after stopping midway", async () => {
    markPlaybackStarted({ media: movie });

    // Before any progress event at all.
    expect(await history()).toHaveLength(1);
    expect((await continueWatching()).map((e) => e.key)).toEqual(["movie-550"]);
    expect((await history())[0]).toMatchObject({
      key: "movie-550",
      position: 0,
      duration: 0,
      completed: false,
    });

    // Watch a while, then leave before the end.
    saveProgress({ media: movie, position: 42, duration: 100 });

    const entries = await history();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ position: 42, duration: 100, completed: false });
    expect((await continueWatching()).map((e) => e.key)).toEqual(["movie-550"]);
    // Persisted, so leaving the page (or a reload) keeps it.
    expect(Object.keys(stored())).toEqual(["movie-550"]);
  });

  it("records a TV episode on start with the right id, season and episode", async () => {
    markPlaybackStarted({ media: show, episode: s2e5 });
    saveProgress({ media: show, episode: s2e5, position: 300, duration: 2700 });

    const entries = await history();
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe(progressKey("tv-1399", s2e5));
    expect(entries[0].key).toBe("tv-1399:s2e5");
    expect(entries[0].media.tmdbId).toBe(1399);
    expect(entries[0].episode).toEqual(s2e5);
    expect(entries[0].position).toBe(300);
    expect((await continueWatching()).map((e) => e.key)).toEqual(["tv-1399:s2e5"]);
  });

  it("keeps episodes of one show as separate entries", async () => {
    const s2e6 = { seasonNumber: 2, episodeNumber: 6, title: "Hollow Season" };
    markPlaybackStarted({ media: show, episode: s2e5 });
    saveProgress({ media: show, episode: s2e5, position: 300, duration: 2700 });
    markPlaybackStarted({ media: show, episode: s2e6 });

    expect(Object.keys(stored()).sort()).toEqual(["tv-1399:s2e5", "tv-1399:s2e6"]);
  });

  it("never rewinds a saved position or duplicates on repeat starts", async () => {
    saveProgress({ media: movie, position: 42, duration: 100 });
    markPlaybackStarted({ media: movie });

    const entries = await history();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ position: 42, duration: 100 });
  });
});

describe("completed titles", () => {
  it("stays completed (and out of Continue Watching) when playback is re-started", async () => {
    saveProgress({ media: movie, position: 96, duration: 100 });
    expect((await history())[0].completed).toBe(true);
    expect(await continueWatching()).toEqual([]);

    // Re-opening a finished title must not resurrect it as continue-watching.
    markPlaybackStarted({ media: movie });

    const entries = await history();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ position: 96, duration: 100, completed: true });
    expect(await continueWatching()).toEqual([]);
  });

  it("still records a finished title in Watch History", async () => {
    saveProgress({ media: movie, position: 100, duration: 100 });
    expect((await history()).map((e) => e.key)).toEqual(["movie-550"]);
  });
});

describe("provider independence", () => {
  it("switching provider mid-title does not create a duplicate history entry", async () => {
    // Built-in surface marks the start, then reports progress.
    markPlaybackStarted({ media: show, episode: s2e5 });
    saveProgress({ media: show, episode: s2e5, position: 300, duration: 2700 });

    // Viewer switches to an embed provider (container marks the start again),
    // then back. The key is provider-independent, so this must stay one row.
    markPlaybackStarted({ media: show, episode: s2e5 });
    markPlaybackStarted({ media: show, episode: s2e5 });

    const entries = await history();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ position: 300, duration: 2700, completed: false });
    expect(Object.keys(stored())).toEqual(["tv-1399:s2e5"]);
  });

  it("orders Continue Watching by most recently started/watched", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    saveProgress({ media: movie, position: 10, duration: 100 });
    now.mockReturnValue(2_000);
    markPlaybackStarted({ media: show, episode: s2e5 });

    expect((await continueWatching()).map((e) => e.key)).toEqual([
      "tv-1399:s2e5",
      "movie-550",
    ]);
    now.mockRestore();
  });
});

describe("signed-in users (Supabase leg)", () => {
  it("pushes both the start marker and later progress to /api/history", async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const payload = url.startsWith("/api/watchlist") ? { items: [] } : { entries: [] };
        return { ok: true, status: 200, json: async () => payload } as Response;
      })
    );

    await syncOnSignIn("user-1");
    markPlaybackStarted({ media: show, episode: s2e5 });
    saveProgress({ media: show, episode: s2e5, position: 300, duration: 2700 });
    await new Promise((r) => setTimeout(r, 0));

    const posts = calls.filter((c) => c.url === "/api/history" && c.method === "POST");
    expect(posts).toHaveLength(2);

    const started = (posts[0].body as { entry: ProgressEntry }).entry;
    expect(started).toMatchObject({
      key: "tv-1399:s2e5",
      position: 0,
      duration: 0,
      completed: false,
    });
    expect(started.episode).toEqual(s2e5);

    const progressed = (posts[1].body as { entry: ProgressEntry }).entry;
    expect(progressed).toMatchObject({ position: 300, duration: 2700 });

    syncOnSignOut();
  });
});
