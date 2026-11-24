"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog } from "@/lib/library";

export type CatalogDialogState =
  | { mode: "create"; addItem?: import("@/types").MediaSummary }
  | { mode: "rename"; catalog: Catalog }
  | { mode: "delete"; catalog: Catalog };

/**
 * One dialog for the three catalog mutations, styled on the reference's
 * neumorphic glass panel. The parent owns the state and closes on success, so
 * an empty/duplicate submission can be rejected without losing the input.
 */
export default function CatalogDialog({
  state,
  onClose,
  onSubmit,
  onDelete,
}: {
  state: CatalogDialogState;
  onClose: () => void;
  onSubmit: (name: string) => void;
  onDelete: () => void;
}) {
  const isDelete = state.mode === "delete";
  const initialName = state.mode === "rename" ? state.catalog.name : "";
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(initialName);
    if (!isDelete) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [initialName, isDelete, state.mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = isDelete
    ? "Delete catalog?"
    : state.mode === "rename"
      ? "Rename catalog"
      : "New catalog";
  const canSubmit = name.trim().length > 0;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="rh-overlay fixed inset-0 z-[140] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isDelete) onDelete();
          else if (canSubmit) onSubmit(name);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-dialog-title"
        className="nm-glass rh-modal w-full max-w-md rounded-2xl border border-white/10 p-5 shadow-2xl"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
          Catalogs
        </p>
        <h2
          id="catalog-dialog-title"
          className="mt-1 font-display text-2xl uppercase tracking-wide text-text"
        >
          {title}
        </h2>

        {isDelete ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            “{state.catalog.name}” will be deleted. Its {state.catalog.items.length}{" "}
            {state.catalog.items.length === 1 ? "title" : "titles"} stay in your Watchlist
            and history.
          </p>
        ) : (
          <>
            <label
              htmlFor="catalog-name"
              className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted"
            >
              Name
            </label>
            <input
              ref={inputRef}
              id="catalog-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Friday Night"
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-text outline-none transition placeholder:text-muted/60 focus:border-accent/60"
            />
            <p className="mt-1.5 text-[11px] text-muted">{name.trim().length}/40</p>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost h-10 px-4 py-0 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isDelete && !canSubmit}
            className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isDelete
                ? "bg-danger text-white hover:bg-danger/85"
                : "bg-accent text-accent-ink hover:bg-accent-strong"
            }`}
          >
            {isDelete ? "Delete" : state.mode === "rename" ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
