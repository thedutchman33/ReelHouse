// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  addToCatalog,
  createCatalog,
  deleteCatalog,
  removeFromCatalog,
  renameCatalog,
  toggleCatalogItem,
  toggleReaction,
  toggleWatched,
  useCatalogs,
  useReactionMap,
  useTitleMarks,
  useTitleReaction,
  useWatchedMap,
} from "@/lib/library";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// My List collections: explicit watched marks, thumbs reactions and catalogs.
// These are the three stores the rebuilt page reads, so pin their toggle
// semantics and localStorage shape here.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const film: MediaSummary = {
  id: "movie-9001",
  tmdbId: 9001,
  type: "movie",
  title: "Test Film",
  genres: ["Drama"],
};

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

function stored(): {
  watched: Record<string, { media: MediaSummary }>;
  reactions: Record<string, { value: string; media: MediaSummary }>;
  catalogs: { id: string; name: string; items: MediaSummary[] }[];
} {
  const raw = window.localStorage.getItem("reelhouse:v1");
  return raw ? JSON.parse(raw) : { watched: {}, reactions: {}, catalogs: [] };
}

const catalogById = async (id: string) =>
  (await readHook(useCatalogs)).find((catalog) => catalog.id === id);

describe("starter catalogs", () => {
  it("seeds the reference folders for a new library", async () => {
    const names = (await readHook(useCatalogs)).map((catalog) => catalog.name);
    expect(names).toEqual(
      expect.arrayContaining(["Top Horror Movies", "Top Rated", "Lowest Rated"])
    );
  });
});

describe("watched marks", () => {
  it("toggles a title on and off and keeps its snapshot", async () => {
    toggleWatched(film);

    const watched = await readHook(useWatchedMap);
    expect(watched[film.id]?.media.title).toBe("Test Film");
    expect((await readHook(() => useTitleMarks(film.id))).watched).toBe(true);
    expect(stored().watched[film.id]?.media.id).toBe(film.id);

    toggleWatched(film);
    expect((await readHook(() => useTitleMarks(film.id))).watched).toBe(false);
    expect(stored().watched[film.id]).toBeUndefined();
  });
});

describe("reactions", () => {
  it("keeps like and dislike mutually exclusive and clears on re-pick", async () => {
    toggleReaction(film, "like");
    expect(await readHook(() => useTitleReaction(film.id))).toBe("like");
    expect(stored().reactions[film.id]?.value).toBe("like");

    toggleReaction(film, "dislike");
    expect(await readHook(() => useTitleReaction(film.id))).toBe("dislike");

    toggleReaction(film, "dislike");
    expect(await readHook(() => useTitleReaction(film.id))).toBeNull();
    expect(stored().reactions[film.id]).toBeUndefined();

    // The watch dock's like button reads the same store.
    toggleReaction(film, "like");
    expect((await readHook(useReactionMap))[film.id]?.value).toBe("like");
    toggleReaction(film, "like");
  });
});

describe("catalogs", () => {
  it("creates, renames, fills and deletes a catalog", async () => {
    const id = createCatalog("  Weekend   Picks  ");
    expect(id).toBeTruthy();
    if (!id) return;

    const created = await catalogById(id);
    expect(created?.name).toBe("Weekend Picks");
    expect(created?.items).toEqual([]);

    toggleCatalogItem(id, film);
    expect((await catalogById(id))?.items.map((item) => item.id)).toEqual([film.id]);

    // Adding the same title twice must stay idempotent.
    addToCatalog(id, film);
    expect((await catalogById(id))?.items).toHaveLength(1);

    renameCatalog(id, "Friday Night");
    expect((await catalogById(id))?.name).toBe("Friday Night");
    expect(stored().catalogs.find((catalog) => catalog.id === id)?.name).toBe(
      "Friday Night"
    );

    removeFromCatalog(id, film.id);
    expect((await catalogById(id))?.items).toEqual([]);

    deleteCatalog(id);
    expect(await catalogById(id)).toBeUndefined();
  });

  it("rejects a blank catalog name", () => {
    expect(createCatalog("   ")).toBeNull();
  });
});
