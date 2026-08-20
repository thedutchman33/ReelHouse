"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Shared popover plumbing.
//
// Every menu in the UI (account menu, filter dropdowns, provider selector) needs
// the same three behaviours: close on outside pointerdown, close on Escape with
// focus returned to the trigger, and a ref to hang the "inside" test on. This
// keeps that logic in one place instead of once per menu.
//
// Escape is captured (capture phase + stopPropagation) so a menu open inside the
// player swallows the key instead of also exiting fullscreen.
// ---------------------------------------------------------------------------

export interface Popover<T extends HTMLElement> {
  open: boolean;
  /** Wrap the trigger + panel: an outside pointerdown closes the popover. */
  rootRef: React.RefObject<T | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  toggle: () => void;
  /** `refocus` returns focus to the trigger — use it for keyboard dismissals. */
  close: (refocus?: boolean) => void;
  setOpen: (open: boolean) => void;
}

export function usePopover<T extends HTMLElement = HTMLDivElement>(): Popover<T> {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<T>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return { open, rootRef, triggerRef, toggle, close, setOpen };
}

/** Roving focus for a menu/listbox: ArrowUp/Down/Home/End over its items. */
export function rovingKeyDown(
  e: React.KeyboardEvent,
  items: HTMLElement[]
): void {
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const focus = (next: number) => {
    e.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  };
  if (e.key === "ArrowDown") focus(index + 1);
  else if (e.key === "ArrowUp") focus(index - 1);
  else if (e.key === "Home") focus(0);
  else if (e.key === "End") focus(items.length - 1);
}
