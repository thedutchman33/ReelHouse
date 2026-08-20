"use client";

import { useEffect, useRef, useState } from "react";
import MediaGrid from "@/components/media/MediaGrid";
import { GridSkeleton } from "@/components/common/Skeleton";
import { CloseIcon, SearchIcon } from "@/components/player/icons";
import type { MediaSummary } from "@/types";

type Status = "idle" | "loading" | "done" | "error";

const SUGGESTIONS = ["Sci-Fi", "Thriller", "Drama", "Comedy", "Fantasy", "Crime"];

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MediaSummary[]>([]);
  const [status, setStatus] = useState<Status>(initialQuery ? "loading" : "idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
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
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as { results: MediaSummary[] };
        setResults(data.results ?? []);
        setStatus("done");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  return (
    <div className="container-rh py-8">
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Search</h1>
      <p className="mb-5 text-sm text-muted">
        Look up any film or series by title, or browse by genre.
      </p>

      {/* Same .field shell as the navbar search, so both inputs share one look
          and one gold focus treatment. */}
      <div className="field h-12 max-w-2xl">
        <span className="shrink-0 text-muted">
          <SearchIcon size={18} />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies, series, genres…"
          aria-label="Search movies and series"
          className="w-full min-w-0 bg-transparent text-base text-text placeholder:text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-1 text-muted transition hover:text-text"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>

      <div className="mt-8">
        {status === "idle" && (
          <div className="py-10 text-center">
            <p className="text-muted">Find something to watch. Try a title or a genre.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="chip transition hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {status === "loading" && <GridSkeleton count={12} />}

        {status === "error" && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
            <p className="text-lg font-semibold text-text">Something went wrong</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              We couldn&apos;t complete that search.
            </p>
            <button type="button" onClick={() => setQuery((q) => `${q} `)} className="btn-ghost mt-6">
              Try again
            </button>
          </div>
        )}

        {status === "done" && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
            <p className="text-lg font-semibold text-text">No results for “{query.trim()}”</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Check the spelling, or try a different title or genre.
            </p>
          </div>
        )}

        {status === "done" && results.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted">
              {results.length} result{results.length > 1 ? "s" : ""} for “{query.trim()}”
            </p>
            <MediaGrid items={results} />
          </>
        )}
      </div>
    </div>
  );
}
