"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AddToListDialog from "@/components/library/AddToListDialog";
import CatalogDialog, {
  type CatalogDialogState,
} from "@/components/library/CatalogDialog";
import CatalogGrid from "@/components/library/CatalogGrid";
import CollectionStats from "@/components/library/CollectionStats";
import LibraryCard from "@/components/library/LibraryCard";
import LibraryFilters from "@/components/library/LibraryFilters";
import WatchHistory from "@/components/library/WatchHistory";
import {
  ArrowLeftIcon,
  ClapperboardIcon,
  EyeIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  XIcon,
} from "@/components/library/icons";
import {
  DEFAULT_LIBRARY_FILTERS,
  catalogKey,
  type CollectionKey,
  type LibraryFilterState,
} from "@/components/library/types";
import {
  addToCatalog,
  createCatalog,
  deleteCatalog,
  removeFromCatalog,
  renameCatalog,
  setWatched,
  toggleWatchlist,
  toggleWatched,
  useCatalogs,
  useReactionMap,
  useWatchedMap,
  useWatchlist,
  type Catalog,
} from "@/lib/library";
import { slugify } from "@/lib/utils";
import type { MediaSummary } from "@/types";

type DetailCollection = "watched" | "liked" | "disliked";

const DETAIL_COLLECTIONS: DetailCollection[] = ["watched", "liked", "disliked"];

function catalogHref(catalog: Catalog): string {
  const slug = slugify(catalog.name);
  return `/my-list/${slug || encodeURIComponent(catalog.id)}`;
}

function EmptyCollection({ name }: { name: string }) {
  return (
    <div className="nm-inset rounded-2xl p-8 md:p-10">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <FolderOpenIcon size={40} className="text-muted" />
        <h2 className="mt-4 font-display text-3xl uppercase tracking-wide text-text">
          {name}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          This catalog is empty right now. Add movies, shows, or anime to start
          building it out.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/movies" className="btn-ghost h-10 px-4 py-0 text-sm">
            <ClapperboardIcon size={16} />
            Browse Movies
          </Link>
          <Link href="/search" className="btn-ghost h-10 px-4 py-0 text-sm">
            <PlusIcon size={16} />
            Add Movies
          </Link>
        </div>
      </div>
    </div>
  );
}

function NoMatches({ onReset }: { onReset: () => void }) {
  return (
    <div className="nm-inset rounded-2xl px-6 py-12 text-center">
      <SearchIcon size={30} className="mx-auto text-muted" />
      <p className="mt-3 text-sm font-semibold text-text">
        No titles match these filters
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Try a different type or genre, or clear the filters to see the whole
        collection.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="btn-ghost mt-4 h-10 px-4 py-0 text-sm"
      >
        <XIcon size={15} />
        Reset filters
      </button>
    </div>
  );
}

function AddMoviesTile() {
  return (
    <Link href="/search" prefetch={false} className="group relative block">
      <div className="nm-inset relative aspect-[2/3] overflow-hidden rounded-xl">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="nm-raise-sm flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105">
            <PlusIcon size={30} className="text-muted" />
          </div>
        </div>
        <div className="absolute inset-x-2 bottom-2 text-center">
          <p className="text-sm font-semibold text-text">Add Movies</p>
          <p className="mt-1 text-xs text-muted">Open search</p>
        </div>
      </div>
    </Link>
  );
}

export default function MyListHub({
  activeCollection,
  weekCount,
}: {
  activeCollection: string;
  weekCount: number;
}) {
  if (DETAIL_COLLECTIONS.includes(activeCollection as DetailCollection)) {
    return <CollectionDetail collection={activeCollection as DetailCollection} />;
  }
  return <WatchlistHub activeCollection={activeCollection} weekCount={weekCount} />;
}

function WatchlistHub({
  activeCollection,
  weekCount,
}: {
  activeCollection: string;
  weekCount: number;
}) {
  const router = useRouter();
  const watchlist = useWatchlist();
  const watchlistIds = useMemo(
    () => new Set(watchlist.map((item) => item.id)),
    [watchlist]
  );
  const catalogs = useCatalogs();
  const watched = useWatchedMap();
  const reactions = useReactionMap();

  const [filters, setFilters] = useState<LibraryFilterState>(
    DEFAULT_LIBRARY_FILTERS
  );
  const [editing, setEditing] = useState(false);
  const [editingTitles, setEditingTitles] = useState(false);
  const [dialog, setDialog] = useState<CatalogDialogState | null>(null);
  const [addItem, setAddItem] = useState<{
    item: MediaSummary;
    anchor: HTMLElement;
  } | null>(null);

  const selectedCatalog =
    activeCollection === "watchlist"
      ? undefined
      : catalogs.find(
          (catalog) =>
            catalog.id === activeCollection ||
            slugify(catalog.name) === activeCollection
        );

  const effectiveSelected: CollectionKey = selectedCatalog
    ? catalogKey(selectedCatalog.id)
    : "watchlist";
  const collectionName = selectedCatalog ? selectedCatalog.name : "Watchlist";
  const baseItems = selectedCatalog ? selectedCatalog.items : watchlist;

  const genres = useMemo(
    () =>
      [...new Set(baseItems.flatMap((item) => item.genres))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [baseItems]
  );
  const activeGenre =
    filters.genre && genres.includes(filters.genre) ? filters.genre : null;

  const visibleItems = useMemo(() => {
    const filtered = baseItems.filter(
      (item) =>
        (filters.type === "all" || item.type === filters.type) &&
        (activeGenre === null || item.genres.includes(activeGenre))
    );
    if (filters.sort === "title") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (filters.sort === "rating") {
      return [...filtered].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    if (filters.sort === "year") {
      return [...filtered].sort((a, b) =>
        (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "")
      );
    }
    return filtered;
  }, [baseItems, filters.type, filters.sort, activeGenre]);

  const watchedInCollection = baseItems.filter(
    (item) => watched[item.id] !== undefined
  ).length;
  const watchedCount = Object.keys(watched).length;
  const likedCount = Object.values(reactions).filter(
    (entry) => entry.value === "like"
  ).length;
  const dislikedCount = Object.values(reactions).filter(
    (entry) => entry.value === "dislike"
  ).length;

  const updateFilters = (patch: Partial<LibraryFilterState>) =>
    setFilters((current) => ({ ...current, ...patch }));

  const removeFromCollection = (item: MediaSummary) => {
    if (selectedCatalog) removeFromCatalog(selectedCatalog.id, item.id);
  };

  return (
    <div className="mx-auto w-full max-w-[1800px] px-5 pb-8 pt-24 sm:px-6 md:px-12">
      <h1 className="mb-2 font-display text-4xl uppercase leading-none tracking-wider text-text md:text-5xl">
        My List
      </h1>

      <CollectionStats
        watchedCount={watchedCount}
        likedCount={likedCount}
        dislikedCount={dislikedCount}
        weekCount={weekCount}
      />

      <CatalogGrid
        catalogs={catalogs}
        watchlistItems={watchlist}
        watchlistSelected={effectiveSelected === "watchlist"}
        selectedKey={effectiveSelected}
        editing={editing}
        onToggleEditing={() => setEditing((value) => !value)}
        onSelectWatchlist={() => router.push("/my-list/watchlist")}
        onSelectCatalog={(catalog) => router.push(catalogHref(catalog))}
        onCreate={() => setDialog({ mode: "create" })}
        onRename={(catalog) => setDialog({ mode: "rename", catalog })}
        onDelete={(catalog) => setDialog({ mode: "delete", catalog })}
      />

      <LibraryFilters
        filters={{ ...filters, genre: activeGenre }}
        genres={genres}
        onChange={updateFilters}
        resultCount={visibleItems.length}
        totalCount={baseItems.length}
      />

      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-muted">
          {collectionName} has {baseItems.length}{" "}
          {baseItems.length === 1 ? "title" : "titles"} ·{" "}
          {watchedInCollection} watched, {baseItems.length - watchedInCollection}{" "}
          not watched
        </p>
        {baseItems.length > 0 && (
          <button
            type="button"
            onClick={() => setEditingTitles((value) => !value)}
            aria-pressed={editingTitles}
            className="nm-raise-sm inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:text-text"
          >
            <PencilIconSmall />
            {editingTitles ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {baseItems.length === 0 ? (
        <EmptyCollection name={collectionName} />
      ) : visibleItems.length === 0 ? (
        <NoMatches
          onReset={() =>
            updateFilters({ type: "all", genre: null, sort: "added" })
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          <AddMoviesTile />
          {visibleItems.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              watched={watched[item.id] !== undefined}
              inWatchlist={watchlistIds.has(item.id)}
              editing={editingTitles}
              onAddToList={(anchor) => setAddItem({ item, anchor })}
              onToggleWatched={() => toggleWatched(item)}
              onRemove={
                selectedCatalog
                  ? () => removeFromCollection(item)
                  : () => toggleWatchlist(item)
              }
            />
          ))}
        </div>
      )}

      <WatchHistory />

      {dialog && (
        <CatalogDialog
          state={dialog}
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            if (dialog.mode === "create") {
              const id = createCatalog(name);
              if (!id) return;
              if (dialog.addItem) addToCatalog(id, dialog.addItem);
              setDialog(null);
              router.push(`/my-list/${slugify(name) || encodeURIComponent(id)}`);
            } else if (dialog.mode === "rename") {
              renameCatalog(dialog.catalog.id, name);
              if (effectiveSelected === catalogKey(dialog.catalog.id)) {
                router.replace(
                  `/my-list/${slugify(name) || encodeURIComponent(dialog.catalog.id)}`
                );
              }
              setDialog(null);
            }
          }}
          onDelete={() => {
            if (dialog.mode !== "delete") return;
            const deletedKey = catalogKey(dialog.catalog.id);
            const wasSelected = effectiveSelected === deletedKey;
            deleteCatalog(dialog.catalog.id);
            setDialog(null);
            if (wasSelected) router.push("/my-list/watchlist");
          }}
        />
      )}

      {addItem && (
        <AddToListDialog
          item={addItem.item}
          anchor={addItem.anchor}
          onClose={() => setAddItem(null)}
        />
      )}
    </div>
  );
}

function PencilIconSmall() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

const DETAIL_CONFIG: Record<
  DetailCollection,
  {
    title: string;
    icon: typeof EyeIcon;
    hint: string;
    empty: string;
  }
> = {
  watched: {
    title: "Watched",
    icon: EyeIcon,
    hint: "Marked as watched",
    empty: "Titles you mark as watched show up here.",
  },
  liked: {
    title: "Liked",
    icon: ThumbsUpIcon,
    hint: "You gave a thumbs up",
    empty: "Titles you gave a thumbs up show up here.",
  },
  disliked: {
    title: "Disliked",
    icon: ThumbsDownIcon,
    hint: "You gave a thumbs down",
    empty: "Titles you gave a thumbs down show up here.",
  },
};

function CollectionDetail({ collection }: { collection: DetailCollection }) {
  const watched = useWatchedMap();
  const reactions = useReactionMap();
  const watchlist = useWatchlist();
  const watchlistIds = useMemo(
    () => new Set(watchlist.map((item) => item.id)),
    [watchlist]
  );
  const [addItem, setAddItem] = useState<{
    item: MediaSummary;
    anchor: HTMLElement;
  } | null>(null);
  const config = DETAIL_CONFIG[collection];
  const Icon = config.icon;

  const items = useMemo(() => {
    if (collection === "watched") {
      return Object.values(watched)
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .map((entry) => entry.media);
    }
    const wanted = collection === "liked" ? "like" : "dislike";
    return Object.values(reactions)
      .filter((entry) => entry.value === wanted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => entry.media);
  }, [collection, watched, reactions]);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-5 pb-8 pt-24 sm:px-6 md:px-12">
      <Link
        href="/my-list"
        className="nm-raise-sm inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-muted transition hover:text-text"
      >
        <ArrowLeftIcon size={16} />
        My List
      </Link>

      <div className="mt-8 flex items-center gap-4">
        <div className="nm-raise-sm grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-text md:h-[72px] md:w-[72px]">
          <Icon size={28} />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-4xl uppercase leading-none tracking-wider text-text md:text-5xl">
            {config.title}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {items.length} {items.length === 1 ? "title" : "titles"} ·{" "}
            {config.hint}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="nm-inset mt-8 rounded-2xl px-6 py-14 md:py-16">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="nm-raise-sm grid h-16 w-16 place-items-center rounded-2xl text-text">
              <Icon size={28} />
            </div>
            <h2 className="mt-6 font-display text-3xl uppercase tracking-wide text-text">
              Nothing here yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              {config.empty}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/movies" className="btn-ghost h-10 px-4 py-0 text-sm">
                <ClapperboardIcon size={16} />
                Browse Movies
              </Link>
              <Link href="/search" className="btn-ghost h-10 px-4 py-0 text-sm">
                <SearchIcon size={16} />
                Search
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {items.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              watched={watched[item.id] !== undefined}
              inWatchlist={watchlistIds.has(item.id)}
              onAddToList={(anchor) => setAddItem({ item, anchor })}
              onToggleWatched={() => toggleWatched(item)}
            />
          ))}
        </div>
      )}

      {addItem && (
        <AddToListDialog
          item={addItem.item}
          anchor={addItem.anchor}
          onClose={() => setAddItem(null)}
        />
      )}
    </div>
  );
}
