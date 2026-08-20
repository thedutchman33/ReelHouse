"use client";

import { useEffect, useRef } from "react";
import { CheckIcon, ChevronRightIcon, SourceIcon } from "@/components/player/icons";
import type { ProviderDescriptor } from "@/lib/playback/types";
import { rovingKeyDown, usePopover } from "@/lib/use-popover";

// ---------------------------------------------------------------------------
// Provider (source) selector.
//
// Lists the providers the operator has actually configured, in priority order —
// nothing else. Unconfigured slots never appear, so the UI cannot advertise a
// provider that does not exist, and internal slot ids (provider-1 …) are never
// shown: every label comes from that slot's own configured display name.
//
// A configured slot that cannot serve THIS title stays visible but disabled with
// the reason, so a misconfiguration is diagnosable from the UI instead of
// silently vanishing.
//
// Reelhouse's own built-in surface is not a provider and is filtered out here as
// well as upstream (see lib/providers#getPlaybackPlan).
//
// Manual switching is always available. It is intentionally the ONLY switch path
// for providers that cannot report their own failures.
// ---------------------------------------------------------------------------

/** Focusable option buttons, in DOM order. */
function optionButtons(list: HTMLElement | null): HTMLButtonElement[] {
  if (!list) return [];
  return Array.from(
    list.querySelectorAll<HTMLButtonElement>('button[role="option"]:not([disabled])')
  );
}

export default function ProviderSelector({
  providers,
  selectedId,
  onSelect,
}: {
  providers: ProviderDescriptor[];
  selectedId: string;
  onSelect: (providerId: string) => void;
}) {
  const { open, rootRef, triggerRef, toggle, close, setOpen } = usePopover();
  const listRef = useRef<HTMLUListElement>(null);

  // Move focus into the list on open, starting from the active provider.
  useEffect(() => {
    if (!open) return;
    const buttons = optionButtons(listRef.current);
    const active = buttons.find((b) => b.dataset.providerId === selectedId);
    (active ?? buttons[0])?.focus();
  }, [open, selectedId]);

  // Providers only — the built-in surface is never offered as a choice.
  const listed = providers.filter((p) => !p.isBuiltIn);
  if (listed.length === 0) return null;

  const selected = listed.find((p) => p.id === selectedId);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change playback provider"
        className={`inline-flex max-w-[70vw] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur transition ${
          open
            ? "border-accent/50 bg-surface text-text"
            : "border-border bg-surface/85 text-text hover:border-accent/40 hover:bg-surface"
        }`}
      >
        <SourceIcon size={15} className="shrink-0 text-accent" />
        <span className="truncate">{selected?.displayName ?? "Select provider"}</span>
        <ChevronRightIcon
          size={14}
          className={`shrink-0 text-muted transition ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {open && (
        <div className="panel absolute left-1/2 top-full z-10 mt-2 w-72 max-w-[86vw] -translate-x-1/2">
          <p className="panel-label border-b border-border/70">Provider</p>
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Playback providers"
            onKeyDown={(e) => rovingKeyDown(e, optionButtons(listRef.current))}
            className="no-scrollbar max-h-72 overflow-y-auto p-1.5"
          >
            {listed.map((p) => {
              const active = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    data-provider-id={p.id}
                    aria-selected={active}
                    disabled={!p.available}
                    onClick={() => {
                      onSelect(p.id);
                      close(true);
                    }}
                    className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition ${
                      active
                        ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/30"
                        : p.available
                          ? "text-text hover:bg-surface-2"
                          : "cursor-not-allowed text-muted"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {p.displayName}
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-xs ${
                          active ? "text-accent/80" : "text-muted"
                        }`}
                      >
                        {p.available
                          ? p.surface === "embed"
                            ? "Provider's own player"
                            : "Reelhouse player"
                          : (p.unavailableReason ?? "Unavailable")}
                      </span>
                    </span>
                    {active && <CheckIcon size={16} className="mt-0.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
