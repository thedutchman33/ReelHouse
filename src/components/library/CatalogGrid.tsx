"use client";

import { FolderIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/library/icons";
import { catalogKey, type CollectionKey } from "@/components/library/types";
import PosterImage from "@/components/media/PosterImage";
import type { Catalog } from "@/lib/library";
import type { MediaSummary } from "@/types";

// Reference Catalogs block: a virtual Watchlist tile, the user's folders, and
// the Create Catalog tile. The tile shows the first saved poster behind a dark
// overlay; edit/delete controls appear on hover (and stay visible while the
// section's Edit toggle is on).
function CatalogTile({
  name,
  items,
  selected,
  editing,
  onSelect,
  onRename,
  onDelete,
  delay,
}: {
  name: string;
  items: MediaSummary[];
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  delay: number;
}) {
  const reveal = `hover-reveal ${editing ? "!pointer-events-auto !opacity-100" : ""}`;
  const cover = items[0];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${name} — ${items.length} saved`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative w-full cursor-pointer animate-fade-in text-left transition-transform duration-300 hover:-translate-y-1 ${
        selected
          ? "rounded-xl ring-1 ring-accent/70 ring-offset-2 ring-offset-bg"
          : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="nm-raise-sm relative aspect-[2/3] overflow-hidden rounded-xl">
        {cover && (
          <>
            <PosterImage
              src={cover.posterUrl}
              title={cover.title}
              type={cover.type}
              className="absolute inset-0 h-full w-full object-cover opacity-40"
              sizes="(min-width: 1280px) 230px, 30vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/65 to-black/35" />
          </>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="nm-raise-sm flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105">
            <FolderIcon size={30} className="text-white/75" />
          </div>
        </div>

        <div className="absolute inset-x-2 bottom-2">
          <p className="truncate text-sm font-semibold text-text">{name}</p>
          <p className="mt-1 text-xs text-muted">{items.length} saved</p>
        </div>

        {onRename && (
          <button
            type="button"
            aria-label={`Edit ${name}`}
            title="Rename catalog"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className={`${reveal} absolute left-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-black/[0.45] text-white/85 transition-all hover:bg-accent hover:text-white`}
          >
            <PencilIcon size={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label={`Delete ${name}`}
            title="Delete catalog"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={`${reveal} absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-black/[0.45] text-white/85 transition-all hover:bg-danger hover:text-white`}
          >
            <TrashIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function CatalogGrid({
  catalogs,
  watchlistItems,
  watchlistSelected,
  selectedKey,
  editing,
  onToggleEditing,
  onSelectWatchlist,
  onSelectCatalog,
  onCreate,
  onRename,
  onDelete,
}: {
  catalogs: Catalog[];
  watchlistItems: MediaSummary[];
  watchlistSelected: boolean;
  selectedKey: CollectionKey;
  editing: boolean;
  onToggleEditing: () => void;
  onSelectWatchlist: () => void;
  onSelectCatalog: (catalog: Catalog) => void;
  onCreate: () => void;
  onRename: (catalog: Catalog) => void;
  onDelete: (catalog: Catalog) => void;
}) {
  return (
    <section aria-labelledby="catalogs-label" className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p
          id="catalogs-label"
          className="text-xs font-semibold uppercase tracking-[0.3em] text-muted"
        >
          Catalogs
        </p>
        <button
          type="button"
          onClick={onToggleEditing}
          aria-pressed={editing}
          className={`nm-raise-sm rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] transition hover:text-text ${
            editing ? "text-accent" : "text-muted"
          }`}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        <CatalogTile
          name="Watchlist"
          items={watchlistItems}
          selected={watchlistSelected}
          editing={editing}
          onSelect={onSelectWatchlist}
          delay={0}
        />
        {catalogs.map((catalog, index) => (
          <CatalogTile
            key={catalog.id}
            name={catalog.name}
            items={catalog.items}
            selected={selectedKey === catalogKey(catalog.id)}
            editing={editing}
            onSelect={() => onSelectCatalog(catalog)}
            onRename={() => onRename(catalog)}
            onDelete={() => onDelete(catalog)}
            delay={50 + index * 50}
          />
        ))}

        <button
          type="button"
          onClick={onCreate}
          className="group relative w-full cursor-pointer animate-fade-in text-left"
          style={{ animationDelay: `${50 + catalogs.length * 50}ms` }}
        >
          <div className="nm-inset relative aspect-[2/3] overflow-hidden rounded-xl">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="nm-raise-sm flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105">
                <PlusIcon size={30} className="text-muted" />
              </div>
            </div>
            <div className="absolute inset-x-2 bottom-2">
              <p className="truncate text-sm font-semibold text-text">Create Catalog</p>
              <p className="mt-1 text-xs text-muted">Start a new folder</p>
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
