"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon, SearchIcon, StarIcon } from "@/components/player/icons";
import PosterImage from "@/components/media/PosterImage";
import type { MediaSummary } from "@/types";


function ClockMark({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

// Recent-search history, persisted locally. Deduped, trimmed, capped.
const RECENT_KEY = "rh-recent-searches";
const RECENT_MAX = 6;

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* storage unavailable — history is best-effort */
  }
}

function rememberSearch(query: string): string[] {
  const q = query.trim().slice(0, 80);
  if (!q) return loadRecent();
  const next = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())];
  saveRecent(next);
  return next;
}

function resultHref(item: MediaSummary): string {
  // Anime results carry AniList ids and route into the anime section.
  return `/${item.type}/${item.tmdbId}`;
}

type Status = "idle" | "loading" | "done" | "error";

// Full search overlay (reference pattern): a large centered panel over a dimmed
// page, with RECENT chips and a TRENDING seed list when idle, and live results
// while typing. Enter goes to the full /search page; Esc closes.
export default function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[]>([]);
  const [trending, setTrending] = useState<MediaSummary[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();

  // Reset per open; capture focus to restore on close; seed trending once.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setResults([]);
    setStatus("idle");
    setRecent(loadRecent());
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/search/trending");
        const data = (await res.json()) as { results?: MediaSummary[] };
        if (alive) setTrending(data.results ?? []);
      } catch {
        /* idle seed is best-effort */
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [open]);

  // Esc closes; focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  // Debounced live results against the existing search API.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as { results: MediaSummary[] };
        setResults(data.results ?? []);
        setStatus("done");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, open]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setRecent(rememberSearch(q));
    go(`/search?q=${encodeURIComponent(q)}`);
  };

  const listItems = status === "idle" ? trending : results;
  const showRecent = status === "idle" && recent.length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] animate-fade-in overflow-y-auto bg-black/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search movies and series"
        className="mx-auto mt-[8vh] w-[calc(100%-2rem)] max-w-2xl"
      >
        {/* Input panel */}
        <form onSubmit={submit} role="search">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl transition-colors focus-within:border-accent/40">
            <div className="flex h-16 items-center gap-3 px-4">
              <SearchIcon size={22} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies & TV shows..."
                aria-label="Search movies and series"
                className="h-full w-full min-w-0 bg-transparent text-lg text-text placeholder:text-muted/80 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close search"
                className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-white/5 hover:text-text"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <p className="px-[4.25rem] pb-3 text-xs text-muted/70">
              Press Enter to see all results
            </p>
          </div>
        </form>

        {/* Results panel — visually connected below the input. Scrollbar is
            hidden like every rail in the design system; wheel/touch still scroll. */}
        <div className="no-scrollbar mt-3 max-h-[62vh] overflow-y-auto rounded-xl border border-white/10 bg-surface/95 p-3 shadow-2xl">
          {showRecent && (
            <section aria-label="Recent searches" className="mb-2">
              <div className="flex items-center justify-between px-1">
                <p className="eyebrow !text-[10px]">Recent</p>
                <button
                  type="button"
                  onClick={() => {
                    saveRecent([]);
                    setRecent([]);
                  }}
                  className="text-xs font-semibold text-muted transition hover:text-text"
                >
                  Clear
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pl-2.5 pr-1.5 text-sm text-text/90"
                  >
                    <ClockMark className="shrink-0 text-muted" />
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(r);
                        inputRef.current?.focus();
                      }}
                      className="max-w-[12rem] truncate"
                    >
                      {r}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = recent.filter((x) => x !== r);
                        setRecent(next);
                        saveRecent(next);
                      }}
                      aria-label={`Remove recent search ${r}`}
                      className="rounded p-0.5 text-muted transition hover:text-text"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          <p className="eyebrow mb-1 flex items-center gap-1.5 px-1 !text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="text-accent">
              <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {status === "idle" ? "Trending" : "Results"}
          </p>

          {status === "idle" && listItems.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Type to search, or pick a trending title.
            </p>
          )}
          {status === "loading" && (
            <p className="px-3 py-8 text-center text-sm text-muted">Searching…</p>
          )}
          {status === "error" && (
            <p className="px-3 py-8 text-center text-sm text-danger">
              Something went wrong. Try again.
            </p>
          )}
          {status === "done" && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              No results for “{query.trim()}”.
            </p>
          )}

          {listItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(resultHref(item))}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-white/5"
            >
              <span className="relative block h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
                <PosterImage
                  src={item.posterUrl}
                  title={item.title}
                  type={item.type}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-text">
                  {item.title}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                  {(item.releaseDate ?? "").slice(0, 4) || "—"}
                  {typeof item.rating === "number" && (
                    <span className="flex items-center gap-1 font-semibold text-amber-400">
                      <StarIcon size={11} />
                      {item.rating.toFixed(1)}
                    </span>
                  )}
                  <span className="uppercase tracking-wide">{item.type === "tv" ? "TV" : item.type === "anime" ? "Anime" : "Movie"}</span>
                </span>
              </span>
            </button>
          ))}

          {status === "idle" && listItems.length > 0 && (
            <p className="px-2 pt-2 text-center text-xs text-muted/60">
              Results are live — type to search the full catalog.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
