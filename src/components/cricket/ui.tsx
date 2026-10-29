"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import localFont from "next/font/local";
import type { CricketPlayer, CricketTeam } from "@/lib/cricket/types";

// The dialog is portaled out of `.cricket-page`, so it has to carry the section's
// display face itself. Same file the page and navbar load; the browser reuses
// the cached font.
const modalCricketFont = localFont({
  src: "../../app/fonts/India2023-Bold.ttf",
  weight: "700",
  style: "normal",
  variable: "--font-cricket",
  display: "swap",
});

export function SectionHeading({
  id,
  eyebrow,
  title,
  accent,
  right,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  accent?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-white/45">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec] shadow-[0_0_6px_rgb(143_180_236/0.8)]" />
          {eyebrow}
        </p>
        <h2
          id={id}
          className="mt-1 font-f1 text-2xl font-bold uppercase leading-none tracking-wide text-white md:text-3xl"
        >
          {title} {accent && <span className="text-[#8fb4ec]">{accent}</span>}
        </h2>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

export function TeamBadge({
  team,
  size = "md",
}: {
  team: Pick<CricketTeam, "name" | "abbreviation" | "primary" | "secondary">;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dims = {
    sm: "h-6 w-6 text-[8px]",
    md: "h-9 w-9 text-[11px]",
    lg: "h-12 w-12 text-xs",
    xl: "h-16 w-16 text-sm sm:h-20 sm:w-20 sm:text-base",
  }[size];
  return (
    <span
      role="img"
      aria-label={`${team.name} badge`}
      className={`relative grid shrink-0 place-items-center rounded-full font-bold tracking-[0.04em] text-white ring-1 ring-white/20 ${dims}`}
      style={{
        background: `linear-gradient(145deg, ${team.primary}, ${team.primary} 52%, ${team.secondary})`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.22), 0 4px 14px rgb(0 0 0 / 0.45)",
      }}
    >
      <span aria-hidden="true" className="absolute inset-[3px] rounded-full border border-white/20" />
      <span className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">{team.abbreviation}</span>
    </span>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  /** Second line in the list — a role, series, date or team code. */
  hint?: string;
  /** Portrait, flag or badge shown before the label. */
  leading?: ReactNode;
}

/**
 * Listbox select with the same rich rows as the player pickers (portrait or
 * flag, name, role) instead of the browser's native option menu.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  disabled,
  compact = false,
  align = "left",
  placeholder = "Select",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  compact?: boolean;
  align?: "left" | "right";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!options.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : Math.max(0, options.length - 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  return (
    <label className="inline-flex min-w-0 items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/40">
      {!compact && <span className="shrink-0">{label}</span>}
      <div ref={wrapRef} className="relative min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
          className="relative flex h-10 w-full min-w-[7.5rem] items-center gap-2 rounded-lg border border-[#8fb4ec]/20 bg-[linear-gradient(180deg,#102141,#0a162b)] pl-3 pr-10 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_4px_14px_rgb(0_0_0/0.28)] transition-colors duration-200 hover:border-[#8fb4ec]/45 hover:bg-[linear-gradient(180deg,#15305a,#0d1d3a)] focus-visible:border-[#8fb4ec]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fb4ec]/40 disabled:cursor-wait disabled:opacity-50"
        >
          {selected?.leading && <span className="shrink-0">{selected.leading}</span>}
          <span
            className={`min-w-0 flex-1 truncate text-[13.5px] font-medium tracking-normal ${
              selected ? "text-white" : "text-white/45"
            }`}
          >
            {selected?.label ?? placeholder}
          </span>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute right-1.5 grid h-7 w-7 place-items-center rounded-md bg-[#8fb4ec]/10 text-[#b9d7ff] ring-1 ring-inset ring-[#8fb4ec]/10 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M19 9l-7 7l-7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {open && (
          <div
            id={listId}
            role="listbox"
            aria-label={`${label} options`}
            className={`absolute z-50 mt-1.5 max-h-72 w-max min-w-full max-w-[min(22rem,calc(100vw-5rem))] overflow-y-auto rounded-xl border border-[#8fb4ec]/25 bg-[#0a162b]/[0.98] p-1 shadow-[0_22px_60px_-12px_rgb(0_0_0/0.9)] backdrop-blur-md ck-scroll ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {options.length === 0 ? (
              <p className="px-3 py-4 text-[13px] text-white/40">No options available.</p>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === active;
                return (
                  <button
                    key={option.value}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isActive ? "bg-[#1d509e]/35" : isSelected ? "bg-[#1d509e]/18" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    {option.leading && <span className="shrink-0">{option.leading}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-white">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-[11.5px] text-white/40">{option.hint}</span>
                      )}
                    </span>
                    {isSelected && (
                      <svg
                        viewBox="0 0 20 20"
                        className="h-4 w-4 shrink-0 text-[#8fb4ec]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        aria-hidden="true"
                      >
                        <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </label>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center">
      <p className="font-f1 text-sm font-bold uppercase tracking-[0.08em] text-white/75">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-white/45">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PlayerAvatar({
  player,
  fallbackImageUrl = null,
  colour = null,
  size = 44,
  className = "",
}: {
  player: Pick<CricketPlayer, "name" | "imageUrl">;
  /** Official ICC portrait to try when the BCCI asset is only its silhouette. */
  fallbackImageUrl?: string | null;
  /** Team jersey colour behind the portrait; the monogram uses it too. */
  colour?: string | null;
  size?: number;
  className?: string;
}) {
  const fallback =
    fallbackImageUrl && fallbackImageUrl !== player.imageUrl ? fallbackImageUrl : null;
  const [src, setSrc] = useState<string | null>(player.imageUrl ?? fallback);
  const [failed, setFailed] = useState(false);
  const initials = player.name
    .split(/\s+/)
    .slice(0, size < 20 ? 1 : 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    setSrc(player.imageUrl ?? fallback);
    setFailed(false);
  }, [player.imageUrl, fallback]);

  // Callers that want a rounded card pass their own radius; the default circle
  // is omitted rather than fought with CSS ordering.
  const radius = className.includes("rounded-") ? "" : "rounded-full";
  const background = colour
    ? { backgroundImage: `linear-gradient(150deg, ${colour}, #0a1425 165%)` }
    : undefined;

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-[linear-gradient(145deg,#1d509e,#0b1730)] font-f1 font-bold leading-none text-white ${radius} ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.3), ...background }}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden border border-white/15 bg-[#0b1730] ${radius} ${className}`}
      style={{ width: size, height: size, ...background }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={player.name}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (fallback && src !== fallback) setSrc(fallback);
          else setFailed(true);
        }}
        className="h-full w-full object-cover object-top"
      />
    </span>
  );
}

export function Modal({
  open,
  onClose,
  labelledBy,
  eyebrow = "Player",
  size = "lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  eyebrow?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const closeCb = useRef(onClose);
  closeCb.current = onClose;
  const fallbackId = useId();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCb.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previous;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className={`ck-modal-root ${modalCricketFont.variable} fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:px-6 sm:pb-6 sm:pt-24`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || fallbackId}
        className={`f1-card max-h-[88vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl sm:max-h-[calc(100vh-8rem)] sm:rounded-2xl ${
          size === "sm" ? "sm:max-w-md" : size === "md" ? "sm:max-w-xl" : "sm:max-w-2xl"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#111116]/95 px-4 py-3 backdrop-blur">
          <span className="font-f1 text-[12px] font-bold uppercase tracking-[0.2em] text-white/45">{eyebrow}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/30 text-white/60 transition hover:border-white/30 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );

  // The cricket page wrapper is `isolate`, so a fixed dialog rendered inside it
  // is trapped in that stacking context — and the footer (z-10, root context)
  // would paint straight over it at the end of the page. Portaling to <body>
  // puts the dialog back at the root, above the footer and the navbar.
  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
