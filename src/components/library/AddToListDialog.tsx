"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BellIcon,
  CheckIcon,
  PlusIcon,
  XIcon,
} from "@/components/library/icons";
import {
  addToCatalog,
  createCatalog,
  toggleCatalogItem,
  toggleTracked,
  toggleWatchlist,
  useCatalogs,
  useIsInWatchlist,
  useTracked,
  useWatchlist,
} from "@/lib/library";
import type { MediaSummary } from "@/types";

const PANEL_WIDTH = 260;
const ESTIMATED_HEIGHT = 260;
const ANCHOR_GAP = 6;
const VIEWPORT_EDGE = 8;
const SCROLL_CLOSE_DISTANCE = 48;

function ListRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/5"
    >
      <span
        aria-hidden="true"
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked ? "border-accent bg-accent text-black" : "border-white/20"
        }`}
      >
        {checked && <CheckIcon size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
        {label}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted">
        {count}
      </span>
    </button>
  );
}

function TrackSeriesRow({
  tracked,
  onToggle,
}: {
  tracked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={tracked}
      aria-label={tracked ? "Stop tracking series" : "Track series"}
      className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          tracked
            ? "border-accent bg-accent text-accent-ink"
            : "border-white/25 text-white/70"
        }`}
      >
        {tracked ? (
          <CheckIcon size={12} strokeWidth={2.6} />
        ) : (
          <BellIcon size={12} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">
          Track series
        </span>
        <span className="block text-[11px] text-white/45">
          New episodes in Calendar → Tracking
        </span>
      </span>
    </button>
  );
}

/**
 * Reference Add to list popover. It opens against the card's add button,
 * lists every collection, and exposes the TV-only tracking action that feeds
 * the calendar. A title can belong to the Watchlist and any number of custom
 * catalogs at once; every row writes through the shared library store.
 */
export default function AddToListDialog({
  item,
  anchor,
  onClose,
}: {
  item: MediaSummary;
  /** The button that opened the popover; positions it and restores focus. */
  anchor?: HTMLElement | null;
  onClose: () => void;
}) {
  const catalogs = useCatalogs();
  const watchlist = useWatchlist();
  const inWatchlist = useIsInWatchlist(item.id);
  const tracked = useTracked();
  const isTracked = tracked.some((entry) => entry.media.id === item.id);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const updatePosition = () => {
      const panelHeight = panelRef.current?.offsetHeight || ESTIMATED_HEIGHT;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;

      if (!anchor || !anchor.isConnected) {
        if (!anchor) {
          const left = Math.round((viewportWidth - PANEL_WIDTH) / 2);
          const top = Math.round((viewportHeight - panelHeight) / 2);
          setPosition((current) =>
            current?.left === left && current.top === top
              ? current
              : { top, left }
          );
          return;
        }
        onCloseRef.current();
        return;
      }

      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        onCloseRef.current();
        return;
      }

      let left = rect.left;
      if (left + PANEL_WIDTH > viewportWidth - VIEWPORT_EDGE) {
        left = viewportWidth - PANEL_WIDTH - VIEWPORT_EDGE;
      }
      if (left < VIEWPORT_EDGE) left = VIEWPORT_EDGE;

      let top = rect.bottom + ANCHOR_GAP;
      if (top + panelHeight > viewportHeight - VIEWPORT_EDGE) {
        top = rect.top - panelHeight - ANCHOR_GAP;
      }
      if (top < VIEWPORT_EDGE) top = VIEWPORT_EDGE;
      if (top + panelHeight > viewportHeight - VIEWPORT_EDGE) {
        top = Math.max(VIEWPORT_EDGE, viewportHeight - panelHeight - VIEWPORT_EDGE);
      }

      const next = { top: Math.round(top), left: Math.round(left) };
      setPosition((current) =>
        current?.top === next.top && current.left === next.left
          ? current
          : next
      );
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (panelRef.current) resizeObserver?.observe(panelRef.current);

    const startScrollY = window.scrollY;
    const handleScroll = () => {
      if (Math.abs(window.scrollY - startScrollY) > SCROLL_CLOSE_DISTANCE) {
        onCloseRef.current();
      }
    };
    const handleResize = () => updatePosition();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    const anchorCheck = window.setInterval(() => {
      if (anchor && !anchor.isConnected) onCloseRef.current();
    }, 400);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      window.clearInterval(anchorCheck);
    };
  }, [anchor]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const getFocusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") && element.offsetParent !== null
      );

    const focusFrame = window.requestAnimationFrame(() => {
      const initial =
        panel.querySelector<HTMLElement>("button[aria-pressed]") ??
        getFocusable()[0];
      initial?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      const active = document.activeElement;
      if (
        anchor?.isConnected &&
        (!active || active === document.body || panel.contains(active))
      ) {
        anchor.focus();
      }
    };
  }, [anchor]);

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    const id = createCatalog(name);
    if (!id) return;
    addToCatalog(id, item);
    setName("");
    setCreating(false);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[299]"
        onClick={() => onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`Add ${item.title} to a list`}
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          width: PANEL_WIDTH,
          visibility: position ? "visible" : "hidden",
        }}
        // Portaled to <body>, so the page's red-accent scope cannot reach it —
        // carry the scope on the panel itself.
        className="red-accent add-to-list-sheet nm-glass fixed z-[300] flex max-h-[min(340px,72vh)] animate-fade-in flex-col overflow-hidden rounded-[12px]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Add to list
            </p>
            <h2
              id="add-to-list-title"
              className="truncate text-[13px] font-semibold text-text"
            >
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-white/10 hover:text-text"
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {item.type === "tv" && (
            <div className="mb-1 border-b border-white/[0.08] pb-1">
              <TrackSeriesRow
                tracked={isTracked}
                onToggle={() => toggleTracked(item)}
              />
            </div>
          )}

          <ListRow
            label="Watchlist"
            count={watchlist.length}
            checked={inWatchlist}
            onToggle={() => toggleWatchlist(item)}
          />
          {catalogs.map((catalog) => (
            <ListRow
              key={catalog.id}
              label={catalog.name}
              count={catalog.items.length}
              checked={catalog.items.some((saved) => saved.id === item.id)}
              onToggle={() => toggleCatalogItem(catalog.id, item)}
            />
          ))}
        </div>

        <div className="border-t border-white/[0.08] p-1.5">
          {creating ? (
            <div className="flex items-center gap-1.5">
              <label htmlFor="new-list-name" className="sr-only">
                List name
              </label>
              <input
                id="new-list-name"
                autoFocus
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCreate();
                  } else if (event.key === "Escape") {
                    event.stopPropagation();
                    setCreating(false);
                    setName("");
                  }
                }}
                placeholder="List name"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-white/5 px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted/60 focus:border-accent/50"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[13px] font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-40"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-white/5"
            >
              <PlusIcon size={16} />
              New list
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
