"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { CricketPlayer } from "@/lib/cricket/types";
import { PlayerAvatar } from "./ui";

export default function PlayerPicker({
  label,
  value,
  players,
  onChange,
  placeholder = "Search player",
  excludeId,
  accent = "#8fb4ec",
  hideLabel = false,
}: {
  label: string;
  value: string;
  players: CricketPlayer[];
  onChange: (gid: string) => void;
  placeholder?: string;
  excludeId?: string;
  accent?: string;
  /** The surrounding card already prints the label. */
  hideLabel?: boolean;
}) {
  const listId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = players.find((player) => player.id === value) ?? null;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return players
      .filter((player) => player.id !== excludeId)
      .filter((player) => !search || player.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, query, excludeId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, filtered.findIndex((player) => player.id === value)));
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
    // Only react to opening; typing must not steal the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (player: CricketPlayer) => {
    onChange(player.id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && filtered[active]) pick(filtered[active]);
      else setOpen(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative min-w-0">
      {!hideLabel && (
        <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.18em] text-white/40">
          {label}
        </p>
      )}
      <div
        className={`field h-11 w-full border-white/10 bg-black/30 transition ${
          open ? "border-[#8fb4ec]/60 shadow-[0_0_0_3px_rgb(63_120_216/0.14)]" : ""
        }`}
        style={open ? { borderColor: `${accent}99` } : undefined}
      >
        {selected ? (
          <PlayerAvatar
            player={selected}
            colour={selected.accent ?? null}
            size={26}
            className="ring-1 ring-[#8fb4ec]/30"
          />
        ) : (
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4 shrink-0 text-white/30"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            aria-hidden="true"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l4 4" strokeLinecap="round" />
          </svg>
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : selected?.name ?? ""}
          placeholder={selected ? selected.name : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="bg-transparent text-[14px] font-medium text-white placeholder:text-white/25"
        />
        <span
          aria-hidden="true"
          className={`ml-auto shrink-0 text-[#8fb4ec] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-40 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#8fb4ec]/25 bg-[#0a162b]/98 p-1 shadow-[0_22px_60px_-12px_rgb(0_0_0/0.9)] backdrop-blur-md ck-scroll"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-white/40">No players match “{query}”.</p>
          ) : (
            filtered.map((player, index) => {
              const activeRow = index === active;
              const isSelected = player.id === value;
              return (
                <button
                  key={player.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(player)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    activeRow ? "bg-[#1d509e]/35" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <PlayerAvatar player={player} colour={player.accent ?? null} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-white">
                      {player.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-white/40">
                      {player.role}
                      {player.grade ? ` · Grade ${player.grade}` : ""}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8fb4ec]">
                      Selected
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
